import { randomUUID } from "crypto";
import type {
  Settings,
  NormalizedEvent,
  Signal,
  OpeningObservation,
  DailyOpportunity,
  PerplexityDailyReport,
  BotAction,
  VirtualPosition,
  CalibrationBucket,
  CycleResult,
  ModelAdjustment,
} from "../shared/types";

interface KalshiCreds {
  apiKeyId: string;
  privateKeyPem: string;
}

let _creds: KalshiCreds | null = null;
let _lastValidatedAt: number | null = null;

export const setCreds = (c: KalshiCreds) => {
  _creds = c;
};
export const setLastValidatedAt = (ts: number) => {
  _lastValidatedAt = ts;
};
export const getCreds = () => _creds;
export const clearCreds = () => {
  _creds = null;
  _lastValidatedAt = null;
};
export const hasCreds = () => _creds !== null;
export const getLastValidatedAt = () => _lastValidatedAt;
export const getCredKeyId = () => _creds?.apiKeyId ?? null;

const DEFAULT_SETTINGS: Settings = {
  scanEnabled: true,
  scanIntervalSec: 120,
  botEnabled: false,
  confirmMode: true,
  maxConcurrentBets: 3,
  betAmountDollars: 2.0,
  betMode: "no_only",
  enabledStrategies: {
    bloat_no: true,
    lay_draw: true,
    pre_goal_back: true,
    spread_scalp: true,
    external_misprice: false,
    open_drift_favorite: true,
    perplexity_overlay: true,
  },
  sportFilters: [],
  leagueFilters: [],
  minBloatScore: 30,
  minCompositeScore: 40,
  minEdgePercent: 5,
  perplexityEnabled: true,
  perplexityDailyReportEnabled: true,
  perplexityDailyReportTimeEt: "11:00",
  perplexityWeight: 0.2,
  executionMode: "beta_shadow",
  virtualBankroll: 100,
  perTradeMin: 1,
  perTradeMax: 5,
  minNormalizedScore: 70,
  minLiquidityScore: 0.3,
  maxRiskScoreGate: 70,
  topPicksN: 4,
  maxPositionAgeMins: 240,
  updatedAt: new Date(),
};

class Store {
  settings: Settings = { ...DEFAULT_SETTINGS };
  events: Map<string, NormalizedEvent> = new Map();
  signals: Map<string, Signal> = new Map();
  openingObservations: Map<string, OpeningObservation> = new Map();
  dailyOpportunities: DailyOpportunity[] = [];
  perplexityReports: Map<string, PerplexityDailyReport> = new Map();
  botActions: BotAction[] = [];
  pendingConfirmations: Signal[] = [];
  virtualPositions: Map<string, VirtualPosition> = new Map();
  calibrationBuckets: Map<string, CalibrationBucket> = new Map();
  cycleResults: CycleResult[] = [];
  modelAdjustments: ModelAdjustment[] = [];

  getSettings() {
    return this.settings;
  }
  updateSettings(s: Partial<Settings>) {
    this.settings = { ...this.settings, ...s, updatedAt: new Date() };
    return this.settings;
  }

