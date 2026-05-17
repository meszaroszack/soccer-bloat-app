import { randomUUID } from "crypto";
import { store } from "./storage";
import { recordOutcome } from "./calibration";
import type {
  CycleResult,
  LedgerSummary,
  Settings,
  VirtualPosition,
} from "../shared/types";

export function createVirtualPositions(
  cycleResult: CycleResult,
  settings: Settings,
): void {
  const maxAgeMins = settings.maxPositionAgeMins ?? 240;
  for (const pick of cycleResult.topPicks) {
    const entryPrice = Math.max(pick.virtualEntryPrice, 0.01);
    const shares = pick.recommendedSizeDollars / entryPrice;
    const pos: VirtualPosition = {
      id: randomUUID(),
      cycleId: cycleResult.cycleId,
      signalId: pick.signalId,
      decisionId: pick.id,
      eventTicker: pick.eventTicker,
      matchup: pick.matchup,
      strategy: pick.strategy,
      sport: pick.sport,
      league: pick.league,
      side: pick.side,
      entryTime: new Date(),
      entryPrice,
      shares,
      sizeDollars: pick.recommendedSizeDollars,
      status: "virtual_open",
      maxAgeMins,
      calibratedHitRateAtEntry: pick.calibratedHitRate,
    };
    store.upsertVirtualPosition(pos);
    console.log(`[ledger] opened virtual position ${pos.id} for ${pos.matchup}`);
  }
}

function getCurrentMarketPrice(pos: VirtualPosition): number | undefined {
  const event = store.getEvent(pos.eventTicker);
  if (!event) return undefined;
  const market = event.markets[0];
  if (!market) return undefined;
  return pos.side === "yes" ? market.yesPrice : market.noPrice;
}

let resolverStarted = false;

export function startResolverJob(): void {
  if (resolverStarted) return;
  resolverStarted = true;

  setInterval(() => {
    try {
      const positions = store.getAllVirtualPositions();
      const now = Date.now();
      for (const pos of positions) {
        if (pos.status !== "virtual_open") continue;
        const ageMins = (now - pos.entryTime.getTime()) / 60000;
        const event = store.getEvent(pos.eventTicker);

        if (!event || ageMins > pos.maxAgeMins) {
          pos.status = "virtual_expired";
          pos.exitTime = new Date();
          pos.realizedPnlDollars = 0;
          store.upsertVirtualPosition(pos);
          console.log(`[ledger] expired ${pos.id} (age=${ageMins.toFixed(1)}m)`);
          continue;
        }

        const currentPrice = getCurrentMarketPrice(pos);
        if (currentPrice == null) continue;

        if (currentPrice < 0.05 || currentPrice > 0.95) {
          const exitPrice = currentPrice > 0.5 ? 1.0 : 0.0;
          let outcome: "win" | "loss";
          if (pos.side === "yes") {
            outcome = exitPrice === 1.0 ? "win" : "loss";
          } else {
            outcome = exitPrice === 0.0 ? "win" : "loss";
          }
          const realizedPnlDollars =
            outcome === "win"
              ? pos.sizeDollars * (1 / pos.entryPrice - 1)
              : -pos.sizeDollars;
          pos.status = "virtual_closed";
          pos.outcome = outcome;
          pos.exitPrice = exitPrice;
          pos.exitTime = new Date();
          pos.realizedPnlDollars = realizedPnlDollars;
          store.upsertVirtualPosition(pos);
          recordOutcome(pos);
          console.log(
            `[ledger] resolved ${pos.id}: ${outcome} P&L=${realizedPnlDollars.toFixed(2)}`,
          );
        } else {
          // Mark-to-market
          const sign = pos.side === "yes" ? 1 : -1;
          pos.markToMarketPnlDollars =
            (currentPrice - pos.entryPrice) * pos.shares * sign;
          store.upsertVirtualPosition(pos);
        }
      }
    } catch (err) {
      console.error("[ledger] resolver error:", err);
    }
  }, 60_000);
}

