import { store } from "./storage";
import type {
  PerplexityDailyReport,
  PerplexityEventFocus,
  NormalizedEvent,
} from "../shared/types";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shouldRunDailyReport(): boolean {
  const settings = store.getSettings();
  if (!settings.perplexityDailyReportEnabled) return false;
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return false;

  const existing = store.getTodayReport();
  if (existing) return false;

  const [h, m] = settings.perplexityDailyReportTimeEt.split(":").map(Number);
  const now = new Date();
  const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return etNow.getHours() > h || (etNow.getHours() === h && etNow.getMinutes() >= m);
}

export async function generateDailyReport(
  topEvents: NormalizedEvent[],
): Promise<PerplexityDailyReport | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;

  const top20 = topEvents.slice(0, 20);
  if (top20.length === 0) return null;

  const todayStr = getTodayDateStr();
  const existing = store.getPerplexityReport(todayStr);
  if (existing) return existing;

  const eventPayload = top20.map((e) => ({
    eventTicker: e.eventTicker,
    sport: e.sport,
    league: e.league,
    matchup: e.matchup,
    startTime: e.kickoffTime ? new Date(e.kickoffTime).toISOString() : null,
    favoriteSide: e.favoriteSide,
    favoriteProb: e.favoriteProb,
    compositeScore: e.latestCompositeScore,
    strategies: e.detectedStrategies,
  }));

  const systemPrompt =
    "You are a sports market research assistant helping rank Kalshi sports events by contextual attention-worthiness. Return strict JSON only. Be concise. Use citations when possible. Do not restate the prompt.";
  const userPrompt = `Here are the top ${top20.length} Kalshi candidate events for today. Rank which ones deserve focus today. Score each with newsShockScore, consensusConfidence, mispricingNarrativeScore, riskScore, actionabilityScore, bullCase, bearCase, baseCase, shortReason. Also return top leagueThemes array with {league, theme}. JSON only.\n\n${JSON.stringify(
    eventPayload,
    null,
    2,
  )}`;

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
      }),
    });

    if (!res.ok) {
      console.error("Perplexity API error:", res.status, await res.text());
      return null;
    }

    const json = await res.json();
    const rawContent: string = json.choices?.[0]?.message?.content ?? "";

    let parsed: any = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse Perplexity JSON response");
      return null;
    }

    const focusEvents: PerplexityEventFocus[] = (parsed.events ?? parsed.focusEvents ?? []).map(
      (e: any) => ({
        eventTicker: e.eventTicker ?? "",
        matchup: e.matchup ?? "",
        newsShockScore: e.newsShockScore ?? 0,
        consensusConfidence: e.consensusConfidence ?? 0,
        mispricingNarrativeScore: e.mispricingNarrativeScore ?? 0,
        riskScore: e.riskScore ?? 0,
        actionabilityScore: e.actionabilityScore ?? 0,
        bullCase: e.bullCase ?? "",
        bearCase: e.bearCase ?? "",
        baseCase: e.baseCase ?? "",
        shortReason: e.shortReason ?? "",
      }),
    );

    const leagueThemes = (parsed.leagueThemes ?? []).map((t: any) => ({
      league: t.league ?? "",
      theme: t.theme ?? "",
    }));

    const report: PerplexityDailyReport = {
      generatedAt: new Date(),
      date: todayStr,
      focusEvents,
      leagueThemes,
      citations: json.citations ?? [],
      rawResponse: rawContent,
    };

    store.savePerplexityReport(report);
    return report;
  } catch (err) {
    console.error("Perplexity service error:", err);
    return null;
  }
}

export async function manualRefresh(
  topEvents: NormalizedEvent[],
): Promise<PerplexityDailyReport | null> {
  const todayStr = getTodayDateStr();
  store.perplexityReports.delete(todayStr);
  return generateDailyReport(topEvents);
}
