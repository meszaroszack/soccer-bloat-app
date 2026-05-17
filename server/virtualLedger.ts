import { randomUUID } from "crypto";
import { store } from "./storage";
import { recordOutcome } from "./calibration";
import type {
  CycleResult,
  LedgerSummary,
  Settings,
  VirtualPosition,
  CircuitBreakerRejection,
} from "../shared/types";

interface ResolverStatus {
  lastTickAt: Date | null;
  positionsChecked: number;
  positionsResolved: number;
  positionsExpired: number;
  lastError: string | null;
  totalTicks: number;
}

export const resolverStatus: ResolverStatus = {
  lastTickAt: null,
  positionsChecked: 0,
  positionsResolved: 0,
  positionsExpired: 0,
  lastError: null,
  totalTicks: 0,
};

export function createVirtualPositions(
  cycleResult: CycleResult,
  settings: Settings,
): { opened: number; rejected: CircuitBreakerRejection[] } {
  const {
    virtualBankroll,
    maxBankrollDeploymentPercent = 0.25,
    perMarketCooldownMinutes = 30,
    recentLossCooldownHours = 24,
    maxPositionAgeMins = 240,
    topPicksN = 4,
  } = settings;

  const allPositions = store.getAllVirtualPositions();
  const openPositions = allPositions.filter((p) => p.status === "virtual_open");
  let deployed = openPositions.reduce((s, p) => s + p.sizeDollars, 0);
  const maxDeployed = virtualBankroll * Math.min(maxBankrollDeploymentPercent, 1.0);

  const openEventTickers = store.getOpenPositionsByEventTicker();
  const currentOpenCount = openPositions.length;

  if (currentOpenCount >= topPicksN) {
    const rejections: CircuitBreakerRejection[] = [];
    for (const pick of cycleResult.topPicks) {
      const r = store.addCircuitBreakerRejection({
        timestamp: new Date(),
        eventTicker: pick.eventTicker,
        matchup: pick.matchup,
        strategy: pick.strategy,
        side: pick.side,
        attemptedSizeDollars: pick.recommendedSizeDollars,
        rejectionReason: "concurrent_cap_reached",
        detail: `${currentOpenCount} positions already open (max ${topPicksN})`,
        cycleId: cycleResult.cycleId,
      });
      rejections.push(r);
      console.log(`[ledger] CIRCUIT BREAKER concurrent_cap_reached: ${pick.matchup}`);
    }
    return { opened: 0, rejected: rejections };
  }

  let opened = 0;
  let openedThisCycle = 0;
  const rejections: CircuitBreakerRejection[] = [];

  for (const pick of cycleResult.topPicks) {
    // GATE A: per-cycle cap
    if (openedThisCycle >= topPicksN) {
      const r = store.addCircuitBreakerRejection({
        timestamp: new Date(),
        eventTicker: pick.eventTicker,
        matchup: pick.matchup,
        strategy: pick.strategy,
        side: pick.side,
        attemptedSizeDollars: pick.recommendedSizeDollars,
        rejectionReason: "concurrent_cap_reached",
        detail: `Cycle cap reached (${openedThisCycle}/${topPicksN} this cycle)`,
        cycleId: cycleResult.cycleId,
      });
      rejections.push(r);
      continue;
    }

    // GATE B: bankroll cap with 5% per-trade hard ceiling
    const newSize = Math.min(
      pick.recommendedSizeDollars,
      virtualBankroll * 0.05,
    );
    if (deployed + newSize > maxDeployed + 0.001) {
      const r = store.addCircuitBreakerRejection({
        timestamp: new Date(),
        eventTicker: pick.eventTicker,
        matchup: pick.matchup,
        strategy: pick.strategy,
        side: pick.side,
        attemptedSizeDollars: newSize,
        rejectionReason: "bankroll_cap_breached",
        detail: `Deployed $${deployed.toFixed(2)} + $${newSize.toFixed(2)} > cap $${maxDeployed.toFixed(2)} (${(maxBankrollDeploymentPercent * 100).toFixed(0)}% of $${virtualBankroll})`,
        cycleId: cycleResult.cycleId,
      });
      rejections.push(r);
      console.log(`[ledger] CIRCUIT BREAKER bankroll_cap_breached: ${pick.matchup}`);
      continue;
    }

    // GATE C: per-event uniqueness
    if (openEventTickers.has(pick.eventTicker)) {
      const r = store.addCircuitBreakerRejection({
        timestamp: new Date(),
        eventTicker: pick.eventTicker,
        matchup: pick.matchup,
        strategy: pick.strategy,
        side: pick.side,
        attemptedSizeDollars: newSize,
        rejectionReason: "duplicate_event_position",
        detail: `Event ${pick.eventTicker} already has an open virtual position`,
        cycleId: cycleResult.cycleId,
      });
      rejections.push(r);
      console.log(`[ledger] CIRCUIT BREAKER duplicate_event_position: ${pick.matchup}`);
      continue;
    }

    // GATE D: per-market cooldown
    if (store.isMarketOnCooldown(pick.eventTicker)) {
      const r = store.addCircuitBreakerRejection({
        timestamp: new Date(),
        eventTicker: pick.eventTicker,
        matchup: pick.matchup,
        strategy: pick.strategy,
        side: pick.side,
        attemptedSizeDollars: newSize,
        rejectionReason: "per_market_cooldown",
        detail: `Market ${pick.eventTicker} is on cooldown (${perMarketCooldownMinutes}m after last open/loss)`,
        cycleId: cycleResult.cycleId,
      });
      rejections.push(r);
      console.log(`[ledger] CIRCUIT BREAKER per_market_cooldown: ${pick.matchup}`);
      continue;
    }

    // GATE E: recent loss cooldown
    const cooldownCutoff = Date.now() - recentLossCooldownHours * 3600000;
    const recentLoss = allPositions.find(
      (p) =>
        p.eventTicker === pick.eventTicker &&
        p.status === "virtual_closed" &&
        p.outcome === "loss" &&
        p.exitTime &&
        new Date(p.exitTime).getTime() >= cooldownCutoff,
    );
    if (recentLoss) {
      const r = store.addCircuitBreakerRejection({
        timestamp: new Date(),
        eventTicker: pick.eventTicker,
        matchup: pick.matchup,
        strategy: pick.strategy,
        side: pick.side,
        attemptedSizeDollars: newSize,
        rejectionReason: "recent_loss_cooldown",
        detail: `Loss on ${pick.eventTicker} within last ${recentLossCooldownHours}h`,
        cycleId: cycleResult.cycleId,
      });
      rejections.push(r);
      console.log(`[ledger] CIRCUIT BREAKER recent_loss_cooldown: ${pick.matchup}`);
      continue;
    }

    // All gates passed
    const entryPrice = Math.max(pick.virtualEntryPrice, 0.01);
    const clampedSize = Math.min(newSize, virtualBankroll * 0.05);
    const shares = clampedSize / entryPrice;
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
      sizeDollars: clampedSize,
      status: "virtual_open",
      maxAgeMins: maxPositionAgeMins,
      calibratedHitRateAtEntry: pick.calibratedHitRate,
    };
    store.upsertVirtualPosition(pos);
    openEventTickers.add(pick.eventTicker);
    store.setMarketCooldown(pick.eventTicker, perMarketCooldownMinutes);
    deployed += clampedSize;
    opened++;
    openedThisCycle++;
    console.log(
      `[ledger] opened virtual position ${pos.id} for ${pos.matchup} ($${clampedSize.toFixed(2)}) deployed=${deployed.toFixed(2)}/${maxDeployed.toFixed(2)}`,
    );
  }

  return { opened, rejected: rejections };
}