function startOfDay(d: Date): number {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

export function getLedgerSummary(settings: Settings): LedgerSummary {
  const positions = store.getAllVirtualPositions();
  const open = positions.filter((p) => p.status === "virtual_open");
  const closed = positions.filter(
    (p) => p.status === "virtual_closed" && p.outcome !== undefined,
  );

  let dailyPnl = 0;
  let weeklyPnl = 0;
  let monthlyPnl = 0;
  let allTimeVirtualPnl = 0;
  let totalCapitalDeployed = 0;
  let winCount = 0;
  let lossCount = 0;
  let winSum = 0;
  let lossSum = 0;

  const now = Date.now();
  const dayStart = startOfDay(new Date(now));
  const weekStart = now - 7 * 86400_000;
  const monthStart = now - 30 * 86400_000;

  const byStrategy: Record<string, { wins: number; count: number; pnl: number }> = {};
  const bySport: Record<string, { wins: number; count: number; pnl: number }> = {};

  for (const p of closed) {
    const pnl = p.realizedPnlDollars ?? 0;
    allTimeVirtualPnl += pnl;
    totalCapitalDeployed += p.sizeDollars;
    if (p.outcome === "win") {
      winCount++;
      winSum += pnl;
    } else if (p.outcome === "loss") {
      lossCount++;
      lossSum += pnl;
    }
    const exitTs = p.exitTime ? p.exitTime.getTime() : 0;
    if (exitTs >= dayStart) dailyPnl += pnl;
    if (exitTs >= weekStart) weeklyPnl += pnl;
    if (exitTs >= monthStart) monthlyPnl += pnl;

    const bs = (byStrategy[p.strategy] ??= { wins: 0, count: 0, pnl: 0 });
    bs.count++;
    bs.pnl += pnl;
    if (p.outcome === "win") bs.wins++;

    const bp = (bySport[p.sport] ??= { wins: 0, count: 0, pnl: 0 });
    bp.count++;
    bp.pnl += pnl;
    if (p.outcome === "win") bp.wins++;
  }

  const totalClosed = winCount + lossCount;
  const overallHitRate = totalClosed > 0 ? winCount / totalClosed : 0;
  const overallROI =
    totalCapitalDeployed > 0 ? allTimeVirtualPnl / totalCapitalDeployed : 0;

  const byStrategyOut: Record<string, { hitRate: number; count: number; pnl: number }> = {};
  for (const [k, v] of Object.entries(byStrategy)) {
    byStrategyOut[k] = {
      hitRate: v.count ? v.wins / v.count : 0,
      count: v.count,
      pnl: v.pnl,
    };
  }
  const bySportOut: Record<string, { hitRate: number; count: number; pnl: number }> = {};
  for (const [k, v] of Object.entries(bySport)) {
    bySportOut[k] = {
      hitRate: v.count ? v.wins / v.count : 0,
      count: v.count,
      pnl: v.pnl,
    };
  }

  const resolvedCount = totalClosed;
  const requiredResolved = 30;
  const requiredHitRate = 0.55;
  const requiredRoi = 0.0;
  const missingCriteria: string[] = [];
  if (resolvedCount < requiredResolved) {
    missingCriteria.push(
      `${resolvedCount}/${requiredResolved} resolved positions`,
    );
  }
  if (overallHitRate < requiredHitRate) {
    missingCriteria.push(
      `Hit rate ${(overallHitRate * 100).toFixed(1)}% (need ≥ ${(requiredHitRate * 100).toFixed(0)}%)`,
    );
  }
  if (overallROI <= requiredRoi) {
    missingCriteria.push(
      `ROI ${(overallROI * 100).toFixed(1)}% (need > 0%)`,
    );
  }
  const isReady =
    resolvedCount >= requiredResolved &&
    overallHitRate >= requiredHitRate &&
    overallROI > requiredRoi;

  return {
    totalOpenPositions: open.length,
    totalClosedPositions: closed.length,
    dailyPnl,
    weeklyPnl,
    monthlyPnl,
    allTimeVirtualPnl,
    overallHitRate,
    overallROI,
    totalCapitalDeployed,
    winCount,
    lossCount,
    avgWinDollars: winCount ? winSum / winCount : 0,
    avgLossDollars: lossCount ? lossSum / lossCount : 0,
    byStrategy: byStrategyOut,
    bySport: bySportOut,
    virtualBankroll: settings.virtualBankroll + allTimeVirtualPnl,
    startingBankroll: settings.virtualBankroll,
    promoteReadiness: {
      resolvedCount,
      requiredResolved,
      hitRate: overallHitRate,
      requiredHitRate,
      roi: overallROI,
      requiredRoi,
      isReady,
      missingCriteria,
    },
  };
}
