import { store } from "./storage";
import { fetchAllSportsMarkets, buildNormalizedEvent } from "./kalshi";
import {
  runBloatNo,
  runLayDraw,
  runPreGoalBack,
  runSpreadScalp,
  runExternalMisprice,
  runOpenDriftFavorite,
  computeCompositeScore,
} from "./strategies";
import { recordOpeningSnapshot } from "./openingTracker";
import { shouldRunDailyReport, generateDailyReport } from "./perplexity";
import type {
  NormalizedEvent,
  Signal,
  DailyOpportunity,
  StrategyResult,
} from "../shared/types";

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let isScanning = false;

export const scannerStatus = {
  running: false,
  lastScan: null as Date | null,
  nextScan: null as Date | null,
  eventsScanned: 0,
  signalsGenerated: 0,
  rawMarketCount: 0,
  normalizedEventCount: 0,
  failedNormalizationCount: 0,
  errorCount: 0,
  lastError: null as string | null,
  errors: [] as string[],
};

function addError(msg: string) {
  scannerStatus.lastError = msg;
  scannerStatus.errorCount++;
  scannerStatus.errors.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (scannerStatus.errors.length > 30) scannerStatus.errors = scannerStatus.errors.slice(0, 30);
  console.error("[scanner]", msg);
}

export async function runScan(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  const settings = store.getSettings();
  console.log("[scanner] Starting scan...");

  try {
    let sportsData: Awaited<ReturnType<typeof fetchAllSportsMarkets>>;
    try {
      sportsData = await fetchAllSportsMarkets();
    } catch (err) {
      addError(`Kalshi fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    console.log(`[scanner] Fetched ${sportsData.length} events from Kalshi`);
    scannerStatus.rawMarketCount = sportsData.reduce((s, d) => s + d.markets.length, 0);

    let newSignals = 0;
    const eventList: NormalizedEvent[] = [];
    let failCount = 0;

    for (const data of sportsData) {
      try {
        const event = buildNormalizedEvent(data);

        if (settings.sportFilters.length > 0 && !settings.sportFilters.includes(event.sport)) continue;
        if (settings.leagueFilters.length > 0 && !settings.leagueFilters.includes(event.league)) continue;

        recordOpeningSnapshot(event);
        const openSnap = store.getOpening(event.eventTicker);
        if (openSnap) event.openingSnapshot = openSnap;

        const stratResults: StrategyResult[] = [];
        if (settings.enabledStrategies.bloat_no) {
          const r = runBloatNo(event);
          if (r) stratResults.push(r);
        }
        if (settings.enabledStrategies.lay_draw) {
          const r = runLayDraw(event);
          if (r) stratResults.push(r);
        }
        if (settings.enabledStrategies.pre_goal_back) {
          const r = runPreGoalBack(event);
          if (r) stratResults.push(r);
        }
        if (settings.enabledStrategies.spread_scalp) {
          const r = runSpreadScalp(event);
          if (r) stratResults.push(r);
        }
        if (settings.enabledStrategies.external_misprice) {
          const r = runExternalMisprice(event, settings.oddsApiKey);
          if (r) stratResults.push(r);
        }
        if (settings.enabledStrategies.open_drift_favorite) {
          const r = runOpenDriftFavorite(event);
          if (r) stratResults.push(r);
        }

        const pxReport = store.getTodayReport();
        const pxFocus = pxReport?.focusEvents.find((f) => f.eventTicker === event.eventTicker);
        const pxScore = pxFocus ? pxFocus.actionabilityScore / 10 : 0;

        const { compositeScore, heatmapBreakdown } = computeCompositeScore(
          stratResults,
          pxScore,
          settings.perplexityWeight,
        );

        event.latestCompositeScore = compositeScore;
        event.latestHeatmapBreakdown = heatmapBreakdown;
        event.detectedStrategies = stratResults.map((r) => r.strategyKey);
        store.upsertEvent(event);
        eventList.push(event);

        for (const result of stratResults) {
          if (result.score >= settings.minCompositeScore || result.strategyKey === "open_drift_favorite") {
            const status =
              result.strategyKey === "open_drift_favorite"
                ? "observed_only"
                : compositeScore < settings.minCompositeScore
                  ? "observed_only"
                  : "pending_confirm";

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
              perplexityContextScore: pxScore * 10,
              compositeScore,
              riskScore: result.riskScore,
              actionability: result.actionability,
              heatmapReasons: result.heatmapReasons,
              status,
              isAuto: false,
              ticker: event.markets[0]?.ticker,
            };

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

            if (!existing) {
              const created = store.createSignal(sig);
              newSignals++;
              if (status === "pending_confirm" && settings.confirmMode) {
                store.addPendingConfirmation(created);
              }
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
        failCount++;
        addError(
          `Event normalization failed for ${data.event?.event_ticker}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    store.clearOldEvents();

    scannerStatus.eventsScanned = eventList.length;
    scannerStatus.normalizedEventCount = eventList.length;
    scannerStatus.failedNormalizationCount = failCount;
    scannerStatus.signalsGenerated += newSignals;
    scannerStatus.lastScan = new Date();

    console.log(
      `[scanner] Scan complete: ${eventList.length} events, ${newSignals} new signals, ${failCount} failed`,
    );

    if (shouldRunDailyReport()) {
      const topEvents = [...eventList]
        .sort((a, b) => b.latestCompositeScore - a.latestCompositeScore)
        .slice(0, 20);
      generateDailyReport(topEvents).catch((err) => addError(`Perplexity report error: ${err}`));
    }
  } finally {
    isScanning = false;
    scannerStatus.lastScan = new Date();
  }
}

export function startScanner(): void {
  scannerStatus.running = true;

  const schedule = () => {
    const intervalMs = store.getSettings().scanIntervalSec * 1000;
    scannerStatus.nextScan = new Date(Date.now() + intervalMs);
    scanTimer = setTimeout(async () => {
      if (!store.getSettings().scanEnabled) {
        schedule();
        return;
      }
      try {
        await runScan();
      } catch (err) {
        addError(`Scan loop error: ${err}`);
      }
      schedule();
    }, intervalMs);
  };

  runScan().catch((err) => addError(`Initial scan error: ${err}`));
  schedule();
}

export function stopScanner(): void {
  scannerStatus.running = false;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}
