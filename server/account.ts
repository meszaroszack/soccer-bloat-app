import { getBalanceRaw, getPositionsRaw } from "./kalshi";
import { getCreds } from "./storage";
import type { AccountSnapshot, PositionView } from "../shared/types";

let _snapshot: AccountSnapshot | null = null;
let _lastGoodSnapshot: AccountSnapshot | null = null;
let _positions: PositionView[] = [];
let _lastGoodPositions: PositionView[] = [];
let _lastRefresh = 0;
const CACHE_MS = 30_000;

function toInt(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isNaN(n) ? 0 : n;
}

function mapPosition(p: any): PositionView | null {
  const netPosition = toInt(p.position);
  if (netPosition === 0) return null;

  const posYes = netPosition > 0 ? netPosition : 0;
  const posNo = netPosition < 0 ? Math.abs(netPosition) : 0;
  const shares = Math.abs(netPosition);

  const realizedPnlCents = toInt(p.realized_pnl);
  const feesCents = toInt(p.fees_paid);
  const exposureCents = toInt(p.market_exposure_cents);
  const totalTradedCents = toInt(p.total_traded_cents);

  const side: PositionView["side"] =
    posYes > 0 && posNo > 0
      ? "both"
      : posYes > 0
        ? "yes"
        : posNo > 0
          ? "no"
          : "unknown";

  return {
    eventTicker: p.event_ticker ?? "",
    ticker: p.ticker ?? "",
    marketTitle: p.market_title ?? p.ticker ?? "",
    side,
    positionYes: posYes,
    positionNo: posNo,
    positionShares: shares,
    marketExposureDollars: exposureCents / 100,
    totalTradedDollars: totalTradedCents / 100,
    realizedPnlDollars: realizedPnlCents / 100,
    feesPaidDollars: feesCents / 100,
    lastUpdatedTs: p.last_updated_ts ?? new Date().toISOString(),
  };
}

function emptySnapshot(error?: string): AccountSnapshot {
  return {
    connected: false,
    balanceCents: 0,
    portfolioValueCents: 0,
    balanceDollars: 0,
    portfolioValueDollars: 0,
    openExposureDollars: 0,
    openPositionsCount: 0,
    realizedPnlDollars: 0,
    lastUpdatedTs: new Date().toISOString(),
    error,
  };
}

export async function refreshAccountSnapshot(force = false): Promise<AccountSnapshot> {
  const creds = getCreds();

  if (!creds) {
    const snap = emptySnapshot("No Kalshi credentials configured.");
    _snapshot = snap;
    _positions = [];
    console.log("[account] no credentials — skipping refresh");
    return snap;
  }

  const now = Date.now();
  if (!force && _lastRefresh > 0 && now - _lastRefresh < CACHE_MS && _snapshot) {
    console.log(
      `[account] serving cached snapshot (age ${Math.round((now - _lastRefresh) / 1000)}s)`,
    );
    return _snapshot;
  }

  try {
    const [bal, posRaw] = await Promise.all([
      getBalanceRaw(creds.apiKeyId, creds.privateKeyPem),
      getPositionsRaw(creds.apiKeyId, creds.privateKeyPem).catch((e) => {
        console.warn("[account] positions fetch failed (non-fatal):", e?.message);
        return [] as any[];
      }),
    ]);

    console.log(
      `[account] balance fetched: ${bal.balanceCents}cents available, ${bal.portfolioValueCents}cents portfolio`,
    );

    const openPos: PositionView[] = [];
    let totalExposure = 0;
    let totalRealizedPnl = 0;

    for (const p of posRaw) {
      const view = mapPosition(p);
      if (!view) continue;
      openPos.push(view);
      totalExposure += Math.abs(view.marketExposureDollars);
      totalRealizedPnl += view.realizedPnlDollars;
    }

    console.log(`[account] ${openPos.length} positions`);

    _positions = openPos;
    _lastGoodPositions = openPos;
    _lastRefresh = Date.now();

    const snap: AccountSnapshot = {
      connected: true,
      balanceCents: bal.balanceCents,
      portfolioValueCents: bal.portfolioValueCents,
      balanceDollars: bal.balanceCents / 100,
      portfolioValueDollars: bal.portfolioValueCents / 100,
      openExposureDollars: totalExposure,
      openPositionsCount: openPos.length,
      realizedPnlDollars: totalRealizedPnl,
      lastUpdatedTs: bal.lastUpdatedTs,
    };
    _snapshot = snap;
    _lastGoodSnapshot = snap;

    return snap;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[account] refresh failed:", errMsg);

    if (_lastGoodSnapshot) {
      const degraded: AccountSnapshot = {
        ..._lastGoodSnapshot,
        error: `Refresh failed — showing last known data. ${errMsg}`,
      };
      _snapshot = degraded;
      _positions = _lastGoodPositions;
      return degraded;
    }

    const snap = emptySnapshot(errMsg);
    _snapshot = snap;
    _positions = [];
    return snap;
  }
}

export function getAccountSnapshot(): AccountSnapshot {
  return _snapshot ?? emptySnapshot("Not yet fetched");
}

export function getPositionsView(): PositionView[] {
  return _positions;
}

export function invalidateAccountCache(): void {
  _lastRefresh = 0;
}
