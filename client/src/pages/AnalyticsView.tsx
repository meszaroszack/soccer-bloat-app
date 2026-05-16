import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { api, heatClass, heatBgClass } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";

export function AnalyticsView() {
  const { data: leagueHeat = [] } = useQuery({
    queryKey: ["league-heat"],
    queryFn: api.getLeagueHeat,
    refetchInterval: 20_000,
  });
  const { data: opportunities = [] } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => api.getOpportunities(),
    refetchInterval: 20_000,
  });
  const { data: drift = [] } = useQuery({
    queryKey: ["opening-drift"],
    queryFn: api.getOpeningDrift,
    refetchInterval: 30_000,
  });

  const heatData = leagueHeat.slice(0, 12).map((l) => ({
    league: l.league,
    avgScore: Math.round(l.avgScore),
    eventCount: l.eventCount,
    signalCount: l.signalCount,
  }));

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
      <section className="panel" style={{ padding: 16 }}>
        <h3 className="h-section">League Heatmap</h3>
        {leagueHeat.length === 0 ? (
          <div style={{ color: "var(--text-dim)", padding: 16 }}>No data yet.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: 18 }}>
              {leagueHeat.map((l) => (
                <div
                  key={l.league}
                  className={`card-panel ${heatBgClass(l.avgScore)}`}
                  style={{ padding: 12 }}
                >
                  <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 2 }}>{l.league}</div>
                  <div className="kv-label">{l.sport}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
                    <span className={`mono ${heatClass(l.avgScore)}`} style={{ fontSize: 20, fontWeight: 700 }}>
                      {Math.round(l.avgScore)}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {l.eventCount}E / {l.signalCount}S
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heatData} margin={{ top: 8, right: 24, left: 0, bottom: 24 }}>
                  <XAxis dataKey="league" stroke="#4a5568" tick={{ fontSize: 10, fill: "#8892a4", fontFamily: "var(--mono)" }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#4a5568" tick={{ fontSize: 10, fill: "#8892a4", fontFamily: "var(--mono)" }} />
                  <Tooltip
                    contentStyle={{ background: "#13171e", border: "1px solid #2a3548", fontSize: 11 }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Bar dataKey="avgScore">
                    {heatData.map((d, i) => (
                      <Cell key={i} fill={fillForScore(d.avgScore)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h3 className="h-section">Top-20 Daily Opportunities</h3>
        {opportunities.length === 0 ? (
          <div style={{ color: "var(--text-dim)", padding: 12 }}>No opportunities yet today.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Match</th>
                <th>League</th>
                <th>Strategies</th>
                <th>Score</th>
                <th>Traded</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.eventTicker} className={`table-row ${heatBgClass(o.compositeScore)}`}>
                  <td className="mono">{o.rank}</td>
                  <td>
                    {o.matchup}
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>{o.eventTicker}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12 }}>{o.league}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{o.sport}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(o.strategyMix ?? []).map((s: string) => (
                        <StrategyBadge key={s} strategy={s} />
                      ))}
                    </div>
                  </td>
                  <td className={`mono ${heatClass(o.compositeScore)}`} style={{ fontWeight: 600 }}>
                    {Math.round(o.compositeScore)}
                  </td>
                  <td className="mono" style={{ color: o.traded ? "var(--green)" : "var(--text-dim)" }}>
                    {o.traded ? "YES" : "—"}
                  </td>
                  <td style={{ fontSize: 11 }}>{o.outcome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h3 className="h-section">Opening Drift Research</h3>
        {drift.length === 0 ? (
          <div style={{ color: "var(--text-dim)", padding: 12 }}>
            No opening observations yet. These accumulate as the scanner sees new events.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>First Yes</th>
                <th>First No</th>
                <th>5m</th>
                <th>15m</th>
                <th>30m</th>
                <th>60m</th>
                <th>Drift</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody>
              {drift.map((d) => (
                <tr key={d.eventTicker} className="table-row">
                  <td className="mono" style={{ fontSize: 11 }}>{d.eventTicker}</td>
                  <td className="mono">{(d.firstYesPrice * 100).toFixed(0)}%</td>
                  <td className="mono">{(d.firstNoPrice * 100).toFixed(0)}%</td>
                  <td className="mono">{d.favoriteAfter5m !== undefined ? (d.favoriteAfter5m * 100).toFixed(0) + "%" : "—"}</td>
                  <td className="mono">{d.favoriteAfter15m !== undefined ? (d.favoriteAfter15m * 100).toFixed(0) + "%" : "—"}</td>
                  <td className="mono">{d.favoriteAfter30m !== undefined ? (d.favoriteAfter30m * 100).toFixed(0) + "%" : "—"}</td>
                  <td className="mono">{d.favoriteAfter60m !== undefined ? (d.favoriteAfter60m * 100).toFixed(0) + "%" : "—"}</td>
                  <td className="mono" style={{ color: d.drift60m !== undefined ? (d.drift60m > 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)" }}>
                    {d.drift60m !== undefined ? (d.drift60m * 100).toFixed(1) + "%" : "—"}
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 2,
                        border: `1px solid ${classColor(d.driftClass)}`,
                        color: classColor(d.driftClass),
                      }}
                    >
                      {d.driftClass.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function fillForScore(s: number): string {
  if (s < 20) return "#4a5568";
  if (s < 40) return "#ffab40";
  if (s < 70) return "#ff8c42";
  return "#ff5252";
}
function classColor(c: string): string {
  if (c === "strong_drift") return "#ff5252";
  if (c === "mild_drift") return "#ffab40";
  if (c === "stable") return "#00e676";
  return "#8892a4";
}
