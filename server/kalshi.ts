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

// Sport series config (verified working tickers)
export const SPORTS_SERIES: Array<{ seriesTicker: string; sport: string; league: string }> = [
  { seriesTicker: "KXMLBGAME", sport: "Baseball", league: "MLB" },
  { seriesTicker: "KXMLBSPREAD", sport: "Baseball", league: "MLB" },
  { seriesTicker: "KXNBAGAME", sport: "Basketball", league: "NBA" },
  { seriesTicker: "KXNBASPREAD", sport: "Basketball", league: "NBA" },
  { seriesTicker: "KXNHLGAME", sport: "Hockey", league: "NHL" },
  { seriesTicker: "KXNHLSPREAD", sport: "Hockey", league: "NHL" },
  { seriesTicker: "KXNFLGAME", sport: "Football", league: "NFL" },
  { seriesTicker: "KXNFLSPREAD", sport: "Football", league: "NFL" },
  { seriesTicker: "KXMLSGAME", sport: "Soccer", league: "MLS" },
  { seriesTicker: "KXSOCCERGAME", sport: "Soccer", league: "Soccer" },
  { seriesTicker: "KXSOCCERSPREAD", sport: "Soccer", league: "Soccer" },
  { seriesTicker: "KXUFCFIGHT", sport: "MMA", league: "UFC" },
  { seriesTicker: "KXTENNIS", sport: "Tennis", league: "Tennis" },
  { seriesTicker: "KXWNBAGAME", sport: "Basketball", league: "WNBA" },
  { seriesTicker: "KXWNBASPREAD", sport: "Basketball", league: "WNBA" },
  { seriesTicker: "KXNASCARRACE", sport: "Motorsport", league: "NASCAR" },
  { seriesTicker: "KXPGAGOLF", sport: "Golf", league: "PGA" },
];

export async function fetchSeriesEvents(
  seriesTicker: string,
  apiKeyId?: string,
  privateKeyPem?: string,
): Promise<any[]> {
  try {
    const qs = new URLSearchParams({
      limit: "100",
      series_ticker: seriesTicker,
      status: "open",
    });
    const data = await kalshiGet(`/events?${qs.toString()}`, apiKeyId, privateKeyPem);
    return data.events ?? [];
  } catch {
    return [];
  }
}

export async function fetchEventMarkets(
  eventTicker: string,
  apiKeyId?: string,
  privateKeyPem?: string,
): Promise<any[]> {
  try {
    const qs = new URLSearchParams({
      event_ticker: eventTicker,
      status: "open",
      limit: "20",
    });
    const data = await kalshiGet(`/markets?${qs.toString()}`, apiKeyId, privateKeyPem);
    return data.markets ?? [];
  } catch {
    return [];
  }
}

export async function fetchAllSportsMarkets(): Promise<
  Array<{ event: any; markets: any[]; sport: string; league: string }>
