import type {
  NormalizedEvent,
  StrategyResult,
  Settings,
  HeatmapReason,
} from "../shared/types";
import { store } from "./storage";

export function bloatNoStrategy(event: NormalizedEvent): StrategyResult | null {
  if (!event.isLive) return null;
  if (event.minuteEstimate < 20) return null;
  if (event.favoriteProb <= 0.72) return null;

  const overpriceMagnitude = (event.favoriteProb - 0.72) / 0.28;
  const minuteFactor = Math.min(1, (event.minuteEstimate - 20) / 40);
  const bloatScore = Math.round(
    Math.min(100, overpriceMagnitude * 70 + minuteFactor * 30),
  );

  const edgePercent = Math.round((event.favoriteProb - 0.72) * 100);

  const heatmapReasons: HeatmapReason[] = [
    {
      key: "favorite_overpriced",
      score: Math.round(overpriceMagnitude * 100),
      label: `Favorite at ${(event.favoriteProb * 100).toFixed(0)}% (>72% threshold)`,
    },
    {
      key: "live_clock",
      score: Math.round(minuteFactor * 100),
      label: `Live @ minute ${event.minuteEstimate}`,
    },
  ];

  return {
    strategyKey: "bloat_no",
    score: bloatScore,
    edgePercent,
    riskScore: 35,
    actionability: Math.min(100, bloatScore + 10),
    sideRecommendation: `NO ${event.favoriteSide}`,
    heatmapReasons,
    explanation: `Favorite overpriced at ${(event.favoriteProb * 100).toFixed(0)}% with ${event.minuteEstimate}min played — sell NO ${event.favoriteSide}`,
  };
}

export function layDrawStrategy(event: NormalizedEvent): StrategyResult | null {
  if (event.marketType !== "three_way") return null;
  if (event.drawProb === undefined) return null;
  if (event.drawProb >= 0.15) return null;
  if (event.favoriteProb <= 0.65) return null;

  const drawUnderpriceFactor = (0.15 - event.drawProb) / 0.15;
  const favStrength = (event.favoriteProb - 0.65) / 0.35;
  const score = Math.round(
    Math.min(100, drawUnderpriceFactor * 60 + favStrength * 40),
  );
  const edgePercent = Math.round((0.15 - event.drawProb) * 100);

  const heatmapReasons: HeatmapReason[] = [
    {
      key: "draw_underpriced",
      score: Math.round(drawUnderpriceFactor * 100),
      label: `Draw at ${(event.drawProb * 100).toFixed(0)}%`,
    },
    {
      key: "strong_favorite",
      score: Math.round(favStrength * 100),
      label: `Favorite ${(event.favoriteProb * 100).toFixed(0)}%`,
    },
  ];

  return {
    strategyKey: "lay_draw",
    score,
    edgePercent,
    riskScore: 45,
    actionability: Math.min(100, score),
    sideRecommendation: "YES Draw",
    heatmapReasons,
    explanation: `Draw underpriced @ ${(event.drawProb * 100).toFixed(0)}% with strong favorite`,
  };
}

export function preGoalBackStrategy(event: NormalizedEvent): StrategyResult | null {
  if (!event.isLive) return null;
  if (event.minuteEstimate >= 30) return null;
  if (event.favoriteProb < 0.52 || event.favoriteProb > 0.68) return null;

  const sweetSpot = 1 - Math.abs(event.favoriteProb - 0.6) / 0.08;
  const earlyClock = (30 - event.minuteEstimate) / 30;
  const score = Math.round(Math.min(100, sweetSpot * 60 + earlyClock * 40));
  const edgePercent = Math.round((0.68 - event.favoriteProb) * 100);

  const heatmapReasons: HeatmapReason[] = [
    {
      key: "favorite_sweet_spot",
      score: Math.round(sweetSpot * 100),
      label: `Favorite at ${(event.favoriteProb * 100).toFixed(0)}% (52-68% zone)`,
    },
    {
      key: "early_clock",
      score: Math.round(earlyClock * 100),
      label: `Pre-30min mark (currently ${event.minuteEstimate}min)`,
    },
  ];

  return {
    strategyKey: "pre_goal_back",
    score,
    edgePercent,
    riskScore: 50,
    actionability: Math.min(100, score - 5),
    sideRecommendation: `YES ${event.favoriteSide}`,
    heatmapReasons,
    explanation: `Back favorite pre-goal — early clock, sweet-spot probability`,
  };
}

