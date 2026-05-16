import crypto from "crypto";
import type { NormalizedEvent, NormalizedMarket, MarketType } from "../shared/types";

const BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";
const API_PREFIX = "/trade-api/v2";

function buildSignature(
  privateKeyPem: string,
  timestampMs: string,
  method: string,
  routePath: string,
): string {
  const pathOnly = routePath.split("?")[0];
  const msgString = timestampMs + method + API_PREFIX + pathOnly;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(msgString);
  sign.end();
  return sign
    .sign({
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString("base64");
}

export async function kalshiGet(
  routePath: string,
  apiKeyId?: string,
  privateKeyPem?: string,
): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKeyId && privateKeyPem) {
    const ts = Date.now().toString();
    headers["KALSHI-ACCESS-KEY"] = apiKeyId;
    headers["KALSHI-ACCESS-TIMESTAMP"] = ts;
    headers["KALSHI-ACCESS-SIGNATURE"] = buildSignature(privateKeyPem, ts, "GET", routePath);
  }
  const res = await fetch(`${BASE_URL}${routePath}`, { headers });
  if (!res.ok) throw new Error(`Kalshi ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function kalshiPost(
  routePath: string,
  body: object,
  apiKeyId: string,
  privateKeyPem: string,
): Promise<any> {
  const ts = Date.now().toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-TIMESTAMP": ts,
    "KALSHI-ACCESS-SIGNATURE": buildSignature(privateKeyPem, ts, "POST", routePath),
  };
  const res = await fetch(`${BASE_URL}${routePath}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kalshi ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getBalance(apiKeyId: string, privateKeyPem: string): Promise<number> {
  const data = await kalshiGet("/portfolio/balance", apiKeyId, privateKeyPem);
  return data.balance?.available_balance_cents ?? 0;
}

export async function testCredentials(
  apiKeyId: string,
  privateKeyPem: string,
): Promise<{ valid: boolean; balance?: number; error?: string }> {
  try {
    const balance = await getBalance(apiKeyId, privateKeyPem);
    return { valid: true, balance };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchPaginatedMarkets(
  params: { limit?: number; cursor?: string; status?: string; seriesTicker?: string } = {},
): Promise<{ markets: any[]; cursor?: string }> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 200));
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.status) qs.set("status", params.status);
  if (params.seriesTicker) qs.set("series_ticker", params.seriesTicker);

  const data = await kalshiGet(`/markets?${qs.toString()}`);
  return { markets: data.markets ?? [], cursor: data.cursor };
}

export async function fetchAllSportsMarkets(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  let page = 0;
  const maxPages = 20;

  while (page < maxPages) {
    const { markets, cursor: next } = await fetchPaginatedMarkets({
      limit: 200,
      cursor,
      status: "open",
    });

    const sports = markets.filter((m) => isSportsMarket(m));
    all.push(...sports);

    cursor = next;
    page++;
    if (!next || markets.length === 0) break;
  }

  return all;
}

function isSportsMarket(m: any): boolean {
  const text = `${m.title ?? ""} ${m.subtitle ?? ""} ${m.event_title ?? ""} ${m.series_ticker ?? ""} ${m.event_ticker ?? ""}`.toLowerCase();
  const sportKeywords = [
    "soccer",
    "football",
    "nfl",
    "nba",
    "mlb",
    "nhl",
    "mls",
    "premier",
    "laliga",
    "bundesliga",
    "serie a",
    "ligue 1",
    "champions",
    "europa",
    "world cup",
    "formula",
    "f1",
    "tennis",
    "ufc",
    "mma",
    "boxing",
    "nascar",
    "golf",
    "pga",
    "olympic",
    "hockey",
    "basketball",
    "baseball",
    "cricket",
    "rugby",
    "afl",
    "nrl",
  ];
  return sportKeywords.some((k) => text.includes(k));
}

export function parseMarketType(m: any): MarketType {
  const title = `${m.title ?? ""} ${m.subtitle ?? ""}`.toLowerCase();
  if (title.includes("draw") || title.includes("tie")) return "three_way";
  if (title.includes("spread") || title.includes("+") || title.includes("-")) return "spread";
  if (title.includes("over") || title.includes("under") || title.includes("total")) return "total";
  if (title.includes("win") || title.includes("beat") || title.includes("moneyline")) return "moneyline";
  if (title.includes("prop") || title.includes("score") || title.includes("goal")) return "prop";
  return "moneyline";
}