> {
  const results: Array<{ event: any; markets: any[]; sport: string; league: string }> = [];
  const seenEventTickers = new Set<string>();

  for (const seriesConfig of SPORTS_SERIES) {
    const events = await fetchSeriesEvents(seriesConfig.seriesTicker);

    for (const event of events) {
      if (seenEventTickers.has(event.event_ticker)) continue;
      seenEventTickers.add(event.event_ticker);

      const markets = await fetchEventMarkets(event.event_ticker);
      if (markets.length > 0) {
        results.push({
          event,
          markets,
          sport: seriesConfig.sport,
          league: seriesConfig.league,
        });
      }

      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return results;
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
  if (text.includes("UCL") || text.includes("CHAMPIONS")) return { sport: "Soccer", league: "Champions League" };
  if (text.includes("UFC") || text.includes("MMA")) return { sport: "MMA", league: "UFC" };
  if (text.includes("TENNIS")) return { sport: "Tennis", league: "Tennis" };
  if (text.includes("F1") || text.includes("FORMULA")) return { sport: "Motorsport", league: "F1" };
  if (text.includes("GOLF") || text.includes("PGA")) return { sport: "Golf", league: "PGA" };

  return { sport: "Sports", league: "Other" };
}

export function normalizeMarket(m: any): NormalizedMarket {
  const yesBid = parseFloat(m.yes_bid_dollars ?? "0") || 0;
  const noAsk = parseFloat(m.no_ask_dollars ?? "0") || 0;
  const yesAsk = parseFloat(m.yes_ask_dollars ?? "0") || 0;
  const noBid = parseFloat(m.no_bid_dollars ?? "0") || 0;
  const lastPrice = parseFloat(m.last_price_dollars ?? "0") || 0;

  let yesPrice = yesBid > 0 && yesAsk > 0 ? (yesBid + yesAsk) / 2 : yesBid || yesAsk || lastPrice || 0.5;
  let noPrice = noBid > 0 && noAsk > 0 ? (noBid + noAsk) / 2 : noBid || noAsk || 1 - yesPrice;

  yesPrice = Math.min(0.99, Math.max(0.01, yesPrice));
  noPrice = Math.min(0.99, Math.max(0.01, noPrice));

  return {
    ticker: m.ticker ?? "",
    title: m.title ?? m.ticker ?? "",
    subtitle: m.yes_sub_title ?? "",
    yesPrice,
    noPrice,
    yesBid: yesBid || undefined,
    noAsk: noAsk || undefined,
    volume: parseFloat(m.volume_fp ?? m.volume_24h_fp ?? "0") || 0,
    openInterest: parseFloat(m.open_interest_fp ?? "0") || 0,
    status: m.status ?? "open",
  };
}

export function groupMarketsIntoEvents(_markets: any[]): Map<string, any[]> {
  return new Map();
}

export function buildNormalizedEvent(eventData: {
  event: any;
  markets: any[];
  sport: string;
  league: string;
}): NormalizedEvent {
  const { event, markets: rawMarkets, sport, league } = eventData;

  if (!rawMarkets.length) throw new Error("No markets");

  const normalizedMarkets = rawMarkets.map(normalizeMarket);

  const hasDraw = rawMarkets.some((m) => {
    const sub = (m.yes_sub_title ?? "").toLowerCase();
    return sub === "draw" || sub === "tie" || sub.includes("draw") || sub.includes("tie");
  });

  const nonDrawMarkets = normalizedMarkets.filter((m) => {
    const sub = (m.subtitle ?? "").toLowerCase();
    return sub !== "draw" && sub !== "tie" && !sub.includes("draw") && !sub.includes("tie");
  });

  const drawMarket = normalizedMarkets.find((m) => {
    const sub = (m.subtitle ?? "").toLowerCase();
    return sub === "draw" || sub === "tie" || sub.includes("draw");
  });

  const mainMarkets = nonDrawMarkets.length > 0 ? nonDrawMarkets : normalizedMarkets;
  const favorite = mainMarkets.reduce((a, b) => (a.yesPrice >= b.yesPrice ? a : b), mainMarkets[0]);
  const favoriteProb = favorite?.yesPrice ?? 0.5;
  const favoriteName = favorite?.subtitle || favorite?.title || "Favorite";

  const rawTitle = event.title ?? event.sub_title ?? event.event_ticker;
  const matchup = rawTitle;

  const kickoffTime = getKickoffTimeFromMarket(rawMarkets[0]);
  const minute = estimateMinute(kickoffTime);
  const isLive = kickoffTime !== null && minute >= 0 && minute <= 200;

  const seriesTicker = (event.series_ticker ?? "").toUpperCase();
  let marketType: MarketType = "moneyline";
  if (hasDraw) marketType = "three_way";
  else if (seriesTicker.includes("SPREAD")) marketType = "spread";
  else if (seriesTicker.includes("TOTAL") || seriesTicker.includes("OVER")) marketType = "total";

  return {
    eventTicker: event.event_ticker,
    sport,
    league,
    matchup,
    status: "open",
    kickoffTime,
    isLive,
    minuteEstimate: isLive ? minute : 0,
    marketType,
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
  const exp = m.close_time ?? m.expected_expiration_time ?? m.expiration_time;
  if (!exp) return null;
  return new Date(exp).getTime() - 3 * 60 * 60 * 1000;
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
