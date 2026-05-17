import { randomUUID } from "crypto";
import { store } from "./storage";
import {
  getOrCreateBucket,
  getEffectiveMinScore,
  isBucketDisabled,
} from "./calibration";
import type {
  Signal,
  Settings,
  CycleResult,
  TradingDecision,
  RankComponent,
  NearMiss,
} from "../shared/types";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

interface WorkSignal {
  sig: Signal;
  normalizedScore: number;
  liveOrPre: "live" | "pre";
  calibratedHitRate: number;
  bucketSampleSize: number;
  isColdStart: boolean;
  liquidityScore: number;
  rankScore: number;
  components: RankComponent[];
}

function computeLiquidityScore(eventTicker: string): number {
  const event = store.getEvent(eventTicker);
  if (!event) return 0.6;
  let totalVolume = 0;
  let totalOpenInterest = 0;
  let counted = 0;
  for (const m of event.markets) {
    if (m.volume != null) totalVolume += m.volume;
    if (m.openInterest != null) totalOpenInterest += m.openInterest;
    counted++;
  }
  if (counted === 0) return 0.6;
  const volScore = clamp(totalVolume / 1000, 0, 0.5);
  const oiScore = clamp(totalOpenInterest / 5000, 0, 0.5);
  const s = volScore + oiScore;
  if (s <= 0) return 0.6;
  return clamp(s, 0, 1);
}