export function forceCleanupAndReset(_settings: Settings): {
  forceClosed: number;
  calibrationAbsorbed: number;
} {
  console.log("[ledger] FORCE CLEANUP: closing all open positions and resetting ledger");

  const forceClosed = store.forceCloseAllOpenPositions("admin_reset");

  let calibrationAbsorbed = 0;
  for (const pos of forceClosed) {
    try {
      recordOutcome(pos);
      calibrationAbsorbed++;
    } catch (e) {
      console.warn(`[ledger] calibration absorb failed for ${pos.id}:`, e);
    }
  }

  store.clearMarketCooldowns();

  console.log(
    `[ledger] cleanup complete: force-closed=${forceClosed.length} calibration-absorbed=${calibrationAbsorbed}`,
  );

  return { forceClosed: forceClosed.length, calibrationAbsorbed };
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
    let checked = 0;
    let resolved = 0;
    let expired = 0;
    try {
      const positions = store.getAllVirtualPositions();
      const now = Date.now();
      for (const pos of positions) {
        if (pos.status !== "virtual_open") continue;
        checked++;
        const ageMins = (now - pos.entryTime.getTime()) / 60000;
        const event = store.getEvent(pos.eventTicker);

        if (!event || ageMins > pos.maxAgeMins) {
          pos.status = "virtual_expired";
          pos.exitTime = new Date();
          pos.realizedPnlDollars = 0;
          store.upsertVirtualPosition(pos);
          expired++;
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
          resolved++;
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
      resolverStatus.lastTickAt = new Date();
      resolverStatus.positionsChecked += checked;
      resolverStatus.positionsResolved += resolved;
      resolverStatus.positionsExpired += expired;
      resolverStatus.totalTicks++;
      resolverStatus.lastError = null;
      console.log(
        `[ledger] resolver tick #${resolverStatus.totalTicks}: checked=${checked} resolved=${resolved} expired=${expired}`,
      );
    } catch (err) {
      resolverStatus.lastError = String(err);
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

export function getLedgerDeployment(settings: Settings): {
  bankroll: number;
  deployed: number;
  available: number;
  mtmPnl: number;
  realizedPnl: number;
  totalPnl: number;
  openCount: number;
  resolvedCount: number;
  expiredCount: number;
  totalCount: number;
  profitableOpenCount: number;
  underwaterOpenCount: number;
  flatOpenCount: number;
} {
  const positions = store.getAllVirtualPositions();
  const open = positions.filter((p) => p.status === "virtual_open");
  const closed = positions.filter((p) => p.status === "virtual_closed");
  const expired = positions.filter((p) => p.status === "virtual_expired");

  const deployed = open.reduce((s, p) => s + p.sizeDollars, 0);
  const mtmPnl = open.reduce((s, p) => s + (p.markToMarketPnlDollars ?? 0), 0);
  const realizedPnl = closed.reduce((s, p) => s + (p.realizedPnlDollars ?? 0), 0);
  const bankroll = settings.virtualBankroll;
  const available = Math.max(0, bankroll - deployed);
  const totalPnl = mtmPnl + realizedPnl;

  const profitableOpenCount = open.filter((p) => (p.markToMarketPnlDollars ?? 0) > 0.005).length;
  const underwaterOpenCount = open.filter((p) => (p.markToMarketPnlDollars ?? 0) < -0.005).length;
  const flatOpenCount = open.length - profitableOpenCount - underwaterOpenCount;

  return {
    bankroll,
    deployed,
    available,
    mtmPnl,
    realizedPnl,
    totalPnl,
    openCount: open.length,
    resolvedCount: closed.length,
    expiredCount: expired.length,
    totalCount: positions.length,
    profitableOpenCount,
    underwaterOpenCount,
    flatOpenCount,
  };
}

export function getResolvedPositionsSummary(positions: VirtualPosition[]): {
  wins: number;
  losses: number;
  pushes: number;
  netPnl: number;
  hitRate: number;
  avgWin: number;
  avgLoss: number;
  avgHoldMinutes: number;
} {
  const wins = positions.filter((p) => p.outcome === "win");
  const losses = positions.filter((p) => p.outcome === "loss");
  const pushes = positions.filter((p) => p.outcome === "push");

  const netPnl = positions.reduce((s, p) => s + (p.realizedPnlDollars ?? 0), 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const totalDecided = winCount + lossCount;
  const hitRate = totalDecided > 0 ? winCount / totalDecided : 0;

  const avgWin =
    winCount > 0
      ? wins.reduce((s, p) => s + (p.realizedPnlDollars ?? 0), 0) / winCount
      : 0;
  const avgLoss =
    lossCount > 0
      ? losses.reduce((s, p) => s + Math.abs(p.realizedPnlDollars ?? 0), 0) / lossCount
      : 0;

  const posWithHold = positions.filter((p) => p.exitTime && p.entryTime);
  const avgHoldMinutes =
    posWithHold.length > 0
      ? posWithHold.reduce((s, p) => {
          const holdMs = new Date(p.exitTime!).getTime() - new Date(p.entryTime).getTime();
          return s + holdMs / 60000;
        }, 0) / posWithHold.length
      : 0;

  return {
    wins: winCount,
    losses: lossCount,
    pushes: pushes.length,
    netPnl,
    hitRate,
    avgWin,
    avgLoss,
    avgHoldMinutes,
  };
}
