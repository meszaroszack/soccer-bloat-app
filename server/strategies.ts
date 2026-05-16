import type { NormalizedEvent, StrategyResult, HeatmapReason } from "../shared/types";

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

export function runBloatNo(event: NormalizedEvent): StrategyResult | null {
  const { favoriteProb, minuteEstimate, isLive } = event;
  if (!isLive) return null;
  if (favoriteProb < 0.55) return null;

  const base = clamp((favoriteProb - 0.5) * 200);
  let timingBonus = 0;
  if (minuteEstimate >= 75) timingBonus = 25;
  else if (minuteEstimate >= 65) timingBonus = 15;
  else if (minuteEstimate >= 55) timingBonus = 5;

  const bloatScore = clamp(base + timingBonus);
  if (bloatScore < 20) return null;

  const noPrice = 1 - favoriteProb;
  const edgePercent = clamp((noPrice - 0.2) * 100, 0, 60);
  const riskScore = favoriteProb > 0.8 ? 70 : favoriteProb > 0.7 ? 50 : 30;
  const actionability = clamp(bloatScore - riskScore / 2);

  const reasons: HeatmapReason[] = [
    { key: "bloat", score: bloatScore, label: `Favorite at ${(favoriteProb * 100).toFixed(0)}% — inflated` },
    {
      key: "timing",
      score: timingBonus > 0 ? 70 : 30,
      label: minuteEstimate >= 65 ? `Late game min ~${minuteEstimate}` : `Mid game min ~${minuteEstimate}`,
    },
    { key: "risk", score: -riskScore, label: riskScore > 50 ? "High favorite — reversal risk" : "Moderate risk" },
  ];

  return {
    strategyKey: "bloat_no",
    score: bloatScore,
    edgePercent,
    riskScore,
    actionability,
    sideRecommendation: "NO on favorite",
    heatmapReasons: reasons,
    explanation: `Favorite at ${(favoriteProb * 100).toFixed(0)}% in minute ~${minuteEstimate}. Bloat score ${bloatScore}. Selling inflated favorite probability.`,
  };
}

export function runLayDraw(event: NormalizedEvent): StrategyResult | null {
  const { sport, marketType, drawProb, minuteEstimate, isLive } = event;
  if (sport !== "Soccer") return null;
  if (marketType !== "three_way") return null;
  if (!drawProb) return null;
  if (!isLive) return null;

  const drawSticky = drawProb > 0.25 && drawProb < 0.45;
  const lateGame = minuteEstimate >= 60;
  if (!drawSticky && !lateGame) return null;

  const score = clamp(drawProb * 150 + (lateGame ? 20 : 0));
  const edgePercent = clamp((0.4 - drawProb) * 100, 0, 40);
  const riskScore = 35;
  const actionability = clamp(score - riskScore);

  const reasons: HeatmapReason[] = [
    { key: "draw_sticky", score: drawSticky ? 70 : 40, label: `Draw at ${(drawProb * 100).toFixed(0)}% — sticky` },
    { key: "timing", score: lateGame ? 65 : 40, label: lateGame ? "Late game — goal likely soon" : "Mid game" },
    { key: "risk", score: -riskScore, label: "Draw markets can whipsaw" },
  ];

  return {
    strategyKey: "lay_draw",
    score,
    edgePercent,
    riskScore,
    actionability,
    sideRecommendation: "NO on Draw",
    heatmapReasons: reasons,
    explanation: `Draw at ${(drawProb * 100).toFixed(0)}% in minute ~${minuteEstimate}. Sticky draw price before likely goal-driven repricing.`,
  };
}

export function runPreGoalBack(event: NormalizedEvent): StrategyResult | null {
  const { sport, favoriteProb, drawProb, minuteEstimate, isLive } = event;
  if (sport !== "Soccer") return null;
  if (!isLive) return null;
  if (!drawProb) return null;

  const closeGame = favoriteProb < 0.65 && favoriteProb > 0.4;
  const earlyOrMid = minuteEstimate < 60 && minuteEstimate > 10;
  if (!closeGame || !earlyOrMid) return null;

  const score = clamp((0.65 - favoriteProb) * 150 + (drawProb > 0.3 ? 15 : 0));
  if (score < 20) return null;

  const edgePercent = clamp((0.65 - favoriteProb) * 80, 0, 30);
  const riskScore = 45;
  const actionability = clamp(score - riskScore);

  const reasons: HeatmapReason[] = [
    { key: "pre_goal", score, label: `Close game — back underdog before repricing` },
    { key: "timing", score: 60, label: `Min ~${minuteEstimate} — early enough for value` },
    { key: "risk", score: -riskScore, label: "Score-feed uncertainty — research mode" },
  ];

  return {
    strategyKey: "pre_goal_back",
    score,
    edgePercent,
    riskScore,
    actionability: Math.min(actionability, 40),
    sideRecommendation: "YES on underdog",
    heatmapReasons: reasons,
    explanation: `Close game at min ~${minuteEstimate}. Favorite at ${(favoriteProb * 100).toFixed(0)}%. May be underpriced underdog.`,
  };
}

