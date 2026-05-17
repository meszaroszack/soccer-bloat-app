import type { Express } from "express";
import type { Server } from "http";
import {
  store,
  setCreds,
  clearCreds,
  hasCreds,
  setLastValidatedAt,
  getLastValidatedAt,
  getCredKeyId,
} from "./storage";
import { testCredentials } from "./kalshi";
import { runScan, startScanner, stopScanner, scannerStatus } from "./scanner";
import { confirmSignal, skipSignal, watchSignal, getBotStatus } from "./bot";
import {
  refreshAccountSnapshot,
  getAccountSnapshot,
  getPositionsView,
  invalidateAccountCache,
} from "./account";
import { manualRefresh } from "./perplexity";
import { getDriftResearchData } from "./openingTracker";
import { getLedgerSummary, resolverStatus } from "./virtualLedger";

const MEM_WARNING =
  "Credentials are stored in server memory and will clear on restart or redeploy.";

export async function registerRoutes(_httpServer: Server, app: Express): Promise<void> {
  // ── Settings ────────────────────────────────────────────────────────────────
  app.get("/api/settings", (_req, res) => res.json(store.getSettings()));
  app.put("/api/settings", (req, res) => res.json(store.updateSettings(req.body ?? {})));
  app.patch("/api/settings", (req, res) => res.json(store.updateSettings(req.body ?? {})));

  // ── Scanner ─────────────────────────────────────────────────────────────────
  app.get("/api/scan/health", (_req, res) => {
    const s = scannerStatus;
    const lastScanAge = s.lastScanAt
      ? Math.round((Date.now() - s.lastScanAt.getTime()) / 1000)
      : null;
    const healthStatus = !s.running
      ? "stopped"
      : s.errorCount > 5
        ? "degraded"
        : s.normalizedEventCount === 0 && s.lastScanAt
          ? "no_data"
          : "healthy";
    res.json({
      status: healthStatus,
      running: s.running,
      lastScanAt: s.lastScanAt,
      lastScanAgeSeconds: lastScanAge,
      nextScanAt: s.nextScanAt,
      rawMarketCount: s.rawMarketCount,
      normalizedEventCount: s.normalizedEventCount,
      groupedEventCount: s.groupedEventCount,
      signalCount: store.getAllSignals().length,
      errorCount: s.errorCount,
      lastError: s.lastError,
      recentErrors: s.recentErrors.slice(0, 10),
    });
  });

  app.get("/api/scan/events", (req, res) => {
    let events = store.getAllEvents();
    const { sport, league, liveOnly, minScore } = req.query;
    if (sport) events = events.filter((e) => e.sport === sport);
    if (league) events = events.filter((e) => e.league === league);
    if (liveOnly === "true") events = events.filter((e) => e.isLive);
    if (minScore) events = events.filter((e) => e.latestCompositeScore >= Number(minScore));
    events.sort((a, b) => b.latestCompositeScore - a.latestCompositeScore);
    res.json(events);
  });

  app.post("/api/scan/run", async (_req, res) => {
    runScan().catch(console.error);
    res.json({ triggered: true });
  });

  app.post("/api/scanner/start", (_req, res) => {
    startScanner();
    res.json({ running: true });
  });
  app.post("/api/scanner/stop", (_req, res) => {
    stopScanner();
    res.json({ running: false });
  });

  app.get("/api/events/:ticker", (req, res) => {
    const event = store.getEvent(req.params.ticker);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  });

  // ── Signals ─────────────────────────────────────────────────────────────────
  app.get("/api/signals", (req, res) => {
    let signals = store.getAllSignals();
    const { strategy, status, sport, league } = req.query;
    if (strategy) signals = signals.filter((s) => s.strategy === strategy);
    if (status) signals = signals.filter((s) => s.status === status);
    if (sport) signals = signals.filter((s) => s.sport === sport);
    if (league) signals = signals.filter((s) => s.league === league);
    res.json(signals);
  });

  app.post("/api/signals/:id/skip", (req, res) => {
    skipSignal(req.params.id);
    res.json({ skipped: true });
  });
  app.post("/api/signals/:id/watch", (req, res) => {
    watchSignal(req.params.id);
    res.json({ watching: true });
  });
  app.post("/api/signals/:id/confirm", async (req, res) => {
    const result = await confirmSignal(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  // ── Bot ─────────────────────────────────────────────────────────────────────
  app.get("/api/bot/status", (_req, res) => res.json(getBotStatus()));
  app.get("/api/bot/pending", (_req, res) => res.json(store.getPendingConfirmations()));
  app.get("/api/bot/actions", (_req, res) => res.json(store.getBotActions(50)));

  app.post("/api/bot/confirm/:id", async (req, res) => {
    const result = await confirmSignal(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });
  app.post("/api/bot/dismiss/:id", (req, res) => {
    skipSignal(req.params.id);
    res.json({ dismissed: true });
  });
  app.post("/api/bot/settings", (req, res) => {
    res.json(store.updateSettings(req.body ?? {}));
  });

  // ── Account ─────────────────────────────────────────────────────────────────
  app.get("/api/account/summary", async (_req, res) => {
    const snap = await refreshAccountSnapshot();
    res.json(snap);
  });
  app.post("/api/account/refresh", async (_req, res) => {
    invalidateAccountCache();
    const snap = await refreshAccountSnapshot(true);
    res.json(snap);
  });
  app.get("/api/account/positions", async (_req, res) => {
    await refreshAccountSnapshot();
    res.json({ positions: getPositionsView(), lastUpdatedTs: new Date().toISOString() });
  });
  app.get("/api/account/trades", (_req, res) => {
    res.json({ trades: [], note: "Trade history coming soon" });
  });

  // ── Credentials ─────────────────────────────────────────────────────────────
  app.get("/api/credentials/status", (_req, res) => {
    const connected = hasCreds();
    const lastValidatedAt = getLastValidatedAt();
    const keyId = getCredKeyId();
    res.json({
      hasCredentials: connected,
      connected,
      validated: connected && lastValidatedAt !== null,
      lastValidatedAt,
      keyIdHint: keyId ? `${keyId.slice(0, 8)}…` : null,
      persistenceMode: "memory" as const,
      warning: MEM_WARNING,
    });
  });

  app.post("/api/credentials", async (req, res) => {
    const { apiKeyId, privateKeyPem } = req.body ?? {};
    if (!apiKeyId || !privateKeyPem) {
      return res.status(400).json({ error: "Missing apiKeyId or privateKeyPem" });
    }
    const result = await testCredentials(apiKeyId, privateKeyPem);
    if (!result.valid) {
      return res.status(401).json({ valid: false, error: result.error });
    }
    setCreds({ apiKeyId, privateKeyPem });
    setLastValidatedAt(Date.now());

    const snap = await refreshAccountSnapshot(true).catch(() => getAccountSnapshot());
    const positions = getPositionsView();

    res.json({
      valid: true,
      balanceCents: result.balance,
      balanceDollars: (result.balance ?? 0) / 100,
      persistenceMode: "memory",
      warning: MEM_WARNING,
      account: snap,
      positionsCount: positions.length,
    });
  });

  app.post("/api/credentials/refresh", async (_req, res) => {
    if (!hasCreds()) {
      return res.status(400).json({ error: "No credentials configured" });
    }
    invalidateAccountCache();
    const snap = await refreshAccountSnapshot(true);
    const positions = getPositionsView();
    const lastValidatedAt = getLastValidatedAt();
    res.json({
      connected: snap.connected,
      validated: !snap.error || snap.error.startsWith("Refresh failed"),
      lastValidatedAt,
      persistenceMode: "memory" as const,
      warning: MEM_WARNING,
      account: snap,
      positionsCount: positions.length,
    });
  });

  app.delete("/api/credentials", (_req, res) => {
    clearCreds();
    res.json({ cleared: true });
  });

  // ── Analytics ───────────────────────────────────────────────────────────────
  app.get("/api/analytics/top-opportunities", (req, res) => {
    const { date } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const d = (date as string) ?? today;
    const opps = store
      .getDailyOpportunities(d)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20);
    res.json(opps);
  });

  app.get("/api/analytics/opportunities", (req, res) => {
    const { date } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const d = (date as string) ?? today;
    const opps = store
      .getDailyOpportunities(d)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20);
    res.json(opps);
  });

  app.get("/api/analytics/league-heat", (_req, res) => {
    const signals = store.getAllSignals();
    const events = store.getAllEvents();
    const leagueMap = new Map<
      string,
      {
        sport: string;
        league: string;
        signalCount: number;
        eventCount: number;
        totalScore: number;
        avgScore: number;
        heat: number;
      }
    >();
    for (const e of events) {
      const cur = leagueMap.get(e.league) ?? {
        sport: e.sport,
        league: e.league,
        signalCount: 0,
        eventCount: 0,
        totalScore: 0,
        avgScore: 0,
        heat: 0,
      };
      cur.eventCount++;
      cur.totalScore += e.latestCompositeScore;
      leagueMap.set(e.league, cur);
    }
    for (const s of signals) {
      const cur = leagueMap.get(s.league);
      if (cur) cur.signalCount++;
    }
    for (const v of leagueMap.values()) {
      v.avgScore = v.eventCount ? v.totalScore / v.eventCount : 0;
      v.heat = Math.min(5, Math.floor((v.avgScore + v.signalCount * 5) / 20));
    }
    res.json(
      Array.from(leagueMap.values()).sort((a, b) => b.heat - a.heat || b.avgScore - a.avgScore),
    );
  });

  app.get("/api/analytics/opening-drift", (_req, res) => {
    res.json(getDriftResearchData());
  });

  app.get("/api/analytics/performance-summary", (_req, res) => {
    const signals = store.getAllSignals();
    const byStrategy: Record<
      string,
      { signals: number; traded: number; skipped: number; avgScore: number }
    > = {};
    let scoreSum: Record<string, number> = {};
    for (const s of signals) {
      const k = s.strategy;
      if (!byStrategy[k]) {
        byStrategy[k] = { signals: 0, traded: 0, skipped: 0, avgScore: 0 };
        scoreSum[k] = 0;
      }
      byStrategy[k].signals++;
      scoreSum[k] += s.compositeScore;
      if (s.status === "auto_traded" || s.status === "manually_traded") byStrategy[k].traded++;
      if (s.status === "skipped") byStrategy[k].skipped++;
    }
    for (const k of Object.keys(byStrategy)) {
      byStrategy[k].avgScore = byStrategy[k].signals
        ? Math.round(scoreSum[k] / byStrategy[k].signals)
        : 0;
    }
    res.json({
      totalSignals: signals.length,
      traded: signals.filter(
        (s) => s.status === "auto_traded" || s.status === "manually_traded",
      ).length,
      skipped: signals.filter((s) => s.status === "skipped").length,
      autoTrades: signals.filter((s) => s.status === "auto_traded").length,
      manualTrades: signals.filter((s) => s.status === "manually_traded").length,
      byStrategy,
    });
  });

  // ── Intelligence ────────────────────────────────────────────────────────────
  app.get("/api/intelligence/daily-report", (_req, res) => {
    const report = store.getTodayReport();
    if (!report) {
      return res.json({ available: false, hasKey: !!process.env.PERPLEXITY_API_KEY });
    }
    res.json({ available: true, report });
  });

  app.post("/api/intelligence/refresh", async (_req, res) => {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) return res.status(400).json({ error: "PERPLEXITY_API_KEY not configured" });
    const events = store
      .getAllEvents()
      .sort((a, b) => b.latestCompositeScore - a.latestCompositeScore);
    const report = await manualRefresh(events);
    if (!report) return res.status(500).json({ error: "Failed to generate report" });
    res.json({ success: true, report });
  });

  // ── Picks / Trading Model ────────────────────────────────────────────────────
  app.get("/api/picks/today", (_req, res) => {
    const cycle = store.getLatestCycle();
    res.json(
      cycle ?? {
        topPicks: [],
        totalEvaluated: 0,
        eligibleCount: 0,
        rejectedCount: 0,
        nearMisses: [],
        rejectionReasons: {},
        modelHealth: { avgCalibratedHitRate: 0, avgSampleSize: 0, coldStartPct: 0 },
      },
    );
  });

  app.get("/api/picks/cycle-stats", (_req, res) => {
    res.json({ history: store.getCycleHistory(20) });
  });

  // ── Virtual Ledger ───────────────────────────────────────────────────────────
  app.get("/api/ledger/summary", (_req, res) => {
    const settings = store.getSettings();
    res.json(getLedgerSummary(settings));
  });

  app.get("/api/ledger/positions", (req, res) => {
    const { status } = req.query;
    let positions = store.getAllVirtualPositions();
    if (status === "open") positions = positions.filter((p) => p.status === "virtual_open");
    if (status === "closed") positions = positions.filter((p) => p.status !== "virtual_open");
    positions.sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
    res.json(positions.slice(0, 100));
  });

  app.get("/api/ledger/resolver-status", (_req, res) => {
    res.json(resolverStatus);
  });

  app.get("/api/ledger/open-positions", (_req, res) => {
    const positions = store
      .getAllVirtualPositions()
      .filter((p) => p.status === "virtual_open");
    const enriched = positions.map((p) => {
      const event = store.getEvent(p.eventTicker);
      const market = event?.markets?.[0];
      const currentPrice = market
        ? p.side === "yes"
          ? market.yesPrice
          : market.noPrice
        : null;
      return {
        ...p,
        currentPrice,
        ageMins: (Date.now() - new Date(p.entryTime).getTime()) / 60000,
        expectedResolutionAt: new Date(
          new Date(p.entryTime).getTime() + p.maxAgeMins * 60000,
        ),
      };
    });
    enriched.sort((a, b) => b.ageMins - a.ageMins);
    res.json(enriched);
  });

  // ── Calibration ──────────────────────────────────────────────────────────────
  app.get("/api/calibration/buckets", (_req, res) => {
    res.json(
      store.getAllCalibrationBuckets().sort((a, b) => b.sampleSize - a.sampleSize),
    );
  });

  app.get("/api/calibration/adjustments", (_req, res) => {
    res.json(store.getModelAdjustments(50));
  });

  app.post("/api/calibration/promote", (_req, res) => {
    const settings = store.getSettings();
    const summary = getLedgerSummary(settings);
    if (!summary.promoteReadiness.isReady) {
      return res.status(400).json({
        error: "Not ready to promote",
        missing: summary.promoteReadiness.missingCriteria,
      });
    }
    store.updateSettings({ executionMode: "live_auto" });
    res.json({ promoted: true, newMode: "live_auto" });
  });
}
