export type BetMode = "no_only" | "yes_only" | "both";
export type ExecutionMode = "off" | "beta_shadow" | "manual_confirm" | "live_auto";
export type SignalStatus =
  | "pending_confirm"
  | "active"
  | "auto_traded"
  | "manually_traded"
  | "skipped"
  | "observed_only"
  | "resolved"
  | "error";
export type MarketType = "moneyline" | "three_way" | "spread" | "total" | "prop" | "unknown";

export interface Settings {
  scanEnabled: boolean;
  scanIntervalSec: number;
  botEnabled: boolean;
  confirmMode: boolean;
  maxConcurrentBets: number;
  betAmountDollars: number;
  betMode: BetMode;
  enabledStrategies: {
    bloat_no: boolean;
    lay_draw: boolean;
    pre_goal_back: boolean;
    spread_scalp: boolean;
    external_misprice: boolean;
    open_drift_favorite: boolean;
    perplexity_overlay: boolean;
  };
  sportFilters: string[];
  leagueFilters: string[];
  minBloatScore: number;
  minCompositeScore: number;
  minEdgePercent: number;
  perplexityEnabled: boolean;
  perplexityDailyReportEnabled: boolean;
  perplexityDailyReportTimeEt: string;
  perplexityWeight: number;
  oddsApiKey?: string;
  // Trading model
  executionMode: ExecutionMode;
  virtualBankroll: number;
  perTradeMin: number;
  perTradeMax: number;
  minNormalizedScore: number;
  minLiquidityScore: number;
  maxRiskScoreGate: number;
  topPicksN: number;
  maxPositionAgeMins?: number;
  // Circuit breakers
  maxBankrollDeploymentPercent: number;
  perMarketCooldownMinutes: number;
  recentLossCooldownHours: number;
  maxPriceDriftCents: number;
  updatedAt: Date;
}

export interface RankComponent {
  key: string;
  label: string;
  value: number;
  contribution: number;
  weight: number;
}

export interface TradingDecision {
  id: string;
  cycleId: string;
  signalId: string;
  eventTicker: string;
  matchup: string;
  strategy: string;
  sport: string;
  league: string;
  side: "yes" | "no";
  recommendation: string;
  rank: number;
  rankScore: number;
  normalizedScore: number;
  compositeScore: number;
  edgePercent: number;
  calibratedHitRate: number;
  bucketSampleSize: number;
  isColdStart: boolean;
  virtualEntryPrice: number;
  recommendedSizeDollars: number;
  bankrollFraction: number;
  expectedValue: number;
  worstCaseLoss: number;
  rankComponents: RankComponent[];
  whyThisPick: string;
  liquidityScore: number;
  riskScore: number;
}

export interface NearMiss {
  signalId: string;
  eventTicker: string;
  matchup: string;
  strategy: string;
  rankScore: number;
  normalizedScore: number;
  failedGate: string;
  failedGateDetail?: string;
}

export interface ModelHealth {
  avgCalibratedHitRate: number;
  avgSampleSize: number;
  coldStartPct: number;
}

export interface CycleResult {
  cycleId: string;
  evaluatedAt: Date;
  topPicks: TradingDecision[];
  eligibleCount: number;
  totalEvaluated: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  nearMisses: NearMiss[];
  modelHealth: ModelHealth;
}

export type VirtualPositionStatus = "virtual_open" | "virtual_closed" | "virtual_expired" | "force_closed_cleanup";

export interface CircuitBreakerRejection {
  id: string;
  timestamp: Date;
  eventTicker: string;
  matchup: string;
  strategy: string;
  side: "yes" | "no";
  attemptedSizeDollars: number;
  rejectionReason: string;
  detail: string;
  cycleId: string;
}

export interface VirtualPosition {
  id: string;
  cycleId: string;
  signalId: string;
  decisionId: string;
  eventTicker: string;
  matchup: string;
  strategy: string;
  sport: string;
  league: string;
  side: "yes" | "no";
  entryTime: Date;
  entryPrice: number;
  shares: number;
  sizeDollars: number;
  status: VirtualPositionStatus;
  outcome?: "win" | "loss";
  exitTime?: Date;
  exitPrice?: number;
  realizedPnlDollars?: number;
  markToMarketPnlDollars?: number;
  maxAgeMins: number;
  calibratedHitRateAtEntry: number;
}

export interface CalibrationBucket {
  id: string;
  strategy: string;
  sport: string;
  scoreBucket: string;
  edgeBucket: string;
  liveOrPre: "live" | "pre";
  hitRate: number;
  sampleSize: number;
  totalPnl: number;
  totalCapitalDeployed: number;
  lastUpdated: Date;
  disabled: boolean;
  disabledReason?: string;
}

export interface ModelAdjustment {
  id: string;
  timestamp: Date;
  type: string;
  bucketId?: string;
  detail: string;
  beforeValue?: number;
  afterValue?: number;
}

export interface PromoteReadiness {
  resolvedCount: number;
  requiredResolved: number;
  hitRate: number;
  requiredHitRate: number;
  roi: number;
  requiredRoi: number;
  isReady: boolean;
  missingCriteria: string[];
}

