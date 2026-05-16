import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

function LeagueHeatTile({
  league,
  sport,
  avgScore,
  signalCount,
  eventCount,
}: any) {
  const intensity = Math.min(100, avgScore ?? 0);
  const bg =
    intensity >= 60
      ? "#2a1510"
      : intensity >= 40
        ? "#2a1f10"
        : intensity >= 20
          ? "#1a1f1a"
          : "var(--bg-card)";
  const borderColor =
    intensity >= 60
      ? "var(--red)"
      : intensity >= 40
        ? "var(--amber)"
        : intensity >= 20
          ? "var(--green-dim)"
          : "var(--border-dim)";
  const scoreColor =
    intensity >= 60
      ? "var(--red)"
      : intensity >= 40
        ? "var(--amber)"
        : intensity >= 20
          ? "var(--green)"
          : "var(--text-dim)";

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        padding: "12px 14px",
        minWidth: 140,
        boxShadow: intensity >= 60 ? `0 0 8px ${borderColor}30` : "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--text-secondary)",
          marginBottom: 4,
        }}
      >
        {league}
      </div>
      <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 8 }}>{sport}</div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 22,
          fontWeight: 700,
          color: scoreColor,
        }}
      >
        {Math.round(intensity)}
      </div>
      <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4 }}>
        {eventCount} EVT · {signalCount} SIG
      </div>
    </div>
  );
}

function PlaceholderLeagueTile({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-dim)",
        borderRadius: 4,
        padding: "12px 14px",
        minWidth: 140,
        opacity: 0.4,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--text-dim)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: 8,
          width: "60%",
          background: "var(--bg-elevated)",
          borderRadius: 2,
          marginBottom: 8,
        }}
      />
      <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: "var(--bg-elevated)" }}>—</div>
    </div>
  );
}

export function AnalyticsView() {
  const { data: leagueHeat = [] } = useQuery({
    queryKey: ["league-heat"],
    queryFn: api.getLeagueHeat,
    refetchInterval: 30_000,
  });
  const { data: opportunities = [] } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => api.getTopOpportunities(),
    refetchInterval: 30_000,
  });
  const { data: driftData = [] } = useQuery({
    queryKey: ["opening-drift"],
    queryFn: api.getOpeningDrift,
    refetchInterval: 60_000,
  });

  const sectionStyle = {
    marginBottom: 20,
    background: "var(--bg-panel)",
    border: "1px solid var(--border-dim)",
    borderRadius: 4,
    overflow: "hidden" as const,
  };
  const sectionHeader = (title: string, subtitle: string) => (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-card)",
        display: "flex",
        alignItems: "baseline",
        gap: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "var(--cyan)",
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{subtitle}</span>
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={sectionStyle}>
        {sectionHeader("LEAGUE HEATMAP", "signal intensity by league")}
        <div style={{ padding: 16 }}>
          {leagueHeat.length === 0 ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                {["MLB", "NBA", "NHL", "NFL", "Soccer", "MLS", "UFC", "Tennis"].map((l) => (
                  <PlaceholderLeagueTile key={l} label={l} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic" }}>
                League heatmap will populate once scanner groups valid events and signals.
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {leagueHeat.map((l: any) => (
                <LeagueHeatTile key={l.league} {...l} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={sectionStyle}>
        {sectionHeader("DAILY TOP-20 OPPORTUNITIES", "tracked whether traded or not")}
        {opportunities.length === 0 ? (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 12px",
                    background: "var(--bg-card)",
                    borderRadius: 3,
                    opacity: 0.3,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      width: 20,
                    }}
                  >
                    #{i + 1}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 10,
                      background: "var(--bg-elevated)",
                      borderRadius: 2,
                    }}
                  />
                  <div
                    style={{
                      width: 60,
                      height: 10,
                      background: "var(--bg-elevated)",
                      borderRadius: 2,
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic" }}>
              Top opportunities are tracked whether traded or not. Populates after first scan cycle.
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                {["#", "MATCH", "LEAGUE", "STRATEGIES", "SCORE", "TRADED", "OUTCOME"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "7px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      color: "var(--text-dim)",
                      textAlign: "left",
                      background: "var(--bg-card)",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o: any) => (
                <tr key={o.eventTicker} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                    }}
                  >
                    #{o.rank}
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-primary)" }}>
                    {o.matchup}
                  </td>
                  <td
                    style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-secondary)" }}
                  >
                    {o.league}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 3 }}>
                      {(o.strategyMix ?? []).map((s: string) => (
                        <span
                          key={s}
                          style={{
                            fontSize: 9,
                            fontFamily: "var(--mono)",
                            padding: "2px 5px",
                            background: "var(--bg-elevated)",
                            borderRadius: 2,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {s.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      color:
                        o.compositeScore >= 60
                          ? "var(--red)"
                          : o.compositeScore >= 40
                            ? "var(--amber)"
                            : "var(--text-secondary)",
                    }}
                  >
                    {Math.round(o.compositeScore)}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: o.traded ? "var(--green)" : "var(--text-dim)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {o.traded ? "YES" : "OBS"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-dim)" }}>
                    {o.outcome ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={sectionStyle}>
        {sectionHeader("OPENING DRIFT RESEARCH", "tracking near-50/50 opens and favorite emergence")}
        {driftData.length === 0 ? (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["OPEN", "5M", "15M", "30M", "60M", "DRIFT"].map((l) => (
                <div
                  key={l}
                  style={{
                    flex: 1,
                    padding: "20px 10px",
                    background: "var(--bg-card)",
                    borderRadius: 3,
                    textAlign: "center",
                    opacity: 0.35,
                  }}
                >
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                    {l}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 16,
                      color: "var(--bg-elevated)",
                      marginTop: 4,
                    }}
                  >
                    —
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic" }}>
              Tracking near-50/50 openers and favorite emergence. Records accumulate across scan cycles.
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                {["MATCH", "FIRST YES", "FIRST NO", "5M", "15M", "30M", "60M", "DRIFT CLASS"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        color: "var(--text-dim)",
                        textAlign: "left",
                        background: "var(--bg-card)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {driftData.map((d: any) => (
                <tr key={d.eventTicker} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-primary)" }}>
                    {d.eventTicker}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {(d.firstYesPrice * 100).toFixed(0)}%
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {(d.firstNoPrice * 100).toFixed(0)}%
                  </td>
                  {[
                    "favoriteAfter5m",
                    "favoriteAfter15m",
                    "favoriteAfter30m",
                    "favoriteAfter60m",
                  ].map((k) => (
                    <td
                      key={k}
                      style={{
                        padding: "8px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: d[k] != null ? "var(--cyan)" : "var(--text-dim)",
                      }}
                    >
                      {d[k] != null ? `${(d[k] * 100).toFixed(0)}%` : "—"}
                    </td>
                  ))}
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        padding: "2px 6px",
                        borderRadius: 2,
                        background:
                          d.driftClass === "strong_drift"
                            ? "var(--red-dim)"
                            : d.driftClass === "mild_drift"
                              ? "var(--amber-dim)"
                              : "var(--bg-elevated)",
                        color:
                          d.driftClass === "strong_drift"
                            ? "var(--red)"
                            : d.driftClass === "mild_drift"
                              ? "var(--amber)"
                              : "var(--text-dim)",
                      }}
                    >
                      {d.driftClass?.toUpperCase() ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
