import { store, getCreds } from "./storage";
import { placeOrder } from "./kalshi";

export const botStatus = {
  enabled: false,
  confirmMode: true,
  activeBets: 0,
  pendingConfirmations: 0,
  totalAutoTrades: 0,
  totalManualTrades: 0,
  totalSkipped: 0,
};

export async function confirmSignal(
  signalId: string,
): Promise<{ success: boolean; error?: string }> {
  const sig = store.getSignal(signalId);
  if (!sig) return { success: false, error: "Signal not found" };

  const creds = getCreds();
  if (!creds) return { success: false, error: "No credentials configured" };

  const settings = store.getSettings();
  const side: "yes" | "no" = sig.sideRecommendation.toLowerCase().includes("yes") ? "yes" : "no";
  const ticker = sig.ticker;

  if (!ticker) return { success: false, error: "No market ticker on signal" };

  try {
    const price = side === "yes" ? sig.favoriteProb : 1 - sig.favoriteProb;
    await placeOrder(creds.apiKeyId, creds.privateKeyPem, ticker, side, price, settings.betAmountDollars);

    store.updateSignal(signalId, {
      status: "manually_traded",
      tradedAt: new Date(),
      isAuto: false,
    });
    store.removePendingConfirmation(signalId);

    store.addBotAction({
      signalId,
      eventTicker: sig.eventTicker,
      matchTitle: sig.matchTitle,
      action: "confirm",
      isAuto: false,
      result: "Order placed",
    });

    botStatus.totalManualTrades++;
    botStatus.activeBets++;

    const today = new Date().toISOString().slice(0, 10);
    const opp = store.getDailyOpportunities(today).find((o) => o.eventTicker === sig.eventTicker);
    if (opp) store.upsertDailyOpportunity({ ...opp, traded: true, observedOnly: false });

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    store.updateSignal(signalId, { status: "error", notes: error });
    return { success: false, error };
  }
}

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
  botStatus.totalSkipped++;
}

export function watchSignal(signalId: string): void {
  store.updateSignal(signalId, { status: "observed_only" });
  store.removePendingConfirmation(signalId);
}

export function getBotStatus() {
  const settings = store.getSettings();
  const pending = store.getPendingConfirmations();
  return {
    enabled: settings.botEnabled,
    confirmMode: settings.confirmMode,
    activeBets: botStatus.activeBets,
    pendingConfirmations: pending.length,
    totalAutoTrades: botStatus.totalAutoTrades,
    totalManualTrades: botStatus.totalManualTrades,
    totalSkipped: botStatus.totalSkipped,
  };
}