export function spreadScalpStrategy(event: NormalizedEvent): StrategyResult | null {
  if (event.marketType !== "spread") return null;
  if (event.markets.length < 2) return null;

  const sorted = [...event.markets].sort((a, b) => b.yesPrice - a.yesPrice);
  const top = sorted[0];
  const next = sorted[1];
  const diff = Math.abs(top.yesPrice - next.yesPrice);
  if (diff < 0.08) return null;

  const score = Math.round(Math.min(100, diff * 400));
  const edgePercent = Math.round(diff * 100);

  const heatmapReasons: HeatmapReason[] = [
    {
      key: "spread_gap",
      score: Math.round(diff * 100),
      label: `Spread gap ${(diff * 100).toFixed(1)}%`,
    },
  ];

  return {
    strategyKey: "spread_scalp",
    score,
    edgePercent,
    riskScore: 40,
    actionability: Math.min(100, score),
    sideRecommendation: `YES ${top.subtitle || top.title}`,
    heatmapReasons,
    explanation: `Spread scalp — top line ${(top.yesPrice * 100).toFixed(0)}¢ vs next ${(next.yesPrice * 100).toFixed(0)}¢`,
  };
}

export function externalMispriceStrategy(event: NormalizedEvent): StrategyResult | null {
  if (!process.env.ODDS_API_KEY) return null;
  void event;
  return null;
}

export function openDriftFavoriteStrategy(event: NormalizedEvent): StrategyResult | null {
  const opening = store.getOpening(event.eventTicker);
  if (!opening) return null;
  if (!opening.near5050AtOpen) return null;

  const drift = Math.abs(event.favoriteProb - opening.firstYesPrice);
  if (drift < 0.10) return null;

  const score = Math.round(Math.min(100, drift * 200));

  const heatmapReasons: HeatmapReason[] = [
    {
      key: "opening_drift",
      score,
      label: `Drifted ${(drift * 100).toFixed(0)}pts from opening`,
    },
  ];

  return {
    strategyKey: "open_drift_favorite",
    score,
    edgePercent: Math.round(drift * 100),
    riskScore: 60,
    actionability: 0,
    sideRecommendation: `OBSERVE ${event.favoriteSide}`,
    heatmapReasons,
    explanation: `Research-only: opened near 50/50, drifted ${(drift * 100).toFixed(0)}pts`,
  };
}

const STRATEGIES: Array<{
  key: keyof Settings["enabledStrategies"];
  fn: (e: NormalizedEvent) => StrategyResult | null;
}> = [
  { key: "bloat_no", fn: bloatNoStrategy },
  { key: "lay_draw", fn: layDrawStrategy },
  { key: "pre_goal_back", fn: preGoalBackStrategy },
  { key: "spread_scalp", fn: spreadScalpStrategy },
  { key: "external_misprice", fn: externalMispriceStrategy },
  { key: "open_drift_favorite", fn: openDriftFavoriteStrategy },
];

export function runAllStrategies(event: NormalizedEvent, settings: Settings): StrategyResult[] {
  const results: StrategyResult[] = [];
  for (const s of STRATEGIES) {
    if (!settings.enabledStrategies[s.key]) continue;
    try {
      const r = s.fn(event);
      if (r) results.push(r);
    } catch {
      // ignore individual strategy failures
    }
  }
  return results;
}

export function getPerplexityScore(eventTicker: string): number {
  const report = store.getTodayReport();
  if (!report) return 0;
  const focus = report.focusEvents.find((f) => f.eventTicker === eventTicker);
  if (!focus) return 0;
  return Math.round(
    focus.mispricingNarrativeScore * 0.5 +
      focus.newsShockScore * 0.3 +
      focus.actionabilityScore * 0.2,
  );
}

export function computeCompositeScore(
  results: StrategyResult[],
  perplexityScore: number,
  settings: Settings,
): number {
  if (results.length === 0 && perplexityScore === 0) return 0;
  const actionable = results.filter((r) => r.actionability > 0);
  const candidates = actionable.length ? actionable : results;
  let topScore = 0;
  for (const r of candidates) if (r.score > topScore) topScore = r.score;
  const breadthBonus = Math.min(20, Math.max(0, results.length - 1) * 5);
  const perplexityBoost = perplexityScore * (settings.perplexityWeight ?? 0);
  const composite = topScore + breadthBonus + perplexityBoost;
  return Math.min(100, Math.round(composite));
}
