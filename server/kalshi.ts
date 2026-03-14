/**
 * Kalshi API — Auth, market scanning, and order placement
 *
 * Auth: RSA-PSS with SHA256
 * Headers: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE
 * Signature: base64(RSA-PSS-SHA256( timestamp + METHOD + path_without_query ))
 */

import crypto from "crypto";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function signRequest(privateKeyPem: string, timestamp: string, method: string, path: string): string {
  // Strip query params before signing
  const pathWithoutQuery = path.split("?")[0];
  const message = `${timestamp}${method}${pathWithoutQuery}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  sign.end();
  const signature = sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}

function authHeaders(apiKeyId: string, privateKeyPem: string, method: string, path: string) {
  const timestamp = Date.now().toString();
  const signature = signRequest(privateKeyPem, timestamp, method, path);
  return {
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "Content-Type": "application/json",
  };
}

async function kalshiGet(apiKeyId: string, privateKeyPem: string, path: string) {
  const fullPath = `/trade-api/v2${path}`;
  const headers = authHeaders(apiKeyId, privateKeyPem, "GET", fullPath);
  const resp = await fetch(`${KALSHI_BASE}${path}`, { headers });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Kalshi GET ${path} failed ${resp.status}: ${body}`);
  }
  return resp.json();
}

async function kalshiPost(apiKeyId: string, privateKeyPem: string, path: string, body: object) {
  const fullPath = `/trade-api/v2${path}`;
  const headers = authHeaders(apiKeyId, privateKeyPem, "POST", fullPath);
  const resp = await fetch(`${KALSHI_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Kalshi POST ${path} failed ${resp.status}: ${text}`);
  }
  return resp.json();
}

// ─── Public API (no auth needed) ─────────────────────────────────────────────

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  // Kalshi public API returns prices with _dollars suffix (0.0–1.0 range)
  yes_bid_dollars?: number;
  yes_ask_dollars?: number;
  no_bid_dollars?: number;
  no_ask_dollars?: number;
  last_price_dollars?: number;
  volume_fp?: number;
  status: string;
  close_time?: string;
  expiration_time?: string;
  // expected_expiration_time = the actual match kickoff time (when the game result is expected).
  // close_time on soccer markets is a 2-week settlement fallback — DO NOT use for game timing.
  expected_expiration_time?: string;
}

