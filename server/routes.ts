import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, setCreds, getCreds, clearCreds, hasCreds } from "./storage";
import {
  fetchEventSnapshot,
  parseEventTicker,
  placeBloatBet,
  testCredentials,
  getBalance,
  type EventSnapshot,
  type BetMode,
} from "./kalshi";

// ─── Watch slot state (2 slots, server-side) ──────────────────────────────────
//
// The user pastes up to 2 Kalshi links. We resolve each to an event ticker,
// poll it every 15 s, and cache the latest snapshot so the frontend can do
// a cheap GET without triggering a Kalshi request on every browser poll.

const SLOTS = 2;

interface WatchSlot {
  slotIndex: number;          // 0 or 1
  eventTicker: string;
  rawInput: string;           // original URL/ticker the user pasted
  snapshot: EventSnapshot | null;
  lastFetched: Date | null;
  timer: ReturnType<typeof setInterval> | null;
}

const slots: WatchSlot[] = Array.from({ length: SLOTS }, (_, i) => ({
  slotIndex: i,
  eventTicker: "",
  rawInput: "",
  snapshot: null,
  lastFetched: null,
  timer: null,
}));

function clearSlot(slot: WatchSlot) {
  if (slot.timer) { clearInterval(slot.timer); slot.timer = null; }
  slot.eventTicker = "";
  slot.rawInput = "";
  slot.snapshot = null;
  slot.lastFetched = null;
}

async function pollSlot(slot: WatchSlot) {
  if (!slot.eventTicker) return;
  try {
    const priorHistory = slot.snapshot?.priceHistory ?? [];
    slot.snapshot = await fetchEventSnapshot(slot.eventTicker, priorHistory);
    slot.lastFetched = new Date();
  } catch (e) {
    console.error(`[watch slot ${slot.slotIndex}] poll error:`, e);
  }
}

function startSlot(slot: WatchSlot) {
  if (slot.timer) clearInterval(slot.timer);
  // Poll immediately, then every 15 s
  pollSlot(slot);
  slot.timer = setInterval(() => pollSlot(slot), 15_000);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── Watch slots ─────────────────────────────────────────────────────────────

  // GET /api/watch — return current state of all slots
  app.get("/api/watch", (_req, res) => {
    res.json(slots.map(s => ({
      slotIndex: s.slotIndex,
      eventTicker: s.eventTicker,
      rawInput: s.rawInput,
      snapshot: s.snapshot,
      lastFetched: s.lastFetched,
      active: !!s.eventTicker,
    })));
  });

  // POST /api/watch/:slot — set a watch slot (0 or 1)
  app.post("/api/watch/:slot", async (req, res) => {
    const slotIndex = parseInt(req.params.slot, 10);
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS) {
      return res.status(400).json({ error: `Slot must be 0 or 1` });
    }
    const { input } = req.body as { input?: string };
    if (!input?.trim()) {
      return res.status(400).json({ error: "input is required (Kalshi URL or event ticker)" });
    }

    const eventTicker = parseEventTicker(input);
    if (!eventTicker) {
      return res.status(400).json({ error: "Could not parse a valid event ticker from the input" });
    }

    const slot = slots[slotIndex];
    clearSlot(slot);
    slot.eventTicker = eventTicker;
    slot.rawInput = input.trim();
    startSlot(slot);

    res.json({ ok: true, slotIndex, eventTicker });
  });

  // DELETE /api/watch/:slot — clear a watch slot
  app.delete("/api/watch/:slot", (req, res) => {
    const slotIndex = parseInt(req.params.slot, 10);
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS) {
      return res.status(400).json({ error: `Slot must be 0 or 1` });
    }
    clearSlot(slots[slotIndex]);
    res.json({ ok: true });
  });

  // GET /api/snapshot/:slot — get the latest cached snapshot for a slot
  // The frontend polls this every 15 s; no Kalshi request is triggered here.
  app.get("/api/snapshot/:slot", (req, res) => {
    const slotIndex = parseInt(req.params.slot, 10);
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS) {
      return res.status(400).json({ error: `Slot must be 0 or 1` });
    }
    const slot = slots[slotIndex];
    if (!slot.eventTicker) return res.status(404).json({ error: "Slot is empty" });
    res.json({ slotIndex, eventTicker: slot.eventTicker, snapshot: slot.snapshot, lastFetched: slot.lastFetched });
  });

  // POST /api/snapshot/:slot/refresh — force an immediate re-fetch
  app.post("/api/snapshot/:slot/refresh", async (req, res) => {
    const slotIndex = parseInt(req.params.slot, 10);
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS) {
      return res.status(400).json({ error: `Slot must be 0 or 1` });
    }
    const slot = slots[slotIndex];
    if (!slot.eventTicker) return res.status(404).json({ error: "Slot is empty" });
    await pollSlot(slot);
    res.json({ ok: true, snapshot: slot.snapshot });
  });

  // ── Credentials ──────────────────────────────────────────────────────────────

  app.post("/api/credentials", async (req, res) => {
    const { apiKeyId, privateKeyPem } = req.body;
    if (!apiKeyId || !privateKeyPem)
      return res.status(400).json({ error: "apiKeyId and privateKeyPem are required" });
    const result = await testCredentials(apiKeyId, privateKeyPem);
    if (!result.valid)
      return res.status(401).json({ error: result.error ?? "Invalid credentials" });
    setCreds({ apiKeyId, privateKeyPem });
    res.json({ ok: true, balance: result.balance });
  });

  app.delete("/api/credentials", (_req, res) => { clearCreds(); res.json({ ok: true }); });

  app.get("/api/credentials/status", (_req, res) => res.json({ connected: hasCreds() }));

  app.get("/api/balance", async (_req, res) => {
    const creds = getCreds();
    if (!creds) return res.status(401).json({ error: "No credentials loaded" });
    try { res.json({ balance: await getBalance(creds.apiKeyId, creds.privateKeyPem) }); }
    catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // ── Trade ─────────────────────────────────────────────────────────────────────

  // POST /api/trade — place a bet directly from a watch slot
  app.post("/api/trade", async (req, res) => {
    const creds = getCreds();
    if (!creds) return res.status(401).json({ error: "No credentials loaded" });

    const { ticker, betMode, betAmountDollars, drawPrice, yesPrice } = req.body as {
      ticker: string;
      betMode: BetMode;
      betAmountDollars: number;
      drawPrice?: number;
      yesPrice?: number;
    };

    if (!ticker || !betMode || !betAmountDollars)
      return res.status(400).json({ error: "ticker, betMode, betAmountDollars required" });

    try {
      const orders = await placeBloatBet(
        creds.apiKeyId, creds.privateKeyPem, ticker, betMode, betAmountDollars,
        { drawPrice, yesPrice }
      );
      res.json({ ok: true, orders });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── Status ────────────────────────────────────────────────────────────────────

  app.get("/api/status", (_req, res) => {
    res.json({
      credentialsLoaded: hasCreds(),
      watchSlots: slots.map(s => ({ slotIndex: s.slotIndex, active: !!s.eventTicker, eventTicker: s.eventTicker })),
    });
  });

  return httpServer;
}