export function inferSportLeague(m: any): { sport: string; league: string } {
  const text = `${m.title ?? ""} ${m.event_title ?? ""} ${m.series_ticker ?? ""} ${m.event_ticker ?? ""}`.toUpperCase();

  if (text.includes("NFL") || text.includes("FOOTBALL")) return { sport: "American Football", league: "NFL" };
  if (text.includes("NBA")) return { sport: "Basketball", league: "NBA" };
  if (text.includes("MLB")) return { sport: "Baseball", league: "MLB" };
  if (text.includes("NHL")) return { sport: "Hockey", league: "NHL" };
  if (text.includes("MLS")) return { sport: "Soccer", league: "MLS" };
  if (text.includes("PREMIER") || text.includes("EPL")) return { sport: "Soccer", league: "Premier League" };
  if (text.includes("LALIGA") || text.includes("LA LIGA")) return { sport: "Soccer", league: "La Liga" };
  if (text.includes("BUNDESLIGA")) return { sport: "Soccer", league: "Bundesliga" };
  if (text.includes("SERIEA") || text.includes("SERIE A")) return { sport: "Soccer", league: "Serie A" };
  if (text.includes("LIGUE")) return { sport: "Soccer", league: "Ligue 1" };
  if (text.includes("UCL") || text.includes("CHAMPIONS")) return { sport: "Soccer", league: "Champions League" };
  if (text.includes("EUROPA")) return { sport: "Soccer", league: "Europa League" };
  if (text.includes("UFC") || text.includes("MMA")) return { sport: "MMA", league: "UFC" };
  if (text.includes("TENNIS")) return { sport: "Tennis", league: "Tennis" };
  if (text.includes("F1") || text.includes("FORMULA")) return { sport: "Motorsport", league: "F1" };
  if (text.includes("GOLF") || text.includes("PGA")) return { sport: "Golf", league: "PGA" };
  if (text.includes("BOXING")) return { sport: "Boxing", league: "Boxing" };
  if (text.includes("NASCAR")) return { sport: "Motorsport", league: "NASCAR" };
  if (text.includes("CRICKET")) return { sport: "Cricket", league: "Cricket" };
  if (text.includes("RUGBY")) return { sport: "Rugby", league: "Rugby" };
  if (text.includes("SOCCER")) return { sport: "Soccer", league: "Soccer" };

  return { sport: "Sports", league: "Other" };
}

export function normalizeMarket(m: any): NormalizedMarket {
  const yesPrice = parseFloat(m.yes_bid ?? m.last_price ?? "0.5") || 0.5;
  const noPrice = parseFloat(m.no_bid ?? "0") || 1 - yesPrice;
  return {
    ticker: m.ticker ?? "",
    title: m.title ?? m.ticker ?? "",
    subtitle: m.subtitle,
    yesPrice: Math.min(0.99, Math.max(0.01, yesPrice)),
    noPrice: Math.min(0.99, Math.max(0.01, noPrice)),
    yesBid: parseFloat(m.yes_bid) || undefined,
    noAsk: parseFloat(m.no_ask) || undefined,
    volume: m.volume ?? 0,
    openInterest: m.open_interest ?? 0,
    status: m.status ?? "open",
  };
}

export function groupMarketsIntoEvents(markets: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const m of markets) {
    const key = m.event_ticker ?? m.ticker;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  return groups;
}

export function buildNormalizedEvent(eventTicker: string, rawMarkets: any[]): NormalizedEvent {
  if (!rawMarkets.length) throw new Error("No markets for event");

  const first = rawMarkets[0];
  const { sport, league } = inferSportLeague(first);
  const normalizedMarkets = rawMarkets.map(normalizeMarket);

  const marketType = parseMarketType(first);
  const hasDraw = rawMarkets.some((m) => {
    const t = `${m.title ?? ""} ${m.subtitle ?? ""}`.toLowerCase();
    return t.includes("draw") || t.includes("tie");
  });

  const nonDrawMarkets = normalizedMarkets.filter((m) => {
    const t = `${m.title} ${m.subtitle ?? ""}`.toLowerCase();
    return !t.includes("draw") && !t.includes("tie");
  });

  const favorite = nonDrawMarkets.reduce(
    (a, b) => (a.yesPrice >= b.yesPrice ? a : b),
    nonDrawMarkets[0] ?? normalizedMarkets[0],
  );
  const favoriteProb = favorite?.yesPrice ?? 0.5;

  const drawMarket = normalizedMarkets.find((m) => {
    const t = `${m.title} ${m.subtitle ?? ""}`.toLowerCase();
    return t.includes("draw") || t.includes("tie");
  });

  const rawTitle = first.event_title ?? first.title ?? eventTicker;
  const matchup = rawTitle;

  const kickoffTime = getKickoffTimeFromMarket(first);
  const minute = estimateMinute(kickoffTime);
  const isLive = kickoffTime !== null && minute >= 0 && minute <= 115;

  const favoriteName = favorite?.subtitle ?? favorite?.title ?? "Favorite";

  return {
    eventTicker,
    sport,
    league,
    matchup,
    status: first.status ?? "open",
    kickoffTime,
    isLive,
    minuteEstimate: minute,
    marketType: hasDraw ? "three_way" : marketType,
    markets: normalizedMarkets,
    favoriteSide: favoriteName,
    favoriteProb,
    drawProb: drawMarket?.yesPrice,
    yesNoStructure: true,
    latestCompositeScore: 0,
    latestHeatmapBreakdown: [],
    detectedStrategies: [],
    lastUpdated: new Date(),
  };
}

function getKickoffTimeFromMarket(m: any): number | null {
  const exp = m.expected_expiration_time ?? m.expiration_time;
  if (!exp) return null;
  return new Date(exp).getTime() - 2 * 60 * 60 * 1000;
}

function estimateMinute(kickoffTime: number | null): number {
  if (!kickoffTime) return 0;
  const elapsed = (Date.now() - kickoffTime) / 60_000;
  return Math.max(0, Math.round(elapsed));
}

export async function placeOrder(
  apiKeyId: string,
  privateKeyPem: string,
  ticker: string,
  side: "yes" | "no",
  pricePercent: number,
  amountDollars: number,
): Promise<any> {
  const amountCents = Math.round(amountDollars * 100);
  const priceInt = Math.round(pricePercent * 100);
  return kalshiPost(
    "/portfolio/orders",
    {
      ticker,
      action: "buy",
      side,
      type: "limit",
      count: amountCents,
      [`${side}_price`]: priceInt,
    },
    apiKeyId,
    privateKeyPem,
  );
}
