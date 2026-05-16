import type { Express } from "express";
import type { Server } from "http";
import { store, setCreds, clearCreds, hasCreds, setLastValidatedAt, getLastValidatedAt, getCredKeyId } from "./storage";
import { testCredentials } from "./kalshi";
import { runScan, startScanner, stopScanner, scannerStatus } from "./scanner";
import { confirmSignal, skipSignal, watchSignal, getBotStatus } from "./bot";
import { refreshAccountSnapshot, getPositionsView } from "./account";
import { manualRefresh } from "./perplexity";
import { getDriftResearchData } from "./openingTracker";

export async function registerRoutes(_httpServer: Server, app: Express): Promise<void> {
  // Health
  app.get("/api/scan/health", (_req, res) => {
    const s = scannerStatus;
    const lastScanAge = s.lastScan ? Math.round((Date.now() - s.lastScan.getTime()) / 1000) : null;
    const healthStatus = !s.running
      ? "stopped"
      : s.errorCount > 5
        ? "degraded"
        : s.eventsScanned === 0 && s.lastScan
          ? "no_data"
          : "healthy";

    res.json({
      status: healthStatus,
      running: s.running,
      lastScanAt: s.lastScan,
      lastScanAgeSeconds: lastScanAge,
      nextScanAt: s.nextScan,
      rawMarketCount: s.rawMarketCount,
      normalizedEventCount: s.normalizedEventCount,
      groupedEventCount: store.getAllEvents().length,
      failedNormalizationCount: s.failedNormalizationCount,
      signalCount: store.getAllSignals().length,
      errorCount: s.errorCount,
      lastError: s.lastError,
      recentErrors: s.errors.slice(0, 10),
    });
  });

  // Events alias
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

  // Analytics summary (used by TopBar)
  app.get("/api/analytics/summary", (_req, res) => {
    const events = store.getAllEvents();
    const signals = store.getAllSignals();
    const pending = store.getPendingConfirmations();
    const today = new Date().toISOString().slice(0, 10);
    const todayOpps = store.getDailyOpportunities(today);

    res.json({
      eventsTracked: events.length,
      liveEvents: events.filter((e) => e.isLive).length,
      signalsTotal: signals.length,
      signalsPending: pending.length,
      signalsResolved: signals.filter((s) => s.status === "resolved").length,
      topOpportunitiesToday: Math.min(todayOpps.length, 20),
      scannerStatus: scannerStatus.running ? "scanning" : "idle",
      lastScanAt: scannerStatus.lastScan,
      errorCount: scannerStatus.errorCount,
      lastError: scannerStatus.lastError,
    });
  });

  // Settings
  app.get("/api/settings", (_req, res) => res.json(store.getSettings()));

  app.patch("/api/settings", (req, res) => {
    const updated = store.updateSettings(req.body);
    res.json(updated);
  });

  // ── Credentials ──────────────────────────────────────────────────────────

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
      warning: "Credentials are stored in server memory and will clear on restart or redeploy.",
    });
  });

  app.post("/api/credentials", async (req, res) => {
    const { apiKeyId, privateKeyPem } = req.body ?? {};
    if (!apiKeyId || !privateKeyPem) {
      return res.status(400).json({ error: "Missing apiKeyId or privateKeyPem" });
    }

    console.log("[creds] testing credentials for keyId:", apiKeyId.slice(0, 8), "…");
    const result = await testCredentials(apiKeyId, privateKeyPem);

    if (!result.valid) {
      console.warn("[creds] validation failed:", result.error);
      return res.status(401).json({ valid: false, error: result.error });
    }

    // Persist in memory and mark validated
    setCreds({ apiKeyId, privateKeyPem });
    setLastValidatedAt(Date.now());
    console.log("[creds] credentials saved and validated. Balance cents:", result.balance);

    // Immediately hydrate account snapshot
    const snap = await refreshAccountSnapshot(true).catch((e) => {
      console.warn("[creds] post-save account refresh failed:", e.message);
      return refreshAccountSnapshot();
    });
    const positions = getPositionsView();

    console.log("[creds] post-save account snapshot ready. Connected:", snap.connected);
    return res.json({
      valid: true,
      balanceCents: result.balance,
      balanceDollars: (result.balance ?? 0) / 100,
      persistenceMode: "memory",
      warning: "Credentials stored in server memory — will clear on restart/redeploy.",
      account: snap,
      positionsCount: positions.length,
    });
  });

  app.post("/api/credentials/refresh", async (_req, res) => {
    if (!hasCreds()) {
      return res.status(400).json({ error: "No credentials configured" });
    }
    const snap = await refreshAccountSnapshot(true);
    const positions = getPositionsView();
    const lastValidatedAt = getLastValidatedAt();
    res.json({
      connected: snap.connected,
      validated: !snap.error || snap.error.startsWith("Refresh failed"),
      lastValidatedAt,
      persistenceMode: "memory" as const,
      warning: "Credentials stored in server memory — will clear on restart/redeploy.",
      account: snap,
      positionsCount: positions.length,
    });
  });

  app.delete("/api/credentials", (_req, res) => {
    clearCreds();
    console.log("[creds] credentials cleared");
    res.json({ cleared: true });
  });

  // Scanner
  app.get("/api/scanner/status", (_req, res) => res.json(scannerStatus));

  app.post("/api/scanner/run", async (_req, res) => {
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

  // Events
  app.get("/api/events", (req, res) => {
    let events = store.getAllEvents();
    const { sport, league, liveOnly, minScore } = req.query;

    if (sport) events = events.filter((e) => e.sport === sport);
    if (league) events = events.filter((e) => e.league === league);
    if (liveOnly === "true") events = events.filter((e) => e.isLive);
    if (minScore) events = events.filter((e) => e.latestCompositeScore >= Number(minScore));

    events.sort((a, b) => b.latestCompositeScore - a.latestCompositeScore);
    res.json(events);
  });

  app.get("/api/events/:ticker", (req, res) => {
    const event = store.getEvent(req.params.ticker);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  });

  // Signals
  app.get("/api/signals", (req, res) => {
    let signals = store.getAllSignals();
    const { strategy, status, sport, league } = req.query;

    if (strategy) signals = signals.filter((s) => s.strategy === strategy);
    if (status) signals = signals.filter((s) => s.status === status);
    if (sport) signals = signals.filter((s) => s.sport === sport);
    if (league) signals = signals.filter((s) => s.league === league);

    res.json(signals);
  });

  app.get("/api/signals/pending", (_req, res) => {
    res.json(store.getPendingConfirmations());
  });

  app.post("/api/signals/:id/confirm", async (req, res) => {
    const result = await confirmSignal(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/signals/:id/skip", (req, res) => {
    skipSignal(req.params.id);
    res.json({ skipped: true });
  });

  app.post("/api/signals/:id/watch", (req, res) => {
    watchSignal(req.params.id);
    res.json({ watching: true });
  });

  // Bot
  app.get("/api/bot/status", (_req, res) => res.json(getBotStatus()));
  app.get("/api/bot/actions", (_req, res) => res.json(store.getBotActions(100)));

  // Analytics
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

  app.get("/api/analytics/opening-drift", (_req, res) => {
    res.json(getDriftResearchData());
  });

  app.get("/api/analytics/league-heat", (_req, res) => {
    const events = store.getAllEvents();
    const leagueMap = new Map<
      string,
      {
        sport: string;
        league: string;
        signalCount: number;
        avgScore: number;
        totalScore: number;
        eventCount: number;
      }
    >();

    for (const e of events) {
      const key = e.league;
      if (!leagueMap.has(key)) {
        leagueMap.set(key, {
          sport: e.sport,
          league: e.league,
          signalCount: 0,
          avgScore: 0,
          totalScore: 0,
          eventCount: 0,
        });
      }
      const l = leagueMap.get(key)!;
      l.eventCount++;
      l.signalCount += e.detectedStrategies.length;
      l.totalScore += e.latestCompositeScore;
      l.avgScore = l.totalScore / l.eventCount;
    }

    const result = Array.from(leagueMap.values()).sort((a, b) => b.avgScore - a.avgScore);
    res.json(result);
  });

  // Perplexity
  app.get("/api/intelligence/report", (_req, res) => {
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

  app.get("/api/intelligence/daily-report", (_req, res) => {
    const report = store.getTodayReport();
    if (!report) {
      return res.json({ available: false, hasKey: !!process.env.PERPLEXITY_API_KEY });
    }
    res.json({ available: true, report });
  });

  // Account routes
  app.get("/api/account/summary", async (_req, res) => {
    const snap = await refreshAccountSnapshot();
    res.json(snap);
  });

  app.post("/api/account/refresh", async (_req, res) => {
    const snap = await refreshAccountSnapshot(true);
    res.json(snap);
  });

  app.get("/api/account/positions", async (_req, res) => {
    await refreshAccountSnapshot();
    res.json({ positions: getPositionsView(), lastUpdatedTs: new Date().toISOString() });
  });

  // Bot additional routes
  app.post("/api/bot/confirm/:id", async (req, res) => {
    const result = await confirmSignal(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/bot/dismiss/:id", (req, res) => {
    skipSignal(req.params.id);
    res.json({ dismissed: true });
  });

  app.get("/api/bot/pending", (_req, res) => {
    res.json(store.getPendingConfirmations());
  });

  // Signals additional action
  app.post("/api/signals/:id/trade", async (req, res) => {
    const result = await confirmSignal(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  // Analytics alias
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
}