// Known Kalshi soccer series tickers — comprehensive list covering all active leagues
// Updated: includes all series confirmed to have open markets
const SOCCER_SERIES = [
  // ── Top 5 European Leagues ────────────────────────────────────────────────
  "KXEPLGAME",              // English Premier League
  "KXBUNDESLIGAGAME",       // Bundesliga (Germany 1st div)
  "KXLALIGAGAME",           // La Liga (Spain 1st div)
  "KXSERIEAGAME",           // Serie A (Italy 1st div)
  "KXLIGAONEGAME",          // Ligue 1 (France 1st div)
  // ── European 2nd Divisions ───────────────────────────────────────────────
  "KXEFLCHAMPIONSHIPGAME",  // EFL Championship (England 2nd)
  "KXBUNDESLIGA2GAME",      // Bundesliga 2 (Germany 2nd)
  "KXLALIGA2GAME",          // LaLiga 2 (Spain 2nd)
  "KXSERIEBGAME",           // Serie B (Italy 2nd)
  // ── European Cups & Continental ─────────────────────────────────────────
  "KXCHAMPIONSLEAGUEGAME",  // UEFA Champions League (legacy series)
  "KXUCLGAME",              // UEFA Champions League (new series)
  "KXEUROPALEAGUEGAME",     // UEFA Europa League (legacy series)
  "KXUELGAME",              // UEFA Europa League (new series)
  "KXUECLGAME",             // UEFA Europa Conference League
  "KXFACUPGAME",            // FA Cup (England)
  "KXEFLCUPGAME",           // EFL Cup (Carabao Cup)
  "KXDFBPOKALGAME",         // DFB-Pokal (Germany Cup)
  "KXCOPADELREYGAME",       // Copa del Rey (Spain Cup)
  "KXCOPPAITALIAGAME",      // Coppa Italia
  "KXCOUPEDEFRANCEGAME",    // Coupe de France
  "KXKNVBCUPGAME",          // KNVB Cup (Netherlands)
  "KXTACAPORTGAME",         // Taça de Portugal
  // ── Other European Leagues ───────────────────────────────────────────────
  "KXSCOTTISHPREMGAME",     // Scottish Premiership
  "KXBELGIANPLGAME",        // Belgian Pro League
  "KXDENSUPERLIGAGAME",     // Danish Superliga
  "KXSUPERLIGGAME",         // Turkish Süper Lig
  "KXSWISSLEAGUEGAME",      // Swiss Super League
  "KXEKSTRAKLASAGAME",      // Polish Ekstraklasa
  "KXCZEFLGAME",            // Czech First League
  "KXHNLGAME",              // Croatian HNL
  "KXSLGREECEGAME",         // Greek Super League
  "KXLIGAPORTUGALGAME",     // Liga Portugal (Primeira Liga)
  // ── Americas ─────────────────────────────────────────────────────────────
  "KXMLSGAME",              // MLS (USA)
  "KXNWSLGAME",             // NWSL (USA Women)
  "KXUSLGAME",              // USL Championship
  "KXLIGAMXGAME",           // Liga MX (Mexico)
  "KXCONCACAFCCUPGAME",     // CONCACAF Champions Cup
  "KXARGPREMDIVGAME",       // Argentine Primera División
  "KXBRASILEIROGAME",       // Brasileirão (Brazil)
  "KXURYPDGAME",            // Uruguayan Primera División
  "KXECULPGAME",            // Ecuador Liga Pro
  "KXPERLIGA1GAME",         // Peruvian Liga 1
  "KXVENFUTVEGAME",         // Venezuelan Liga FUTVE
  "KXAPFDDHGAME",           // APF División de Honor (Paraguay)
  "KXDIMAYORGAME",          // Dominican Republic Di-Mayor
  "KXCHLLDPGAME",           // Chilean Primera División
  // ── Asia / Pacific ───────────────────────────────────────────────────────
  "KXJLEAGUEGAME",          // J-League (Japan)
  "KXKLEAGUEGAME",          // K-League (South Korea)
  "KXALEAGUEGAME",          // A-League (Australia)
  "KXCHNSLGAME",            // Chinese Super League
  "KXTHAIL1GAME",           // Thai League 1
  "KXAFCCLGAME",            // AFC Champions League
  // ── Middle East / Africa ─────────────────────────────────────────────────
  "KXSAUDIPLGAME",          // Saudi Pro League
  "KXAFCONGAME",            // CAF Champions League / AFCON
  // ── International & Other ────────────────────────────────────────────────
  "KXINTLFRIENDLYGAME",     // International Friendlies
  "KXFIFAGAME",             // FIFA competitions
  "KXCLUBWCGAME",           // FIFA Club World Cup
  "KXEWSLGAME",             // English Women's Super League
  // ── Spanish lower divisions (active on Kalshi) ───────────────────────────
  "KXLALIGA2GAME",          // LaLiga Hypermotion (2nd div) — duplicate alias, harmless
  "KXLALIGA3GAME",          // Primera Federación (Spain 3rd)
  "KXLIGUE2GAME",           // Ligue 2 (France 2nd)
];

// Prices from Kalshi are decimals in [0, 1] — already a probability
function priceToProb(price?: number): number | null {
  if (price == null || price <= 0 || price > 1) return null;
  return price; // already a probability (e.g. 0.52 = 52%)
}

/**
 * Get the kickoff (game start) time for a Kalshi soccer market.
 *
 * IMPORTANT: For soccer markets Kalshi sets close_time to a 2-week settlement
 * fallback date — it is NOT the kickoff time. The actual game time is in
 * expected_expiration_time (= when the match result is expected to be known,
 * which is roughly kickoff + ~2 hours).
 *
 * We subtract 2 hours from expected_expiration_time to approximate kickoff.
 * This is close enough for minute estimation purposes.
 */