export function runSpreadScalp(event: NormalizedEvent): StrategyResult | null {
  const { markets } = event;
  if (markets.length < 2) return null;

  const mainMarket = markets[0];
  const spread = mainMarket.yesPrice + mainMarket.noPrice;
  const spreadDeviation = Math.abs(spread - 1.0);

  if (spreadDeviation < 0.05) return null;

  const score = clamp(spreadDeviation * 500);
  if (score < 20) return null;

  const edgePercent = clamp((spreadDeviation * 100) / 2, 0, 25);
  const riskScore = 30;
  const actionability = clamp(score - riskScore) * 0.7;

  const reasons: HeatmapReason[] = [
    { key: "spread", score, label: `Spread deviation ${(spreadDeviation * 100).toFixed(1)}% — exploitable gap` },
    { key: "risk", score: -riskScore, label: "Scalp requires fast execution" },
  ];

  return {
    strategyKey: "spread_scalp",
    score,
    edgePercent,
    riskScore,
    actionability,
    sideRecommendation: mainMarket.yesPrice < 0.5 ? "YES (underpriced)" : "NO (overpriced)",
    heatmapReasons: reasons,
    explanation: `Yes+No = ${(spread * 100).toFixed(0)}%. ${(spreadDeviation * 100).toFixed(1)}% spread deviation suggests scalp opportunity.`,
  };
}

export function runExternalMisprice(_event: NormalizedEvent, oddsApiKey?: string): StrategyResult | null {
  if (!oddsApiKey) return null;
  return null;
}

export function runOpenDriftFavorite(event: NormalizedEvent): StrategyResult | null {
  const { openingSnapshot, favoriteProb } = event;
  if (!openingSnapshot) return null;
  if (!openingSnapshot.near5050AtOpen) return null;

  const drift = favoriteProb - openingSnapshot.firstYesPrice;
  if (Math.abs(drift) < 0.05) return null;

  const score = clamp(Math.abs(drift) * 300, 0, 80);
  const researchScore = clamp(score);

  const reasons: HeatmapReason[] = [
    { key: "drift", score, label: `Drifted ${(drift * 100).toFixed(0)}% from 50/50 open` },
    { key: "research", score: 50, label: "Research mode — tracking open favorite hypothesis" },
  ];

  return {
    strategyKey: "open_drift_favorite",
    score: researchScore,
    edgePercent: 0,
    riskScore: 20,
    actionability: 0,
    sideRecommendation: drift > 0 ? "Research: YES drifting up" : "Research: YES drifting down",
    heatmapReasons: reasons,
    explanation: `Opened near 50/50 (${(openingSnapshot.firstYesPrice * 100).toFixed(0)}%). Now at ${(favoriteProb * 100).toFixed(0)}%. Drift of ${(drift * 100).toFixed(0)}%. Tracking for research.`,
  };
}

export function computeCompositeScore(
  results: StrategyResult[],
  perplexityScore: number,
  perplexityWeight: number,
): { compositeScore: number; heatmapBreakdown: HeatmapReason[] } {
  if (results.length === 0) return { compositeScore: 0, heatmapBreakdown: [] };

  const allReasons: HeatmapReason[] = results.flatMap((r) => r.heatmapReasons);

  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  const avgRisk = results.reduce((s, r) => s + r.riskScore, 0) / results.length;

  const pxContrib = perplexityScore * perplexityWeight * 100;
  const composite = clamp(avgScore * (1 - perplexityWeight) + pxContrib - avgRisk * 0.3);

  if (perplexityScore > 0) {
    allReasons.push({ key: "perplexity", score: Math.round(pxContrib), label: "Perplexity context adds signal" });
  }

  return { compositeScore: Math.round(composite), heatmapBreakdown: allReasons };
}
