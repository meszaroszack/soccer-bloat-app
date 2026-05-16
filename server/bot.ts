import { store, getCreds } from "./storage";
import { placeOrder } from "./kalshi";
import { refreshAccountSnapshot, getAccountSnapshot, invalidateAccountCache } from "./account";
import type { Signal } from "../shared/types";

// ── Runtime counters (in-memory, resets on server restart) ───────────────────
export const botCounters = {
  totalAutoTrades: 0,
  totalManualTrades: 0,
  totalSkipped: 0,
  // activeBets is derived from real positions, not maintained here
};

// ── Eligibility check ─────────────────────────────────────────────────────────
function isEligible(sig: Signal): boolean {
  const settings = store.getSettings();
  if (!settings.botEnabled) return false;
  if (!settings.enabledStrategies[sig.strategy as keyof typeof settings.enabledStrategies]) return false;
  if (sig.strategy === "open_drift_favorite") return false; // research-only, never auto-trade
  if (sig.actionability <= 0) return false;
  if (sig.compositeScore < settings.minCompositeScore) return false;
  if (sig.edgePercent < settings.minEdgePercent) return false;
  return true;
}

// ── Core: place an order for a signal ─────────────────────────────────────────
async function executeSignalOrder(
  sig: Signal,
  isAuto: boolean,
): Promise<{ success: boolean; error?: string }> {
  const creds = getCreds();
  if (!creds) {
    const err = "No Kalshi credentials configured — cannot place order.";
    console.warn("[bot] order blocked:", err);
    return { success: false, error: err };
  }

  const settings = store.getSettings();
  const ticker = sig.ticker;
  if (!ticker) return { success: false, error: "Signal has no market ticker" };

  // Determine side from recommendation
  const side: "yes" | "no" = sig.sideRecommendation.toLowerCase().includes("yes") ? "yes" : "no";

  // Price: use the raw signal price for the recommended side
  const price = side === "yes" ? sig.favoriteProb : 1 - sig.favoriteProb;

  // Concurrent bet guard (based on real open positions)
  const snapshot = getAccountSnapshot();
  if (snapshot.openPositionsCount >= settings.maxConcurrentBets) {
    const err = `Max concurrent bets reached (${settings.maxConcurrentBets})`;
    console.warn("[bot] order blocked:", err);
    return { success: false, error: err };
  }

  console.log(
    `[bot] placing ${isAuto ? "AUTO" : "MANUAL"} order: ${ticker} ${side.toUpperCase()} ` +
    `@ ${(price * 100).toFixed(1)}¢ × $${settings.betAmountDollars}`,
  );

  try {
    await placeOrder(
      creds.apiKeyId,
      creds.privateKeyPem,
      ticker,
      side,
      price,
      settings.betAmountDollars,
    );

    const newStatus = isAuto ? "auto_traded" : "manually_traded";
    store.updateSignal(sig.id, {
      status: newStatus,
      tradedAt: new Date(),
      isAuto,
    });
    store.removePendingConfirmation(sig.id);

    store.addBotAction({
      signalId: sig.id,
      eventTicker: sig.eventTicker,
      matchTitle: sig.matchTitle,
      action: isAuto ? "auto_trade" : "confirm",
      isAuto,
      result: `Order placed: ${ticker} ${side.toUpperCase()} @ ${(price * 100).toFixed(1)}¢ × $${settings.betAmountDollars}`,
    });

    if (isAuto) botCounters.totalAutoTrades++;
    else botCounters.totalManualTrades++;

    // Mark daily opportunity as traded
    const today = new Date().toISOString().slice(0, 10);
    const opp = store.getDailyOpportunities(today).find((o) => o.eventTicker === sig.eventTicker);
    if (opp) store.upsertDailyOpportunity({ ...opp, traded: true, observedOnly: false });

    // Asynchronously refresh account snapshot to reflect the new position
    invalidateAccountCache();
    refreshAccountSnapshot(true).catch((e) =>
      console.warn("[bot] post-trade account refresh failed:", e.message),
    );

    console.log(`[bot] order placed successfully for signal ${sig.id}`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[bot] order failed for signal ${sig.id}:`, error);

    store.updateSignal(sig.id, { status: "error", notes: error });
    store.addBotAction({
      signalId: sig.id,
      eventTicker: sig.eventTicker,
      matchTitle: sig.matchTitle,
      action: isAuto ? "auto_trade" : "confirm",
      isAuto,
      result: `ORDER FAILED: ${error}`,
    });

    return { success: false, error };
  }
}

// ── Public: process a new signal from the scanner ────────────────────────────
/**
 * Called by scanner.ts for each new signal.
 * Determines routing based on botEnabled + confirmMode:
 *
 *   botEnabled=false           → no action (signal stays in DB only)
 *   botEnabled=true, confirmMode=true  → push to pendingConfirmations
 *   botEnabled=true, confirmMode=false → auto-execute immediately
 */
export async function routeSignal(sig: Signal): Promise<void> {
  const settings = store.getSettings();

  if (!settings.botEnabled) return;

  if (!isEligible(sig)) {
    console.log(`[bot] signal ${sig.id} not eligible (score/actionability/strategy filter)`);
    return;
  }

  // Guard: credentials must exist
  if (!getCreds()) {
    console.warn("[bot] botEnabled but no credentials — signal queued as pending_confirm only");
    store.updateSignal(sig.id, { status: "pending_confirm" });
    store.addPendingConfirmation(sig);
    return;
  }

  if (settings.confirmMode) {
    // Manual approval required
    console.log(`[bot] confirmMode ON — queuing signal ${sig.id} for manual confirmation`);
    store.updateSignal(sig.id, { status: "pending_confirm" });
    store.addPendingConfirmation(sig);
  } else {
    // AUTO-MODE: place trade immediately
    console.log(`[bot] confirmMode OFF — auto-trading signal ${sig.id}`);
    await executeSignalOrder(sig, true).catch((e) =>
      console.error("[bot] auto-trade threw:", e),
    );
  }
}

// ── Public: manual confirm (user clicks CONFIRM button) ──────────────────────
export async function confirmSignal(
  signalId: string,
): Promise<{ success: boolean; error?: string }> {
  const sig = store.getSignal(signalId);
  if (!sig) return { success: false, error: "Signal not found" };

  const result = await executeSignalOrder(sig, false);
  return result;
}

// ── Public: skip / watch ─────────────────────────────────────────────────────
export function skipSignal(signalId: string): void {
  store.updateSignal(signalId, { status: "skipped" });
  store.removePendingConfirmation(signalId);
  const sig = store.getSignal(signalId);
  if (sig) {
    store.addBotAction({
      signalId,
      eventTicker: sig.eventTicker,
      matchTitle: sig.matchTitle,
      action: "skip",
      isAuto: false,
      result: "Skipped by user",
    });
  }
  botCounters.totalSkipped++;
}

export function watchSignal(signalId: string): void {
  store.updateSignal(signalId, { status: "observed_only" });
  store.removePendingConfirmation(signalId);
}

// ── Public: status ───────────────────────────────────────────────────────────
export function getBotStatus() {
  const settings = store.getSettings();
  const pending  = store.getPendingConfirmations();
  const snapshot = getAccountSnapshot();
  const creds    = getCreds();

  // Derive active bets from real account positions rather than a local counter
  const activeBets = snapshot.connected ? snapshot.openPositionsCount : 0;

  // Determine operational mode for the UI
  let mode: "disabled" | "manual_confirm" | "auto_trade" | "no_creds";
  if (!settings.botEnabled) {
    mode = "disabled";
  } else if (!creds) {
    mode = "no_creds";
  } else if (settings.confirmMode) {
    mode = "manual_confirm";
  } else {
    mode = "auto_trade";
  }

  return {
    enabled:              settings.botEnabled,
    confirmMode:          settings.confirmMode,
    mode,
    activeBets,
    pendingConfirmations: pending.length,
    totalAutoTrades:      botCounters.totalAutoTrades,
    totalManualTrades:    botCounters.totalManualTrades,
    totalSkipped:         botCounters.totalSkipped,
    hasCredentials:       !!creds,
    modeDescription:
      mode === "disabled"      ? "Bot is OFF — no trades will be placed." :
      mode === "no_creds"      ? "Bot is ON but no credentials are configured — no trades will be placed." :
      mode === "manual_confirm"? "Signals go to Pending Confirms. No trades placed until you click CONFIRM." :
                                 "AUTO-MODE — eligible signals will be traded automatically. Use with caution.",
  };
}
