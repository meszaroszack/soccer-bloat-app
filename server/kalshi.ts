import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BetMode = "no" | "yes" | "both";

export interface TeamMarket {
  ticker: string;
  teamCode: string;   // e.g. "CFC", "NEW", "TIE"
  label: string;      // e.g. "Chelsea", "Newcastle", "Draw"
  yesPrice: number;   // probability [0,1]
  noPrice: number;
}

export interface PricePoint {
  minute: number;
  favoriteProb: number;
  ts: number; // unix ms
}

export interface EventSnapshot {
  eventTicker: string;
  gameTitle: string;       // "Chelsea vs Newcastle"
  home: TeamMarket;
  away: TeamMarket;
  draw: TeamMarket;
  favorite: TeamMarket;    // home or away with highest yesPrice
  favoriteProb: number;    // 0–1
  minute: number;          // estimated elapsed game minute (0 if pre-game)
  isLive: boolean;
  kickoffTime: number | null; // unix ms, null if unknown
  bloatScore: number;      // 0–100
  tier: "bet" | "watch" | "early" | "cold";
  priceHistory: PricePoint[]; // up to 60 points
}

// ─── Ticker / URL Parsing ─────────────────────────────────────────────────────

/**
 * Accepts:
 *   • Full Kalshi URL:  https://kalshi.com/markets/kxeplgame-26mar14cfcnew/chelsea-wins
 *   • Short market ticker: KXEPLGAME-26MAR14CFCNEW-CFC
 *   • Event ticker:        KXEPLGAME-26MAR14CFCNEW
 *
 * Returns the event ticker (uppercase, 2-segment, no team suffix), or null.
 */
