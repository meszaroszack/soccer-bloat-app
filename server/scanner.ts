import { store } from "./storage";
import {
  fetchAllSportsMarkets,
  buildNormalizedEvent,
} from "./kalshi";
import { routeSignal } from "./bot";
import {
  runAllStrategies,
  computeCompositeScore,
  getPerplexityScore,
} from "./strategies";
import {
  recordOpeningSnapshot,
  maybeUpdateDriftFromEvent,
} from "./openingTracker";
import { shouldRunDailyReport, generateDailyReport } from "./perplexity";
import type {
  NormalizedEvent,
  Signal,
  DailyOpportunity,
  StrategyResult,
  HeatmapReason,
} from "../shared/types";

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let isScanning = false;

interface ScannerHealth {
  running: boolean;
  lastScanAt: Date | null;
  nextScanAt: Date | null;
  rawMarketCount: number;
  normalizedEventCount: number;
  groupedEventCount: number;
  signalCount: number;
  errorCount: number;
  lastError: string | null;
  recentErrors: Array<{ time: Date; message: string }>;
}

export const scannerStatus: ScannerHealth = {
  running: false,
  lastScanAt: null,
  nextScanAt: null,
  rawMarketCount: 0,
  normalizedEventCount: 0,
  groupedEventCount: 0,
  signalCount: 0,
  errorCount: 0,
  lastError: null,
  recentErrors: [],
};

function addError(msg: string) {
  scannerStatus.lastError = msg;
  scannerStatus.errorCount++;
  scannerStatus.recentErrors.unshift({ time: new Date(), message: msg });
  if (scannerStatus.recentErrors.length > 20) {
    scannerStatus.recentErrors = scannerStatus.recentErrors.slice(0, 20);
  }
  console.error("[scanner]", msg);
}

function flattenHeatmap(results: StrategyResult[]): HeatmapReason[] {
  const out: HeatmapReason[] = [];
  for (const r of results) {
    for (const h of r.heatmapReasons) {
      out.push({ key: `${r.strategyKey}:${h.key}`, score: h.score, label: h.label });
    }
  }
  return out;
}

export async function runScan(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  const settings = store.getSettings();
  console.log("[scanner] starting scan");

  try {
    let sportsData: Awaited<ReturnType<typeof fetchAllSportsMarkets>>;
    try {
      sportsData = await fetchAllSportsMarkets();
    } catch (err) {
      addError(`Kalshi fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    scannerStatus.rawMarketCount = sportsData.reduce((s, d) => s + d.markets.length, 0);
    scannerStatus.groupedEventCount = sportsData.length;

    let newSignals = 0;
    const eventList: NormalizedEvent[] = [];

    for (const data of sportsData) {
      try {
        const event = buildNormalizedEvent(data);

        if (settings.sportFilters.length > 0 && !settings.sportFilters.includes(event.sport)) continue;
        if (settings.leagueFilters.length > 0 && !settings.leagueFilters.includes(event.league)) continue;

        recordOpeningSnapshot(event);
        maybeUpdateDriftFromEvent(event);
        const openSnap = store.getOpening(event.eventTicker);
        if (openSnap) event.openingSnapshot = openSnap;

        const stratResults = runAllStrategies(event, settings);
        const pxScore = getPerplexityScore(event.eventTicker);
        const compositeScore = computeCompositeScore(stratResults, pxScore, settings);

        event.latestCompositeScore = compositeScore;
        event.latestHeatmapBreakdown = flattenHeatmap(stratResults);
        event.detectedStrategies = stratResults.map((r) => r.strategyKey);
        store.upsertEvent(event);
        eventList.push(event);

        for (const result of stratResults) {
          const isResearch = result.strategyKey === "open_drift_favorite";
          const meetsThreshold =
            result.score >= settings.minCompositeScore || isResearch;
          if (!meetsThreshold) continue;

          const initialStatus =
            isResearch || compositeScore < settings.minCompositeScore
              ? "observed_only"
              : "pending_confirm";

          const existing = store
            .getAllSignals()
            .find(
              (s) =>
                s.eventTicker === event.eventTicker &&
                s.strategy === result.strategyKey &&
                (s.status === "pending_confirm" ||
                  s.status === "observed_only" ||
                  s.status === "active"),
            );
          if (existing) continue;

          const sig: Omit<Signal, "id" | "detectedAt"> = {
            eventTicker: event.eventTicker,
            strategy: result.strategyKey,
            sport: event.sport,
            league: event.league,
            matchTitle: event.matchup,
            marketTitle: event.markets[0]?.title ?? event.matchup,
            sideRecommendation: result.sideRecommendation,
            favoriteProb: event.favoriteProb,
            edgePercent: result.edgePercent,
            bloatScore: result.strategyKey === "bloat_no" ? result.score : 0,
            perplexityContextScore: pxScore,
            compositeScore,
            riskScore: result.riskScore,
            actionability: result.actionability,
            heatmapReasons: result.heatmapReasons,
            status: initialStatus,
            isAuto: false,
            ticker: event.markets[0]?.ticker,
          };

          const created = store.createSignal(sig);
          newSignals++;

          if (initialStatus === "pending_confirm") {
            try {
              const maybe = routeSignal(created);
              if (maybe && typeof (maybe as any).catch === "function") {
                (maybe as Promise<void>).catch((e) =>
                  console.error("[scanner] routeSignal error:", e),
                );
              }
            } catch (e) {
              console.error("[scanner] routeSignal threw:", e);
            }
          }
        }

        if (compositeScore >= settings.minCompositeScore || eventList.length <= 20) {
          const today = new Date().toISOString().slice(0, 10);
          const opp: DailyOpportunity = {
            date: today,
            rank: 999,
            eventTicker: event.eventTicker,
            sport: event.sport,
            league: event.league,
            matchup: event.matchup,
            strategyMix: event.detectedStrategies,
            compositeScore,
            observedOnly: true,
            traded: false,
          };
          store.upsertDailyOpportunity(opp);
        }
      } catch (err) {
        addError(
          `Event ${data.event?.event_ticker ?? "?"}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    store.clearOldEvents();

    scannerStatus.normalizedEventCount = eventList.length;
    scannerStatus.signalCount += newSignals;
    scannerStatus.lastScanAt = new Date();

    console.log(
      `[scanner] complete — ${eventList.length} events, ${newSignals} new signals`,
    );

    if (shouldRunDailyReport()) {
      const topEvents = [...eventList]
        .sort((a, b) => b.latestCompositeScore - a.latestCompositeScore)
        .slice(0, 20);
      generateDailyReport(topEvents).catch((err) => addError(`Perplexity error: ${err}`));
    }
  } finally {
    isScanning = false;
  }
}

export function startScanner(): void {
  scannerStatus.running = true;

  const schedule = () => {
    const intervalMs = store.getSettings().scanIntervalSec * 1000;
    scannerStatus.nextScanAt = new Date(Date.now() + intervalMs);
    scanTimer = setTimeout(async () => {
      if (!store.getSettings().scanEnabled) {
        schedule();
        return;
      }
      try {
        await runScan();
      } catch (err) {
        addError(`Scan loop error: ${err instanceof Error ? err.message : String(err)}`);
      }
      schedule();
    }, intervalMs);
  };

  runScan().catch((err) =>
    addError(`Initial scan error: ${err instanceof Error ? err.message : String(err)}`),
  );
  schedule();
}

export function stopScanner(): void {
  scannerStatus.running = false;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}
