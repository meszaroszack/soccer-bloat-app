import { kalshiGet } from "./kalshi";
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

let _snapshot: AccountSnapshot | null = null;
let _positions: PositionView[] = [];
let _lastRefresh = 0;
const CACHE_MS = 45_000;

async function fetchBalanceRaw(apiKeyId: string, pem: string): Promise<any> {
  return kalshiGet("/portfolio/balance", apiKeyId, pem);
}

async function fetchPositionsRaw(apiKeyId: string, pem: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  let page = 0;
  while (page < 10) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const data = await kalshiGet(`/portfolio/positions?${qs}`, apiKeyId, pem);
    const positions = data.market_positions ?? data.positions ?? [];
    all.push(...positions);
    cursor = data.cursor;
    page++;
    if (!cursor || positions.length === 0) break;
  }
  return all;
}

export async function refreshAccountSnapshot(force = false): Promise<void> {
  const creds = getCreds();
  if (!creds) {
    _snapshot = {
      connected: false,
      balanceCents: 0,
      portfolioValueCents: 0,
      balanceDollars: 0,
      portfolioValueDollars: 0,
      openExposureDollars: 0,
      openPositionsCount: 0,
      realizedPnlDollars: 0,
      lastUpdatedTs: new Date().toISOString(),
      error: "No credentials configured",
    };
    _positions = [];
    return;
  }

  if (!force && Date.now() - _lastRefresh < CACHE_MS) return;
  _lastRefresh = Date.now();

  try {
    const [balRaw, posRaw] = await Promise.all([
      fetchBalanceRaw(creds.apiKeyId, creds.privateKeyPem),
      fetchPositionsRaw(creds.apiKeyId, creds.privateKeyPem).catch(() => []),
    ]);

    const bal = balRaw.balance ?? {};
    const balanceCents = Math.round(parseFloat(bal.available_balance_cents ?? bal.balance ?? "0") || 0);
    const portfolioValueCents = Math.round(parseFloat(bal.portfolio_value_cents ?? "0") || 0);

    const openPos: PositionView[] = [];
    let totalExposure = 0;
    let totalRealizedPnl = 0;

    for (const p of posRaw) {
      const posYes = parseFloat(p.position ?? p.yes_position ?? "0") || 0;
      const posNo = parseFloat(p.no_position ?? "0") || 0;
      const totalPos = Math.abs(posYes) + Math.abs(posNo);
      if (totalPos === 0) continue;

      const realizedPnl = parseFloat(p.realized_pnl ?? "0") || 0;
      const fees = parseFloat(p.fees_paid ?? "0") || 0;
      const exposure = (parseFloat(p.market_exposure_cents ?? "0") || 0) / 100;
      const totalTraded = (parseFloat(p.total_traded_cents ?? "0") || 0) / 100;

      totalExposure += Math.abs(exposure);
      totalRealizedPnl += realizedPnl / 100;

      const side: PositionView["side"] =
        posYes > 0 && posNo > 0
          ? "both"
          : posYes > 0
            ? "yes"
            : posNo > 0
              ? "no"
              : "unknown";

      openPos.push({
        eventTicker: p.event_ticker ?? "",
        ticker: p.ticker ?? "",
        marketTitle: p.market_title ?? p.ticker ?? "",
        side,
        positionYes: posYes,
        positionNo: posNo,
        positionShares: totalPos,
        marketExposureDollars: exposure,
        totalTradedDollars: totalTraded,
        realizedPnlDollars: realizedPnl / 100,
        feesPaidDollars: fees / 100,
        lastUpdatedTs: p.last_updated_ts ?? new Date().toISOString(),
      });
    }

    _positions = openPos;
    _snapshot = {
      connected: true,
      balanceCents,
      portfolioValueCents,
      balanceDollars: balanceCents / 100,
      portfolioValueDollars: portfolioValueCents / 100,
      openExposureDollars: totalExposure,
      openPositionsCount: openPos.length,
      realizedPnlDollars: totalRealizedPnl,
      lastUpdatedTs: new Date().toISOString(),
    };
  } catch (err) {
    _snapshot = {
      connected: false,
      balanceCents: 0,
      portfolioValueCents: 0,
      balanceDollars: 0,
      portfolioValueDollars: 0,
      openExposureDollars: 0,
      openPositionsCount: 0,
      realizedPnlDollars: 0,
      lastUpdatedTs: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
    _positions = [];
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