function getKickoffTime(market: KalshiMarket): string | null {
  if (market.expected_expiration_time) {
    // expected_expiration_time = end-of-match (kickoff + ~2h). Subtract 2h to get kickoff.
    const endMs = new Date(market.expected_expiration_time).getTime();
    const kickoffMs = endMs - 2 * 60 * 60 * 1000;
    return new Date(kickoffMs).toISOString();
  }
  // Fallback: this path should rarely be hit for soccer markets
  return market.expiration_time ?? market.close_time ?? null;
}

/**
 * Returns true if a market's game falls on today's calendar date (UTC).
 */
function isToday(market: KalshiMarket): boolean {
  const kickoff = getKickoffTime(market);
  if (!kickoff) return false;
  const gameDate = new Date(kickoff);
  const now = new Date();
  return (
    gameDate.getUTCFullYear() === now.getUTCFullYear() &&
    gameDate.getUTCMonth() === now.getUTCMonth() &&
    gameDate.getUTCDate() === now.getUTCDate()
  );
}

/**
 * Estimate the current game minute from kickoff time.
 *
 * - If kickoff is in the future: game hasn't started (return undefined)
 * - If kickoff was 0-115 min ago: game is live, estimate minute from elapsed time
 *   (115 min covers 90 min + generous stoppage/extra time buffer)
 * - If kickoff was >115 min ago: game has finished (return undefined)
 *
 * A standard match: 90 min + stoppage. Extra time adds up to 30 more min.
 * We cap at 95 for display but allow up to 115 min elapsed to keep finished
 * games visible briefly while they may still be settling.
 */
function estimateMinute(kickoffTime: string | null): number | undefined {
  if (!kickoffTime) return undefined;
  const kickoffMs = new Date(kickoffTime).getTime();
  const now = Date.now();
  const elapsedMs = now - kickoffMs;      // positive = kickoff has passed
  if (elapsedMs < 0) return undefined;    // not started yet
  if (elapsedMs > 115 * 60000) return undefined; // finished
  return Math.min(95, Math.round(elapsedMs / 60000));
}

export function calculateBloatScore(favoriteProb: number, minuteEstimate?: number): number {
  if (favoriteProb < 0.50 || favoriteProb > 0.85) return 0;
  const base = (favoriteProb - 0.50) * 100;
  let minuteBonus = 0;
  if (minuteEstimate != null) {
    if (minuteEstimate >= 75) minuteBonus = 20;
    else if (minuteEstimate >= 65) minuteBonus = 10;
    else minuteBonus = -10;
  }
  return Math.min(100, Math.max(0, Math.round(base + minuteBonus)));
}

export type MarketTier = "bet" | "watch" | "early" | "cold";

export interface ScoredMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  favoriteProb: number | null;
  drawPrice: number | null;
  yesPrice: number | null;
  minuteEstimate: number | null; // null = pre-game or finished
  kickoffTime: string | null;    // ISO string of estimated kickoff time
  isLive: boolean;               // true if game is currently in progress
  bloatScore: number;
  tier: MarketTier;
}