export function parseEventTicker(input: string): string | null {
  try {
    let raw = input.trim();

    // If it looks like a URL, extract the path segment after /markets/
    if (raw.startsWith("http")) {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("markets");
      if (idx === -1 || idx + 1 >= parts.length) return null;
      raw = parts[idx + 1]; // e.g. "kxeplgame-26mar14cfcnew"
    }

    // Uppercase
    raw = raw.toUpperCase();

    // Split by dash — event tickers have exactly 2 segments, market tickers 3
    const segments = raw.split("-");
    if (segments.length === 3) {
      // Drop the 3rd segment (team code), keep first 2
      return `${segments[0]}-${segments[1]}`;
    }
    if (segments.length === 2) {
      return raw;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Kalshi API helpers ───────────────────────────────────────────────────────

const BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

async function kalshiGet(path: string, apiKeyId?: string, privateKeyPem?: string): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (apiKeyId && privateKeyPem) {
    const ts = Date.now().toString();
    const msg = ts + "GET" + path.split("?")[0];
    const key = crypto.createPrivateKey(privateKeyPem);
    const sig = crypto.sign("sha256", Buffer.from(msg), { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
    headers["KALSHI-ACCESS-KEY"] = apiKeyId;
    headers["KALSHI-ACCESS-TIMESTAMP"] = ts;
    headers["KALSHI-ACCESS-SIGNATURE"] = sig.toString("base64");
  }

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Kalshi API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function kalshiPost(path: string, body: object, apiKeyId: string, privateKeyPem: string): Promise<any> {
  const ts = Date.now().toString();
  const pathOnly = path.split("?")[0];
  const msg = ts + "POST" + pathOnly;
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign("sha256", Buffer.from(msg), { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": apiKeyId,
      "KALSHI-ACCESS-TIMESTAMP": ts,
      "KALSHI-ACCESS-SIGNATURE": sig.toString("base64"),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kalshi API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Timing ───────────────────────────────────────────────────────────────────

export function getKickoffTime(market: any): number | null {
  // expected_expiration_time ≈ end of match = kickoff + 2h
  const exp = market.expected_expiration_time ?? market.expiration_time;
  if (!exp) return null;
  return new Date(exp).getTime() - 2 * 60 * 60 * 1000;
}

export function estimateMinute(kickoffTime: number | null): number {
  if (!kickoffTime) return 0;
  const elapsed = (Date.now() - kickoffTime) / 60_000;
  return Math.max(0, Math.round(elapsed));
}

// ─── Bloat score ──────────────────────────────────────────────────────────────

export function calculateBloatScore(favoriteProb: number, minute: number): number {
  if (favoriteProb < 0.50) return 0;
  const base = (favoriteProb - 0.50) * 100;
  let bonus = -10;
  if (minute >= 75) bonus = 20;
  else if (minute >= 65) bonus = 10;
  return Math.min(100, Math.max(0, base + bonus));
}

function scoreTier(score: number, minute: number, isLive: boolean): "bet" | "watch" | "early" | "cold" {
  if (!isLive) return "early";
  if (score >= 40 && minute >= 65) return "bet";
  if (score >= 20 && minute >= 50) return "watch";
  if (score < 10) return "cold";
  return "early";
}

// ─── Team label extraction ────────────────────────────────────────────────────

function labelFromTicker(ticker: string): string {
  // ticker format: KXEPLGAME-26MAR14CFCNEW-CFC
  // We use the team code as a fallback; the market's title field is better if present
  const parts = ticker.split("-");
  return parts[parts.length - 1] ?? ticker;
}

// ─── Main snapshot fetch ──────────────────────────────────────────────────────

export async function fetchEventSnapshot(
  eventTicker: string,
  priorHistory: PricePoint[] = []
): Promise<EventSnapshot> {
  // Fetch all open markets for this event
  const data = await kalshiGet(`/markets?event_ticker=${encodeURIComponent(eventTicker)}&status=open&limit=10`);
  const markets: any[] = data.markets ?? [];

  if (markets.length === 0) {
    // Try without status filter — game may be settled
    const data2 = await kalshiGet(`/markets?event_ticker=${encodeURIComponent(eventTicker)}&limit=10`);
    markets.push(...(data2.markets ?? []));
  }

  if (markets.length === 0) throw new Error(`No markets found for event ${eventTicker}`);

  // Identify home, away, draw by market ticker suffix
  // The 3rd segment of a market ticker is the team code
  let home: TeamMarket | null = null;
  let away: TeamMarket | null = null;
  let draw: TeamMarket | null = null;

  // Extract the 2-char team codes from the event ticker itself
  // Event ticker: KXEPLGAME-26MAR14CFCNEW → last part "CFCNEW" = home "CFC" + away "NEW"
  const eventParts = eventTicker.split("-");
  const teamsStr = eventParts[eventParts.length - 1] ?? ""; // e.g. "CFCNEW"

  for (const m of markets) {
    const segments = (m.ticker as string).split("-");
    const teamCode = segments[segments.length - 1] ?? "";
    const yesPrice = parseFloat(m.yes_bid ?? m.last_price ?? "0.5") || 0.5;
    const noPrice = parseFloat(m.no_bid ?? "0") || (1 - yesPrice);
    const label = m.subtitle ?? m.title ?? teamCode;

    const tm: TeamMarket = { ticker: m.ticker, teamCode, label, yesPrice, noPrice };

    if (teamCode === "TIE" || teamCode === "DRAW") {
      draw = tm;
    } else if (!home) {
      home = tm;
    } else {
      away = tm;
    }
  }

  // Fallback: if we couldn't classify, use position
  if (!home && markets[0]) {
    const m = markets[0];
    const teamCode = m.ticker.split("-").pop() ?? "";
    home = { ticker: m.ticker, teamCode, label: m.subtitle ?? teamCode, yesPrice: parseFloat(m.yes_bid ?? "0.5") || 0.5, noPrice: parseFloat(m.no_bid ?? "0.5") || 0.5 };
  }
  if (!away && markets[1]) {
    const m = markets[1];
    const teamCode = m.ticker.split("-").pop() ?? "";
    away = { ticker: m.ticker, teamCode, label: m.subtitle ?? teamCode, yesPrice: parseFloat(m.yes_bid ?? "0.5") || 0.5, noPrice: parseFloat(m.no_bid ?? "0.5") || 0.5 };
  }
  if (!draw && markets[2]) {
    const m = markets[2];
    const teamCode = m.ticker.split("-").pop() ?? "";
    draw = { ticker: m.ticker, teamCode, label: m.subtitle ?? teamCode, yesPrice: parseFloat(m.yes_bid ?? "0.5") || 0.5, noPrice: parseFloat(m.no_bid ?? "0.5") || 0.5 };
  }

  // Ensure draw has a sensible label
  if (draw && (draw.label === "TIE" || draw.label === draw.teamCode)) {
    draw = { ...draw, label: "Draw" };
  }

  // Determine favorite
  const candidates = [home, away].filter(Boolean) as TeamMarket[];
  const favorite = candidates.reduce((a, b) => (a.yesPrice >= b.yesPrice ? a : b), candidates[0]);
  const favoriteProb = favorite?.yesPrice ?? 0;

  // Timing
  const firstMarket = markets[0];
  const kickoffTime = getKickoffTime(firstMarket);
  const minute = estimateMinute(kickoffTime);
  const isLive = kickoffTime !== null && minute >= 0 && minute <= 115;

  // Bloat score
  const bloatScore = calculateBloatScore(favoriteProb, minute);
  const tier = scoreTier(bloatScore, minute, isLive);

  // Game title from event subtitle or market titles
  const rawTitle = firstMarket?.event_title ?? firstMarket?.title ?? eventTicker;
  // Normalise "Chelsea FC wins" → try to make it "Chelsea vs Newcastle"
  const gameTitle = rawTitle.includes(" vs ") ? rawTitle : `${home?.label ?? "Home"} vs ${away?.label ?? "Away"}`;

  // Price history — append current point, keep last 60
  const now = Date.now();
  const newPoint: PricePoint = { minute, favoriteProb, ts: now };
  const history = [...priorHistory, newPoint].slice(-60);

  return {
    eventTicker,
    gameTitle,
    home: home!,
    away: away!,
    draw: draw ?? { ticker: "", teamCode: "TIE", label: "Draw", yesPrice: 0, noPrice: 0 },
    favorite,
    favoriteProb,
    minute,
    isLive,
    kickoffTime,
    bloatScore,
    tier,
    priceHistory: history,
  };
}

// ─── Betting ──────────────────────────────────────────────────────────────────

export async function placeBloatBet(
  apiKeyId: string,
  privateKeyPem: string,
  ticker: string,
  betMode: BetMode,
  betAmountDollars: number,
  prices?: { drawPrice?: number; yesPrice?: number }
): Promise<any[]> {
  const amountCents = Math.round(betAmountDollars * 100);
  const orders: any[] = [];

  if (betMode === "no" || betMode === "both") {
    // Bet NO on the favourite — compression bet
    const order = await kalshiPost("/portfolio/orders", {
      ticker,
      action: "buy",
      side: "no",
      type: "limit",
      count: amountCents,
      no_price: Math.round((prices?.drawPrice ?? 0.5) * 100),
    }, apiKeyId, privateKeyPem);
    orders.push(order);
  }

  if (betMode === "yes" || betMode === "both") {
    // Bet YES (contrarian)
    const order = await kalshiPost("/portfolio/orders", {
      ticker,
      action: "buy",
      side: "yes",
      type: "limit",
      count: amountCents,
      yes_price: Math.round((prices?.yesPrice ?? 0.5) * 100),
    }, apiKeyId, privateKeyPem);
    orders.push(order);
  }

  return orders;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function getBalance(apiKeyId: string, privateKeyPem: string): Promise<number> {
  const data = await kalshiGet("/portfolio/balance", apiKeyId, privateKeyPem);
  return data.balance?.available_balance_cents ?? 0;
}

export async function testCredentials(apiKeyId: string, privateKeyPem: string): Promise<{ valid: boolean; balance?: number; error?: string }> {
  try {
    const balance = await getBalance(apiKeyId, privateKeyPem);
    return { valid: true, balance };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}
