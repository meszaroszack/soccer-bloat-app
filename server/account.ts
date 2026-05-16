import { getBalanceRaw, getPositionsRaw } from "./kalshi";
import { getCreds } from "./storage";

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

// ── In-memory cache ───────────────────────────────────────────────────────────
let _snapshot: AccountSnapshot | null = null;
let _lastGoodSnapshot: AccountSnapshot | null = null;
let _positions: PositionView[] = [];
let _lastGoodPositions: PositionView[] = [];
let _lastRefresh = 0;
const CACHE_MS = 30_000; // 30s cache

// ── Position field helpers ────────────────────────────────────────────────────
// Kalshi market_positions fields (verified from API docs):
//   market_position.ticker
//   market_position.event_ticker
//   market_position.market_title
//   market_position.position          → net YES shares (signed int; negative = net NO)
//   market_position.realized_pnl      → cents integer (can be negative)
//   market_position.fees_paid         → cents integer
//   market_position.market_exposure_cents → cents integer (absolute value of exposure)
//   market_position.total_traded_cents → cents integer
//   market_position.last_updated_ts
//
// NOTE: there is no separate yes_position / no_position field.
// A positive `position` value = net YES shares.
// A negative `position` value = net NO shares.

function toInt(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isNaN(n) ? 0 : n;
}

function mapPosition(p: any): PositionView | null {
  // position is the signed net share count
  const netPosition = toInt(p.position);
  if (netPosition === 0) return null; // skip flat positions

  const posYes = netPosition > 0 ? netPosition : 0;
  const posNo  = netPosition < 0 ? Math.abs(netPosition) : 0;
  const shares = Math.abs(netPosition);

  const realizedPnlCents       = toInt(p.realized_pnl);
  const feesCents               = toInt(p.fees_paid);
  const exposureCents           = toInt(p.market_exposure_cents);
  const totalTradedCents        = toInt(p.total_traded_cents);

  const side: PositionView["side"] =
    posYes > 0 && posNo > 0 ? "both"
    : posYes > 0 ? "yes"
    : posNo  > 0 ? "no"
    : "unknown";

  return {
    eventTicker:          p.event_ticker   ?? "",
    ticker:               p.ticker         ?? "",
    marketTitle:          p.market_title   ?? p.ticker ?? "",
    side,
    positionYes:          posYes,
    positionNo:           posNo,
    positionShares:       shares,
    marketExposureDollars: exposureCents / 100,
    totalTradedDollars:   totalTradedCents / 100,
    realizedPnlDollars:   realizedPnlCents / 100,
    feesPaidDollars:      feesCents / 100,
    lastUpdatedTs:        p.last_updated_ts ?? new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Force-refresh or serve from cache. Returns the new snapshot. */
export async function refreshAccountSnapshot(force = false): Promise<AccountSnapshot> {
  const creds = getCreds();

  if (!creds) {
    const snap: AccountSnapshot = {
      connected: false,
      balanceCents: 0,
      portfolioValueCents: 0,
      balanceDollars: 0,
      portfolioValueDollars: 0,
      openExposureDollars: 0,
      openPositionsCount: 0,
      realizedPnlDollars: 0,
      lastUpdatedTs: new Date().toISOString(),
      error: "No Kalshi credentials configured.",
    };
    _snapshot = snap;
    _positions = [];
    console.log("[account] no credentials — skipping refresh");
    return snap;
  }

  const now = Date.now();
  if (!force && _lastRefresh > 0 && now - _lastRefresh < CACHE_MS) {
    console.log(`[account] serving cached snapshot (age ${Math.round((now - _lastRefresh) / 1000)}s)`);
    return getAccountSnapshot();
  }

  console.log(`[account] refreshing snapshot (force=${force})`);

  try {
    // Fetch balance and positions concurrently.
    // Positions failure is non-fatal; balance failure aborts.
    const [bal, posRaw] = await Promise.all([
      getBalanceRaw(creds.apiKeyId, creds.privateKeyPem),
      getPositionsRaw(creds.apiKeyId, creds.privateKeyPem).catch((e) => {
        console.warn("[account] positions fetch failed (non-fatal):", e.message);
        return [] as any[];
      }),
    ]);

    console.log(
      `[account] balance fetched: ${bal.balanceCents}¢ available, ${bal.portfolioValueCents}¢ portfolio`,
    );
    console.log(`[account] raw positions count: ${posRaw.length}`);

    // Map positions — skip zero-net positions
    const openPos: PositionView[] = [];
    let totalExposure = 0;
    let totalRealizedPnl = 0;

    for (const p of posRaw) {
      const view = mapPosition(p);
      if (!view) continue;
      openPos.push(view);
      totalExposure  += Math.abs(view.marketExposureDollars);
      totalRealizedPnl += view.realizedPnlDollars;
    }

    _positions = openPos;
    _lastGoodPositions = openPos;
    _lastRefresh = Date.now();

    const snap: AccountSnapshot = {
      connected: true,
      balanceCents:        bal.balanceCents,
      portfolioValueCents: bal.portfolioValueCents,
      balanceDollars:      bal.balanceCents / 100,
      portfolioValueDollars: bal.portfolioValueCents / 100,
      openExposureDollars: totalExposure,
      openPositionsCount:  openPos.length,
      realizedPnlDollars:  totalRealizedPnl,
      lastUpdatedTs:       bal.lastUpdatedTs,
    };
    _snapshot = snap;
    _lastGoodSnapshot = snap;

    console.log(
      `[account] snapshot OK — balance $${snap.balanceDollars.toFixed(2)}, ` +
      `portfolio $${snap.portfolioValueDollars.toFixed(2)}, ` +
      `${openPos.length} open positions`,
    );
    return snap;

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[account] refresh failed:", errMsg);

    // Serve last known good data with error annotation rather than zeroing out
    if (_lastGoodSnapshot) {
      const degraded: AccountSnapshot = {
        ..._lastGoodSnapshot,
        lastUpdatedTs: new Date().toISOString(),
        error: `Refresh failed — showing last known data. ${errMsg}`,
      };
      _snapshot = degraded;
      _positions = _lastGoodPositions;
      return degraded;
    }

    const snap: AccountSnapshot = {
      connected: false,
      balanceCents: 0,
      portfolioValueCents: 0,
      balanceDollars: 0,
      portfolioValueDollars: 0,
      openExposureDollars: 0,
      openPositionsCount: 0,
      realizedPnlDollars: 0,
      lastUpdatedTs: new Date().toISOString(),
      error: errMsg,
    };
    _snapshot = snap;
    _positions = [];
    return snap;
  }
}

export function getAccountSnapshot(): AccountSnapshot {
  return (
    _snapshot ?? {
      connected: false,
      balanceCents: 0,
      portfolioValueCents: 0,
      balanceDollars: 0,
      portfolioValueDollars: 0,
      openExposureDollars: 0,
      openPositionsCount: 0,
      realizedPnlDollars: 0,
      lastUpdatedTs: new Date().toISOString(),
      error: "Not yet fetched",
    }
  );
}

export function getPositionsView(): PositionView[] {
  return _positions;
}

/** Call after a trade is placed to immediately bust the cache and re-fetch. */
export function invalidateAccountCache(): void {
  _lastRefresh = 0;
}