/** All open soccer markets with tier classification */
export async function fetchAllSoccerMarketsScored(): Promise<ScoredMarket[]> {
  const markets = await fetchSoccerMarkets();
  const scored: ScoredMarket[] = [];

  for (const m of markets) {
    const yesProb = priceToProb(m.yes_bid_dollars);
    const kickoffTime = getKickoffTime(m);
    const minuteEstimate = estimateMinute(kickoffTime);
    const bloatScore = yesProb != null ? calculateBloatScore(yesProb, minuteEstimate) : 0;

    const isLive = minuteEstimate != null;

    // Tier logic:
    // "bet"   — live game, bloatScore >= 40, minute >= 65 → GO NOW (green pulsing)
    // "watch" — live game, bloatScore >= 20, minute 50-64 → warming up (yellow)
    // "early" — live game but < 50 min, OR pre-game → too early (blue)
    // "cold"  — live game with no bloat detected → (dim red)
    let tier: MarketTier;
    if (isLive && bloatScore >= 40 && minuteEstimate! >= 65) {
      tier = "bet";
    } else if (isLive && bloatScore >= 20 && minuteEstimate! >= 50) {
      tier = "watch";
    } else if (!isLive || minuteEstimate! < 50) {
      // Pre-game or very early in the match
      tier = "early";
    } else {
      tier = "cold";
    }

    scored.push({
      ticker: m.ticker,
      eventTicker: m.event_ticker,
      title: m.title,
      favoriteProb: yesProb,
      drawPrice: m.no_bid_dollars ?? null,
      yesPrice: m.yes_bid_dollars ?? null,
      minuteEstimate: minuteEstimate ?? null,
      kickoffTime,
      isLive,
      bloatScore,
      tier,
    });
  }

  // Sort: bet first, then watch, early, cold; within tier by bloatScore desc
  const tierOrder: Record<MarketTier, number> = { bet: 0, watch: 1, early: 2, cold: 3 };
  return scored.sort((a, b) =>
    tierOrder[a.tier] !== tierOrder[b.tier]
      ? tierOrder[a.tier] - tierOrder[b.tier]
      : b.bloatScore - a.bloatScore
  );
}

export async function fetchSoccerMarkets(): Promise<KalshiMarket[]> {
  try {
    // Fetch each soccer series in parallel — Kalshi organises by series ticker
    const results = await Promise.allSettled(
      SOCCER_SERIES.map(async (series) => {
        // Query param is 'open'; Kalshi returns status='active' in the response
        const url = `${KALSHI_BASE}/markets?status=open&limit=200&series_ticker=${series}`;
        const resp = await fetch(url);
        if (!resp.ok) return [] as KalshiMarket[];
        const data = await resp.json();
        return (data.markets ?? []) as KalshiMarket[];
      })
    );

    const all: KalshiMarket[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }

    // Deduplicate by ticker and only keep open markets.
    // Exclude pure "-TIE" markets — those are draw contracts.
    // We want the team-win markets (e.g. "-CFC", "-BMU") which tell us
    // the favourite probability for bloat detection.
    // Also filter to today's games only so the scoreboard stays relevant.
    const seen = new Set<string>();
    return all.filter((m) => {
      if (seen.has(m.ticker)) return false;
      seen.add(m.ticker);
      if (m.status !== "active") return false;
      // Keep team-winner markets only (not the draw/TIE market)
      const upper = m.ticker.toUpperCase();
      if (upper.endsWith("-TIE")) return false;
      // Only show today's games — filter by expected_expiration_time date
      return isToday(m);
    });
  } catch (e) {
    console.error("Kalshi soccer fetch error:", e);
    return [];
  }
}

export interface BloatCandidate {
  eventTicker: string;
  matchTitle: string;
  ticker: string;
  marketTitle: string;
  favoriteProb: number;
  drawProb?: number;
  drawPrice?: number;   // NO price as decimal probability (0-1)
  yesPrice?: number;    // YES price as decimal probability (0-1)
  minuteEstimate?: number;
  bloatScore: number;
}

export async function scanForBloat(config: {
  minFavoriteProb: number;
  maxFavoriteProb: number;
  minMinute?: number;
}): Promise<BloatCandidate[]> {
  const markets = await fetchSoccerMarkets();
  const candidates: BloatCandidate[] = [];

  for (const market of markets) {
    const yesProb = priceToProb(market.yes_bid_dollars);
    if (yesProb == null) continue;

    const favoriteProb = yesProb;
    if (favoriteProb < config.minFavoriteProb || favoriteProb > config.maxFavoriteProb) continue;

    const kickoffTime = getKickoffTime(market);
    const minuteEstimate = estimateMinute(kickoffTime);

    // Skip pre-game (not yet started) and finished markets from the bloat scan.
    // estimateMinute returns undefined for both cases; we only want live games.
    if (minuteEstimate == null) continue;

    // Enforce the minimum-minute threshold (default 65')
    if (config.minMinute != null && minuteEstimate < config.minMinute) continue;

    const bloatScore = calculateBloatScore(favoriteProb, minuteEstimate);
    if (bloatScore < 10) continue;

    const noProb = priceToProb(market.no_bid_dollars);

    candidates.push({
      eventTicker: market.event_ticker,
      matchTitle: market.event_ticker.replace(/-/g, " "),
      ticker: market.ticker,
      marketTitle: market.title,
      favoriteProb,
      drawProb: noProb ?? undefined,
      drawPrice: market.no_bid_dollars,
      yesPrice: market.yes_bid_dollars,
      minuteEstimate,
      bloatScore,
    });
  }

  return candidates.sort((a, b) => b.bloatScore - a.bloatScore);
}

