export type BetMode = "no_only" | "yes_only" | "both";
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
  updatedAt: Date;
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