export interface LedgerSummary {
  totalOpenPositions: number;
  totalClosedPositions: number;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  allTimeVirtualPnl: number;
  overallHitRate: number;
  overallROI: number;
  totalCapitalDeployed: number;
  winCount: number;
  lossCount: number;
  avgWinDollars: number;
  avgLossDollars: number;
  byStrategy: Record<string, { hitRate: number; count: number; pnl: number }>;
  bySport: Record<string, { hitRate: number; count: number; pnl: number }>;
  virtualBankroll: number;
  startingBankroll: number;
  promoteReadiness: PromoteReadiness;
}

export interface NormalizedMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yesPrice: number;
  noPrice: number;
  yesBid?: number;
  noAsk?: number;
  volume?: number;
  openInterest?: number;
  status: string;
}

export interface NormalizedEvent {
  eventTicker: string;
  sport: string;
  league: string;
  matchup: string;
  status: string;
  kickoffTime: number | null;
  isLive: boolean;
  minuteEstimate: number;
  marketType: MarketType;
  markets: NormalizedMarket[];
  favoriteSide: string;
  favoriteProb: number;
  drawProb?: number;
  yesNoStructure: boolean;
  openingSnapshot?: OpeningObservation;
  latestCompositeScore: number;
  latestHeatmapBreakdown: HeatmapReason[];
  detectedStrategies: string[];
  lastUpdated: Date;
}

export interface HeatmapReason {
  key: string;
  score: number;
  label: string;
}

export interface Signal {
  id: string;
  eventTicker: string;
  strategy: string;
  sport: string;
  league: string;
  matchTitle: string;
  marketTitle: string;
  sideRecommendation: string;
  favoriteProb: number;
  edgePercent: number;
  bloatScore: number;
  perplexityContextScore: number;
  compositeScore: number;
  riskScore: number;
  actionability: number;
  heatmapReasons: HeatmapReason[];
  status: SignalStatus;
  isAuto: boolean;
  detectedAt: Date;
  tradedAt?: Date;
  outcome?: string;
  profit?: number;
  notes?: string;
  ticker?: string;
}

export interface OpeningObservation {
  eventTicker: string;
  marketTicker: string;
  firstSeenAt: Date;
  firstYesPrice: number;
  firstNoPrice: number;
  near5050AtOpen: boolean;
  favoriteAfter5m?: number;
  favoriteAfter15m?: number;
  favoriteAfter30m?: number;
  favoriteAfter60m?: number;
  eventualWinner?: string;
  researchScore: number;
}

export interface DailyOpportunity {
  date: string;
  rank: number;
  eventTicker: string;
  sport: string;
  league: string;
  matchup: string;
  strategyMix: string[];
  compositeScore: number;
  observedOnly: boolean;
  traded: boolean;
  outcome?: string;
  notes?: string;
}

export interface PerplexityEventFocus {
  eventTicker: string;
  matchup: string;
  newsShockScore: number;
  consensusConfidence: number;
  mispricingNarrativeScore: number;
  riskScore: number;
  actionabilityScore: number;
  bullCase: string;
  bearCase: string;
  baseCase: string;
  shortReason: string;
}

export interface PerplexityDailyReport {
  generatedAt: Date;
  date: string;
  focusEvents: PerplexityEventFocus[];
  leagueThemes: Array<{ league: string; theme: string }>;
  citations?: string[];
  rawResponse?: string;
}

export interface BotAction {
  id: string;
  signalId: string;
  eventTicker: string;
  matchTitle: string;
  action: "confirm" | "skip" | "auto_trade" | "watch_only";
  isAuto: boolean;
  timestamp: Date;
  result?: string;
  error?: string;
}

export interface StrategyResult {
  strategyKey: string;
  score: number;
  edgePercent: number;
  riskScore: number;
  actionability: number;
  sideRecommendation: string;
  heatmapReasons: HeatmapReason[];
  explanation: string;
}

export interface ScannerStatus {
  running: boolean;
  lastScan: Date | null;
  nextScan: Date | null;
  eventsScanned: number;
  signalsGenerated: number;
  errors: string[];
}

export interface BotStatus {
  enabled: boolean;
  confirmMode: boolean;
  activeBets: number;
  pendingConfirmations: number;
  totalAutoTrades: number;
  totalManualTrades: number;
  totalSkipped: number;
}

export interface AccountSnapshot {
  connected: boolean;
  balanceCents: number;
  portfolioValueCents: number;
  balanceDollars: number;
  portfolioValueDollars: number;
  openExposureDollars: number;
  openPositionsCount: number;
  realizedPnlDollars: number;
  lastUpdatedTs: string;
  error?: string;
}

export interface PositionView {
  eventTicker: string;
  ticker: string;
  marketTitle: string;
  side: "yes" | "no" | "both" | "unknown";
  positionYes: number;
  positionNo: number;
  positionShares: number;
  marketExposureDollars: number;
  totalTradedDollars: number;
  realizedPnlDollars: number;
  feesPaidDollars: number;
  lastUpdatedTs: string;
  sport?: string;
  league?: string;
}