  upsertEvent(event: NormalizedEvent) {
    this.events.set(event.eventTicker, event);
  }
  getEvent(ticker: string) {
    return this.events.get(ticker);
  }
  getAllEvents() {
    return Array.from(this.events.values());
  }
  clearOldEvents(maxAgeMs = 4 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [k, v] of this.events) {
      if (v.lastUpdated.getTime() < cutoff) this.events.delete(k);
    }
  }

  createSignal(s: Omit<Signal, "id" | "detectedAt">) {
    const sig: Signal = { ...s, id: randomUUID(), detectedAt: new Date() };
    this.signals.set(sig.id, sig);
    return sig;
  }
  getSignal(id: string) {
    return this.signals.get(id);
  }
  getAllSignals() {
    return Array.from(this.signals.values()).sort(
      (a, b) => b.detectedAt.getTime() - a.detectedAt.getTime(),
    );
  }
  updateSignal(id: string, updates: Partial<Signal>) {
    const s = this.signals.get(id);
    if (!s) return undefined;
    const updated = { ...s, ...updates };
    this.signals.set(id, updated);
    return updated;
  }

  upsertOpening(obs: OpeningObservation) {
    this.openingObservations.set(obs.eventTicker, obs);
  }
  getOpening(ticker: string) {
    return this.openingObservations.get(ticker);
  }
  getAllOpenings() {
    return Array.from(this.openingObservations.values());
  }

  upsertDailyOpportunity(opp: DailyOpportunity) {
    const idx = this.dailyOpportunities.findIndex(
      (o) => o.eventTicker === opp.eventTicker && o.date === opp.date,
    );
    if (idx >= 0) this.dailyOpportunities[idx] = opp;
    else this.dailyOpportunities.push(opp);

    const today = opp.date;
    const todayOpps = this.dailyOpportunities
      .filter((o) => o.date === today)
      .sort((a, b) => b.compositeScore - a.compositeScore);
    todayOpps.forEach((o, i) => {
      o.rank = i + 1;
    });
  }
  getDailyOpportunities(date?: string) {
    if (date) return this.dailyOpportunities.filter((o) => o.date === date);
    return this.dailyOpportunities;
  }

  savePerplexityReport(report: PerplexityDailyReport) {
    this.perplexityReports.set(report.date, report);
  }
  getPerplexityReport(date: string) {
    return this.perplexityReports.get(date);
  }
  getTodayReport() {
    const today = new Date().toISOString().slice(0, 10);
    return this.perplexityReports.get(today);
  }

  addBotAction(a: Omit<BotAction, "id" | "timestamp">) {
    const action: BotAction = { ...a, id: randomUUID(), timestamp: new Date() };
    this.botActions.unshift(action);
    if (this.botActions.length > 500) this.botActions = this.botActions.slice(0, 500);
    return action;
  }
  getBotActions(limit = 50) {
    return this.botActions.slice(0, limit);
  }

  addPendingConfirmation(sig: Signal) {
    if (!this.pendingConfirmations.find((s) => s.id === sig.id)) {
      this.pendingConfirmations.push(sig);
    }
  }
  removePendingConfirmation(id: string) {
    this.pendingConfirmations = this.pendingConfirmations.filter((s) => s.id !== id);
  }
  getPendingConfirmations() {
    return this.pendingConfirmations;
  }

  // ── Virtual positions ─────────────────────────────────────────────
  upsertVirtualPosition(p: VirtualPosition) {
    this.virtualPositions.set(p.id, p);
  }
  getVirtualPosition(id: string) {
    return this.virtualPositions.get(id);
  }
  getAllVirtualPositions() {
    return Array.from(this.virtualPositions.values());
  }

  // ── Calibration buckets ───────────────────────────────────────────
  upsertCalibrationBucket(b: CalibrationBucket) {
    this.calibrationBuckets.set(b.id, b);
  }
  getCalibrationBucket(id: string) {
    return this.calibrationBuckets.get(id);
  }
  getAllCalibrationBuckets() {
    return Array.from(this.calibrationBuckets.values());
  }

  // ── Cycle results ─────────────────────────────────────────────────
  saveCycleResult(c: CycleResult) {
    this.cycleResults.unshift(c);
    if (this.cycleResults.length > 200) this.cycleResults = this.cycleResults.slice(0, 200);
  }
  getLatestCycle() {
    return this.cycleResults[0];
  }
  getCycleHistory(limit = 20) {
    return this.cycleResults.slice(0, limit);
  }

  // ── Model adjustments ─────────────────────────────────────────────
  addModelAdjustment(a: ModelAdjustment) {
    this.modelAdjustments.unshift(a);
    if (this.modelAdjustments.length > 500) this.modelAdjustments = this.modelAdjustments.slice(0, 500);
  }
  getModelAdjustments(limit = 50) {
    return this.modelAdjustments.slice(0, limit);
  }
}

export const store = new Store();