// ─── Authenticated API calls ──────────────────────────────────────────────────

/** Fetch account balance in dollars */
export async function getBalance(apiKeyId: string, privateKeyPem: string): Promise<number> {
  const data = await kalshiGet(apiKeyId, privateKeyPem, "/portfolio/balance");
  // balance is in cents
  return (data.balance ?? 0) / 100;
}

/** Test credentials — returns balance or throws */
export async function testCredentials(apiKeyId: string, privateKeyPem: string): Promise<{ valid: boolean; balance?: number; error?: string }> {
  try {
    const balance = await getBalance(apiKeyId, privateKeyPem);
    return { valid: true, balance };
  } catch (e: unknown) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type BetMode = "no_only" | "yes_only" | "both";

/**
 * Place a bet on a bloat signal.
 * - "no_only": buy NO (draw or upset wins) — the classic favorite-bloat play
 * - "yes_only": buy YES on the favorite — contrarian, only if you want to fade the bloat
 * - "both": place a small bet on both sides (hedge)
 *
 * Returns placed order(s).
 */
export async function placeBloatBet(
  apiKeyId: string,
  privateKeyPem: string,
  ticker: string,
  betMode: BetMode,
  betAmountDollars: number,
  market: { drawPrice?: number; yesPrice?: number }
): Promise<{ orderId: string; side: string; price: number; cost: number }[]> {
  const results: { orderId: string; side: string; price: number; cost: number }[] = [];

  // Helper: calculate contracts from dollar amount and price.
  // price is a decimal probability [0,1] — each contract costs `price` dollars.
  function calcContracts(price: number, dollarBudget: number): number {
    const costPerContract = price; // price IS the dollar cost per contract
    return Math.max(1, Math.floor(dollarBudget / costPerContract));
  }

  async function placeOrder(side: "no" | "yes", price: number, budget: number) {
    const count = calcContracts(price, budget);
    const clientOrderId = `bloat-${Date.now()}-${side}`;

    // Kalshi order API expects prices as integers in cents (1-99)
    const priceInCents = Math.round(price * 100);

    const body: Record<string, unknown> = {
      ticker,
      side,
      action: "buy",
      client_order_id: clientOrderId,
      count,
      time_in_force: "fill_or_kill",
    };

    // Set price on the appropriate side (as integer cents)
    if (side === "no") {
      body.no_price = priceInCents;
    } else {
      body.yes_price = priceInCents;
    }

    const resp = await kalshiPost(apiKeyId, privateKeyPem, "/portfolio/orders", body);
    const order = resp.order;
    results.push({
      orderId: order.order_id,
      side,
      price,          // keep as decimal for display
      cost: price * count, // price (decimal) * contracts = dollars
    });
  }

  if (betMode === "no_only" || betMode === "both") {
    const noPrice = market.drawPrice;
    if (!noPrice) throw new Error("No price not available for this market");
    const budget = betMode === "both" ? betAmountDollars / 2 : betAmountDollars;
    await placeOrder("no", noPrice, budget);
  }

  if (betMode === "yes_only" || betMode === "both") {
    const yesPrice = market.yesPrice;
    if (!yesPrice) throw new Error("Yes price not available for this market");
    const budget = betMode === "both" ? betAmountDollars / 2 : betAmountDollars;
    await placeOrder("yes", yesPrice, budget);
  }

  return results;
}