export function evaluate(signals: Signal[], settings: Settings): CycleResult {
  const cycleId = randomUUID();
  const evaluatedAt = new Date();
  const rejectionReasons: Record<string, number> = {};
  const nearMisses: NearMiss[] = [];

  const bumpReason = (k: string) => {
    rejectionReasons[k] = (rejectionReasons[k] ?? 0) + 1;
  };

  // Stage 1 — Intake
  const intake = signals.filter(
    (s) =>
      (s.status === "pending_confirm" ||
        s.status === "observed_only" ||
        s.status === "active") &&
      s.actionability > 0,
  );

  const totalEvaluated = intake.length;

  if (intake.length === 0) {
    return {
      cycleId,
      evaluatedAt,
      topPicks: [],
      eligibleCount: 0,
      totalEvaluated: 0,
      rejectedCount: 0,
      rejectionReasons,
      nearMisses,
      modelHealth: { avgCalibratedHitRate: 0, avgSampleSize: 0, coldStartPct: 0 },
    };
  }

  // Stage 2 — Normalization (z-score)
  const scores = intake.map((s) => s.compositeScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((a, b) => a + (b - mean) * (b - mean), 0) / scores.length;
  const stddev = Math.sqrt(variance);

  const working: WorkSignal[] = intake.map((sig) => {
    const normalizedScore = clamp(
      ((sig.compositeScore - mean) / Math.max(stddev, 1)) * 15 + 75,
      0,
      100,
    );
    const liveOrPre: "live" | "pre" = sig.isAuto ? "live" : "pre";

    // Stage 3 — Calibration join
    const bucket = getOrCreateBucket(
      sig.strategy,
      sig.sport,
      normalizedScore,
      sig.edgePercent,
      liveOrPre,
    );
    const calibratedHitRate = bucket.sampleSize < 20 ? 0.5 : bucket.hitRate;
    const isColdStart = bucket.sampleSize < 20;

    return {
      sig,
      normalizedScore,
      liveOrPre,
      calibratedHitRate,
      bucketSampleSize: bucket.sampleSize,
      isColdStart,
      liquidityScore: computeLiquidityScore(sig.eventTicker),
      rankScore: 0,
      components: [],
    };
  });

  // Stage 4 — Ranking
  // sort by raw rankScore desc for correlation penalty: process by score then count duplicates
  const seenEvents = new Set<string>();
  // First compute rankScore without correlation penalty in a stable order (by compositeScore desc)
  working.sort((a, b) => b.sig.compositeScore - a.sig.compositeScore);

  for (const w of working) {
    const sig = w.sig;
    const confidenceWeight = Math.min(1, w.bucketSampleSize / 30);
    const edgeQuality = clamp(sig.edgePercent / 20, 0, 1);
    const strategyRollingHitRate = w.calibratedHitRate;
    const marketLiquidityScore = w.liquidityScore;
    const correlationPenalty = seenEvents.has(sig.eventTicker) ? 0.3 : 0;
    seenEvents.add(sig.eventTicker);
    const recencyPenalty = 0;
    const volatilityPenalty = clamp(sig.riskScore / 100, 0, 0.5);
    const normalizedFraction = w.normalizedScore / 100;

    const comp: RankComponent[] = [
      {
        key: "normalized_score",
        label: "Normalized Score",
        value: w.normalizedScore,
        contribution: 0.3 * normalizedFraction,
        weight: 0.3,
      },
      {
        key: "calibrated_hit",
        label: "Calibrated Hit Rate",
        value: w.calibratedHitRate * 100,
        contribution: 0.25 * w.calibratedHitRate * confidenceWeight,
        weight: 0.25,
      },
      {
        key: "edge_quality",
        label: "Edge Quality",
        value: sig.edgePercent,
        contribution: 0.2 * edgeQuality,
        weight: 0.2,
      },
      {
        key: "strategy_rolling",
        label: "Strategy Rolling Hit",
        value: strategyRollingHitRate * 100,
        contribution: 0.1 * strategyRollingHitRate,
        weight: 0.1,
      },
      {
        key: "liquidity",
        label: "Market Liquidity",
        value: marketLiquidityScore * 100,
        contribution: 0.1 * marketLiquidityScore,
        weight: 0.1,
      },
      {
        key: "correlation_penalty",
        label: "Correlation Penalty",
        value: correlationPenalty,
        contribution: -0.15 * correlationPenalty,
        weight: 0.15,
      },
      {
        key: "recency_penalty",
        label: "Recency Penalty",
        value: recencyPenalty,
        contribution: -0.1 * recencyPenalty,
        weight: 0.1,
      },
      {
        key: "volatility_penalty",
        label: "Volatility Penalty",
        value: volatilityPenalty * 100,
        contribution: -0.1 * volatilityPenalty,
        weight: 0.1,
      },
    ];

    const sum = comp.reduce((a, c) => a + c.contribution, 0);
    w.rankScore = clamp(sum * 100, 0, 100);
    w.components = comp;
  }

  // Stage 5 — Hard gates
  type GateOutcome = {
    w: WorkSignal;
    passed: boolean;
    failedGate?: string;
    failedGateDetail?: string;
  };

  const gated: GateOutcome[] = working.map((w) => {
    const sig = w.sig;

    if (sig.strategy === "open_drift_favorite") {
      return {
        w,
        passed: false,
        failedGate: "research_only",
        failedGateDetail: "Strategy is research-only",
      };
    }

    const minScore = getEffectiveMinScore(
      sig.strategy,
      sig.sport,
      w.normalizedScore,
      sig.edgePercent,
      w.liveOrPre,
    );
    if (w.normalizedScore < minScore) {
      return {
        w,
        passed: false,
        failedGate: "min_score",
        failedGateDetail: `${w.normalizedScore.toFixed(1)} < ${minScore}`,
      };
    }

    if (sig.edgePercent < settings.minEdgePercent) {
      return {
        w,
        passed: false,
        failedGate: "min_edge",
        failedGateDetail: `${sig.edgePercent.toFixed(1)}% < ${settings.minEdgePercent}%`,
      };
    }

    if (sig.riskScore > settings.maxRiskScoreGate) {
      return {
        w,
        passed: false,
        failedGate: "risk_gate",
        failedGateDetail: `risk ${sig.riskScore} > ${settings.maxRiskScoreGate}`,
      };
    }

    if (
      isBucketDisabled(
        sig.strategy,
        sig.sport,
        w.normalizedScore,
        sig.edgePercent,
        w.liveOrPre,
      )
    ) {
      return {
        w,
        passed: false,
        failedGate: "bucket_disabled",
        failedGateDetail: "Calibration bucket disabled",
      };
    }

    if (w.liquidityScore < settings.minLiquidityScore) {
      return {
        w,
        passed: false,
        failedGate: "liquidity",
        failedGateDetail: `${w.liquidityScore.toFixed(2)} < ${settings.minLiquidityScore.toFixed(2)}`,
      };
    }

    return { w, passed: true };
  });

  for (const g of gated) {
    if (!g.passed && g.failedGate) bumpReason(g.failedGate);
  }

  const eligible = gated.filter((g) => g.passed).map((g) => g.w);
  const eligibleCount = eligible.length;

  // Stage 6 — Diversity enforcement
  eligible.sort((a, b) => b.rankScore - a.rankScore);

  // Cold-start: any strategy with < 30 resolved samples is still cold
  // Use calibration buckets to check. Proxy: any WorkSignal in eligible set with bucketSampleSize < 30
  const anyColdStrategy = eligible.some((w) => w.bucketSampleSize < 30);
  const strategyLimit = anyColdStrategy ? 2 : 1;

  const survivors: WorkSignal[] = [];
  const eventSeen = new Set<string>();
  const leagueCount = new Map<string, number>();
  const strategyCount = new Map<string, number>();
  const diversityRejects: GateOutcome[] = [];

  for (const w of eligible) {
    const sig = w.sig;
    if (eventSeen.has(sig.eventTicker)) {
      bumpReason("duplicate_event");
      diversityRejects.push({
        w,
        passed: false,
        failedGate: "duplicate_event",
        failedGateDetail: `Already picked ${sig.eventTicker}`,
      });
      continue;
    }
    const lc = leagueCount.get(sig.league) ?? 0;
    if (lc >= 2) {
      bumpReason("league_limit");
      diversityRejects.push({
        w,
        passed: false,
        failedGate: "league_limit",
        failedGateDetail: `League ${sig.league} already has 2 picks`,
      });
      continue;
    }
    const sc = strategyCount.get(sig.strategy) ?? 0;
    if (sc >= strategyLimit && w.calibratedHitRate <= 0.6) {
      bumpReason("strategy_limit");
      diversityRejects.push({
        w,
        passed: false,
        failedGate: "strategy_limit",
        failedGateDetail: `Strategy ${sig.strategy} already has ${sc} pick(s) (limit=${strategyLimit}, hit rate ≤ 60%)`,
      });
      continue;
    }
    survivors.push(w);
    eventSeen.add(sig.eventTicker);
    leagueCount.set(sig.league, lc + 1);
    strategyCount.set(sig.strategy, sc + 1);
  }

  // Stage 7 — Top-N
  const picks = survivors.slice(0, settings.topPicksN);

  // Stage 8 — Kelly sizing
  const decisions: TradingDecision[] = picks.map((w, idx) => {
    const sig = w.sig;
    const entryPrice = clamp(sig.favoriteProb || 0.5, 0.01, 0.99);
    const b = Math.max(0.1, (1 - entryPrice) / entryPrice);
    const p = w.calibratedHitRate;
    const kelly = (p * (b + 1) - 1) / b;
    const bankrollFraction = Math.max(0.005, Math.min(0.03, 0.25 * kelly));
    const bankroll = settings.virtualBankroll;
    const tradeSizeDollars = clamp(
      bankroll * bankrollFraction,
      settings.perTradeMin,
      settings.perTradeMax,
    );

    const sideLower = (sig.sideRecommendation || "yes").toLowerCase();
    const side: "yes" | "no" = sideLower.includes("no") ? "no" : "yes";
    const virtualEntryPrice = entryPrice;
    const expectedValue =
      w.calibratedHitRate * (1 - virtualEntryPrice) -
      (1 - w.calibratedHitRate) * virtualEntryPrice;
    const worstCaseLoss = tradeSizeDollars;

    const calibratedPct = (w.calibratedHitRate * 100).toFixed(1);
    const whyThisPick = `${prettyStrategy(sig.strategy)} signal (${w.normalizedScore.toFixed(0)} normalized) in ${sig.league || sig.sport} — ${calibratedPct}% calibrated hit rate over ${w.bucketSampleSize} trades. Edge: ${sig.edgePercent.toFixed(1)}%. Kelly suggests $${tradeSizeDollars.toFixed(2)} on ${side.toUpperCase()}.`;

    const recommendation = `BET ${side.toUpperCase()}`;

    return {
      id: randomUUID(),
      cycleId,
      signalId: sig.id,
      eventTicker: sig.eventTicker,
      matchup: sig.matchTitle,
      strategy: sig.strategy,
      sport: sig.sport,
      league: sig.league,
      side,
      recommendation,
      rank: idx + 1,
      rankScore: w.rankScore,
      normalizedScore: w.normalizedScore,
      compositeScore: sig.compositeScore,
      edgePercent: sig.edgePercent,
      calibratedHitRate: w.calibratedHitRate,
      bucketSampleSize: w.bucketSampleSize,
      isColdStart: w.isColdStart,
      virtualEntryPrice,
      recommendedSizeDollars: tradeSizeDollars,
      bankrollFraction,
      expectedValue,
      worstCaseLoss,
      rankComponents: w.components,
      whyThisPick,
      liquidityScore: w.liquidityScore,
      riskScore: sig.riskScore,
    };
  });

  // Build near misses: prefer diversity rejects + top failed-gate rejects, ordered by rankScore
  const allRejects: GateOutcome[] = [
    ...diversityRejects,
    ...gated.filter((g) => !g.passed),
  ];
  allRejects.sort((a, b) => b.w.rankScore - a.w.rankScore);
  for (const r of allRejects.slice(0, 10)) {
    nearMisses.push({
      signalId: r.w.sig.id,
      eventTicker: r.w.sig.eventTicker,
      matchup: r.w.sig.matchTitle,
      strategy: r.w.sig.strategy,
      rankScore: r.w.rankScore,
      normalizedScore: r.w.normalizedScore,
      failedGate: r.failedGate ?? "unknown",
      failedGateDetail: r.failedGateDetail,
    });
  }

  const rejectedCount = totalEvaluated - eligibleCount;

  // Model health
  const totalSamples = working.reduce((a, w) => a + w.bucketSampleSize, 0);
  const totalHitRate = working.reduce((a, w) => a + w.calibratedHitRate, 0);
  const coldStartCount = working.filter((w) => w.isColdStart).length;
  const modelHealth = {
    avgCalibratedHitRate: working.length ? totalHitRate / working.length : 0,
    avgSampleSize: working.length ? totalSamples / working.length : 0,
    coldStartPct: working.length ? coldStartCount / working.length : 0,
  };

  return {
    cycleId,
    evaluatedAt,
    topPicks: decisions,
    eligibleCount,
    totalEvaluated,
    rejectedCount,
    rejectionReasons,
    nearMisses,
    modelHealth,
  };
}

function prettyStrategy(s: string): string {
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
