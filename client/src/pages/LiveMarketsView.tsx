import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, heatClass } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";
import { EventDrawer } from "../components/EventDrawer";

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
      {[30, 15, 8, 6, 8, 8, 15, 8].map((w, i) => (
        <td key={i} style={{ padding: "10px 12px" }}>
          <div
            style={{
              height: 12,
              width: `${w * 4}px`,
              borderRadius: 2,
              background:
                "linear-gradient(90deg, var(--bg-elevated) 0%, var(--border-dim) 50%, var(--bg-elevated) 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.8s linear infinite",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

function DiagnosticBanner({ health, filterActive }: { health: any; filterActive: boolean }) {
  const qc = useQueryClient();
  const trigger = useMutation({
    mutationFn: api.triggerScan,
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["events"] }), 3000);
    },
  });

  if (!health) return null;
  const { status, normalizedEventCount, groupedEventCount, lastError, errorCount } = health;
  if (status === "healthy" && groupedEventCount > 0 && !filterActive) return null;

  const bgColor =
    status === "healthy" && groupedEventCount === 0
      ? "#1a1a0a"
      : status === "degraded"
        ? "#1a100a"
        : "#0a1015";
  const borderColor =
    status === "healthy" && groupedEventCount === 0
      ? "var(--amber)"
      : status === "degraded"
        ? "var(--red)"
        : "var(--cyan)";
  const headline =
    filterActive && groupedEventCount > 0
      ? "Filters are excluding all events"
      : status === "stopped"
        ? "Scanner is not running"
        : status === "degraded"
          ? "Scanner degraded — errors detected"
          : status === "no_data" || groupedEventCount === 0
            ? "Scanner active but no events loaded yet"
            : "No events match current filters";

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        padding: "14px 18px",
        marginBottom: 14,
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: borderColor,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {headline.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: lastError ? 8 : 0,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-dim)" }}>EVENTS IN CACHE</span>{" "}
            {groupedEventCount ?? 0}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-dim)" }}>NORMALIZED</span>{" "}
            {normalizedEventCount ?? 0}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-dim)" }}>ERRORS</span>{" "}
            <span style={{ color: errorCount > 0 ? "var(--red)" : "var(--text-secondary)" }}>
              {errorCount ?? 0}
            </span>
          </span>
          {filterActive && (
            <span style={{ fontSize: 11, color: "var(--amber)" }}>⚠ Filters active</span>
          )}
        </div>
        {lastError && (
          <div
            style={{
              fontSize: 10,
              color: "var(--red)",
              fontFamily: "var(--mono)",
              marginTop: 4,
              wordBreak: "break-all",
            }}
          >
            LAST ERR: {lastError}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
          style={{
            padding: "6px 14px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-active)",
            borderRadius: 3,
            color: "var(--cyan)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {trigger.isPending ? "SCANNING..." : "RETRY SCAN"}
        </button>
      </div>
    </div>
  );
}

export function LiveMarketsView() {
  const [sportFilter, setSportFilter] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.getEvents(),
    refetchInterval: 15_000,
  });

  const { data: health } = useQuery({
    queryKey: ["scan-health"],
    queryFn: api.getScanHealth,
    refetchInterval: 10_000,
  });

  const sports = useMemo(
    () => Array.from(new Set(events.map((e) => e.sport))).sort(),
    [events],
  );
  const leagues = useMemo(
    () => Array.from(new Set(events.map((e) => e.league))).sort(),
    [events],
  );

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (sportFilter && e.sport !== sportFilter) return false;
        if (leagueFilter && e.league !== leagueFilter) return false;
        if (liveOnly && !e.isLive) return false;
        if ((e.latestCompositeScore ?? 0) < minScore) return false;
        return true;
      }),
    [events, sportFilter, leagueFilter, liveOnly, minScore],
  );

  const filterActive = !!(sportFilter || leagueFilter || liveOnly || minScore > 0);
  const openEvent = openTicker ? events.find((e) => e.eventTicker === openTicker) ?? null : null;

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-dim)",
          borderRadius: 4,
          padding: "10px 14px",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          position: "sticky",
          top: 49,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
            }}
          >
            SPORT
          </span>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-active)",
              borderRadius: 3,
              color: "var(--text-primary)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              padding: "4px 8px",
              minWidth: 130,
              cursor: "pointer",
            }}
          >
            <option value="">All Sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
            }}
          >
            LEAGUE
          </span>
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-active)",
              borderRadius: 3,
              color: "var(--text-primary)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              padding: "4px 8px",
              minWidth: 130,
              cursor: "pointer",
            }}
          >
            <option value="">All Leagues</option>
            {leagues.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
            }}
          >
            LIVE ONLY
          </span>
          <div
            onClick={() => setLiveOnly(!liveOnly)}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              background: liveOnly ? "var(--green)" : "var(--bg-elevated)",
              border: `1px solid ${liveOnly ? "var(--green)" : "var(--border-active)"}`,
              cursor: "pointer",
              position: "relative",
              transition: "all 0.2s",
              boxShadow: liveOnly ? "0 0 8px var(--green-dim)" : "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: liveOnly ? 20 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: liveOnly ? "#0a0b0d" : "var(--text-dim)",
                transition: "left 0.2s",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 180 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
            }}
          >
            MIN SCORE:{" "}
            <span className={heatClass(minScore)} style={{ fontFamily: "var(--mono)" }}>
              {minScore}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--cyan)" }}
          />
        </div>

        {filterActive && (
          <button
            onClick={() => {
              setSportFilter("");
              setLeagueFilter("");
              setLiveOnly(false);
              setMinScore(0);
            }}
            style={{
              padding: "5px 10px",
              background: "none",
              border: "1px solid var(--border-active)",
              borderRadius: 3,
              color: "var(--amber)",
              fontFamily: "var(--mono)",
              fontSize: 10,
              cursor: "pointer",
              marginTop: 14,
            }}
          >
            CLEAR
          </button>
        )}

        <div
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-dim)",
            marginTop: 14,
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>{filtered.length}</span>/{events.length}{" "}
          EVT
        </div>
      </div>

      <DiagnosticBanner
        health={health}
        filterActive={filterActive && filtered.length === 0 && events.length > 0}
      />

      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-dim)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-active)" }}>
              {["MATCH", "SPORT / LEAGUE", "STATUS", "MIN", "FAV %", "SCORE", "STRATEGIES", "MKTS"].map(
                (h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      color: "var(--text-dim)",
                      textAlign: i === 7 ? "right" : "left",
                      background: "var(--bg-card)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      marginBottom: 8,
                    }}
                  >
                    NO LIVE OPPORTUNITIES LOADED
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      maxWidth: 420,
                      margin: "0 auto",
                    }}
                  >
                    {events.length === 0
                      ? "Scanner is fetching live Kalshi markets. This takes 60–90 seconds on first run."
                      : "All events are filtered out. Adjust the sport, league, or score filters above."}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={e.eventTicker}
                  onClick={() => setOpenTicker(e.eventTicker)}
                  style={{
                    borderBottom: "1px solid var(--border-dim)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(ev) =>
                    (ev.currentTarget.style.background = "var(--bg-elevated)")
                  }
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "10px 12px", maxWidth: 280 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        marginBottom: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.matchup ?? e.eventTicker}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        color: "var(--text-dim)",
                      }}
                    >
                      {e.eventTicker}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {e.sport ?? "—"}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{e.league ?? "—"}</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: e.isLive ? "var(--green)" : "var(--text-dim)",
                          boxShadow: e.isLive ? "0 0 6px var(--green)" : "none",
                          animation: e.isLive ? "pulse-green 2s ease-in-out infinite" : "none",
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          color: e.isLive ? "var(--green)" : "var(--text-dim)",
                        }}
                      >
                        {e.isLive ? "LIVE" : "PRE"}
                      </span>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {e.minuteEstimate > 0 ? e.minuteEstimate : "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        color:
                          e.favoriteProb > 0.7
                            ? "var(--red)"
                            : e.favoriteProb > 0.6
                              ? "var(--amber)"
                              : "var(--text-secondary)",
                      }}
                    >
                      {(e.favoriteProb * 100).toFixed(0)}%
                    </span>
                    {e.favoriteSide && (
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {String(e.favoriteSide).slice(0, 12)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          (e.latestCompositeScore ?? 0) >= 60
                            ? "var(--red)"
                            : (e.latestCompositeScore ?? 0) >= 40
                              ? "var(--amber)"
                              : (e.latestCompositeScore ?? 0) >= 20
                                ? "var(--text-secondary)"
                                : "var(--text-dim)",
                      }}
                    >
                      {Math.round(e.latestCompositeScore ?? 0)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(e.detectedStrategies ?? []).map((s: string) => (
                        <StrategyBadge key={s} strategy={s} />
                      ))}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-dim)",
                      textAlign: "right",
                    }}
                  >
                    {e.markets?.length ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openEvent && <EventDrawer event={openEvent} onClose={() => setOpenTicker(null)} />}
    </div>
  );
}
