import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, heatBgClass, heatClass } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";
import { EventDrawer } from "../components/EventDrawer";

export function LiveMarketsView() {
  const [sportFilter, setSportFilter] = useState<string>("");
  const [leagueFilter, setLeagueFilter] = useState<string>("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.getEvents(),
    refetchInterval: 15_000,
  });

  const sports = useMemo(() => Array.from(new Set(events.map((e) => e.sport))).sort(), [events]);
  const leagues = useMemo(() => Array.from(new Set(events.map((e) => e.league))).sort(), [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (sportFilter && e.sport !== sportFilter) return false;
      if (leagueFilter && e.league !== leagueFilter) return false;
      if (liveOnly && !e.isLive) return false;
      if ((e.latestCompositeScore ?? 0) < minScore) return false;
      return true;
    });
  }, [events, sportFilter, leagueFilter, liveOnly, minScore]);

  const openEvent = openTicker ? events.find((e) => e.eventTicker === openTicker) ?? null : null;

  return (
    <div style={{ padding: 18 }}>
      <div className="panel" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="kv-label">SPORT</span>
          <select className="select" style={{ minWidth: 140 }} value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
            <option value="">All</option>
            {sports.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="kv-label">LEAGUE</span>
          <select className="select" style={{ minWidth: 160 }} value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)}>
            <option value="">All</option>
            {leagues.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="kv-label">LIVE ONLY</span>
          <div onClick={() => setLiveOnly(!liveOnly)} className={`toggle ${liveOnly ? "on" : ""}`} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 220 }}>
          <span className="kv-label">MIN SCORE: <span className={heatClass(minScore)} style={{ fontFamily: "var(--mono)" }}>{minScore}</span></span>
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
          {filtered.length}/{events.length} EVENTS
        </div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
            LOADING…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div className="kv-label" style={{ marginBottom: 8 }}>NO EVENTS</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Scanner has not produced any events yet, or all are filtered out.
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 8 }}>
              Scanner runs on the configured interval. Check the Settings tab.
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Match</th>
                <th>Sport / League</th>
                <th>Live</th>
                <th>Min</th>
                <th>Fav %</th>
                <th>Score</th>
                <th>Strategies</th>
                <th style={{ textAlign: "right" }}>Markets</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.eventTicker}
                  className={`table-row ${heatBgClass(e.latestCompositeScore ?? 0)}`}
                  onClick={() => setOpenTicker(e.eventTicker)}
                >
                  <td>
                    <div style={{ color: "var(--text-primary)", fontSize: 13 }}>{e.matchup}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
                      {e.eventTicker}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12 }}>{e.sport}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{e.league}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className={e.isLive ? "dot-live" : "dot-dead"} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: e.isLive ? "var(--green)" : "var(--text-dim)" }}>
                        {e.isLive ? "LIVE" : "PRE"}
                      </span>
                    </div>
                  </td>
                  <td className="mono" style={{ color: "var(--text-secondary)" }}>{e.minuteEstimate || "—"}</td>
                  <td className="mono">{(e.favoriteProb * 100).toFixed(0)}%</td>
                  <td className={`mono ${heatClass(e.latestCompositeScore ?? 0)}`} style={{ fontWeight: 600 }}>
                    {Math.round(e.latestCompositeScore ?? 0)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(e.detectedStrategies ?? []).map((s: string) => (
                        <StrategyBadge key={s} strategy={s} />
                      ))}
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--text-secondary)" }}>
                    {e.markets?.length ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openEvent && <EventDrawer event={openEvent} onClose={() => setOpenTicker(null)} />}
    </div>
  );
}
