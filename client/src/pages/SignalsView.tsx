import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, heatClass } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";

const STATUS_COLORS: Record<string, string> = {
  pending_confirm: "var(--amber)",
  active: "var(--cyan)",
  auto_traded: "var(--green)",
  manually_traded: "var(--green)",
  skipped: "var(--text-dim)",
  observed_only: "var(--text-secondary)",
  resolved: "var(--text-dim)",
  error: "var(--red)",
};

export function SignalsView() {
  const qc = useQueryClient();
  const [stratFilter, setStratFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sportFilter, setSportFilter] = useState("");

  const { data: signals = [], isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: () => api.getSignals(),
    refetchInterval: 10_000,
  });
  const { data: credStatus } = useQuery({
    queryKey: ["cred-status"],
    queryFn: api.getCredStatus,
  });

  const hasCreds = credStatus?.hasCredentials;

  const filtered = signals.filter((s: any) => {
    if (stratFilter && s.strategy !== stratFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (sportFilter && s.sport !== sportFilter) return false;
    return true;
  });

  const sports = Array.from(new Set(signals.map((s: any) => s.sport))).filter(Boolean).sort() as string[];
  const strategies = Array.from(new Set(signals.map((s: any) => s.strategy))).filter(Boolean).sort() as string[];

  const pendingCount = signals.filter((s: any) => s.status === "pending_confirm").length;
  const activeCount = signals.filter(
    (s: any) =>
      s.status === "active" || s.status === "auto_traded" || s.status === "manually_traded",
  ).length;
  const resolvedCount = signals.filter((s: any) => s.status === "resolved").length;

  async function act(id: string, action: "confirm" | "skip" | "watch") {
    try {
      if (action === "confirm") await api.confirmSignal(id);
      else if (action === "skip") await api.skipSignal(id);
      else await api.watchSignal(id);
      qc.invalidateQueries({ queryKey: ["signals"] });
      qc.invalidateQueries({ queryKey: ["pending-signals"] });
    } catch (err) {
      console.error(err);
    }
  }

  const selectStyle = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-active)",
    borderRadius: 3,
    color: "var(--text-primary)",
    fontFamily: "var(--mono)",
    fontSize: 10,
    padding: "4px 8px",
    cursor: "pointer",
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {(
          [
            ["PENDING", pendingCount, "var(--amber)"],
            ["TRADED", activeCount, "var(--green)"],
            ["TOTAL", signals.length, "var(--cyan)"],
            ["RESOLVED", resolvedCount, "var(--text-dim)"],
          ] as Array<[string, number, string]>
        ).map(([label, val, color]) => (
          <div
            key={label}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-dim)",
              borderRadius: 4,
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 18,
                fontWeight: 700,
                color,
              }}
            >
              {val}
            </span>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--text-dim)",
                letterSpacing: "0.1em",
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

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
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-dim)" }}>
            STRATEGY
          </span>
          <select
            style={selectStyle}
            value={stratFilter}
            onChange={(e) => setStratFilter(e.target.value)}
          >
            <option value="">All</option>
            {strategies.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-dim)" }}>
            STATUS
          </span>
          <select
            style={selectStyle}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {[
              "pending_confirm",
              "active",
              "auto_traded",
              "manually_traded",
              "skipped",
              "observed_only",
              "resolved",
              "error",
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-dim)" }}>
            SPORT
          </span>
          <select
            style={selectStyle}
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            <option value="">All</option>
            {sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          {filtered.length}/{signals.length} SIGNALS
        </div>
      </div>

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
            <tr
              style={{
                borderBottom: "1px solid var(--border-dim)",
                background: "var(--bg-card)",
              }}
            >
              {[
                "MATCH",
                "STRATEGY",
                "RECOMMENDATION",
                "SCORE",
                "RISK",
                "EDGE",
                "STATUS",
                "ACTIONS",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: "var(--text-dim)",
                    textAlign: "left",
                    letterSpacing: "0.1em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} style={{ padding: "12px 14px" }}>
                    <div
                      style={{
                        height: 12,
                        background: "var(--bg-elevated)",
                        borderRadius: 2,
                        animation: "shimmer 1.8s linear infinite",
                        backgroundSize: "200% 100%",
                      }}
                    />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "40px 14px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--text-dim)",
                  }}
                >
                  {signals.length === 0
                    ? "No signals yet — scanner is building opportunities."
                    : "No signals match current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((sig: any) => {
                const isPending = sig.status === "pending_confirm";
                return (
                  <tr
                    key={sig.id}
                    style={{
                      borderBottom: "1px solid var(--border-dim)",
                      background: isPending ? "#1a150080" : "transparent",
                      borderLeft: isPending
                        ? "3px solid var(--amber)"
                        : "3px solid transparent",
                    }}
                  >
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                        {sig.matchTitle}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                          marginTop: 1,
                        }}
                      >
                        {sig.sport} · {sig.league}
                      </div>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <StrategyBadge strategy={sig.strategy} />
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {sig.sideRecommendation}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span
                        className={heatClass(sig.compositeScore)}
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {Math.round(sig.compositeScore)}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: sig.riskScore > 50 ? "var(--red)" : "var(--text-secondary)",
                      }}
                    >
                      {sig.riskScore}
                    </td>
                    <td
                      style={{
                        padding: "9px 12px",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {sig.edgePercent?.toFixed(1)}%
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 2,
                          color: STATUS_COLORS[sig.status] ?? "var(--text-dim)",
                          background: `${STATUS_COLORS[sig.status] ?? "var(--text-dim)"}18`,
                          border: `1px solid ${
                            STATUS_COLORS[sig.status] ?? "var(--border-dim)"
                          }40`,
                        }}
                      >
                        {sig.status.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      {isPending ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => act(sig.id, "confirm")}
                            disabled={!hasCreds}
                            style={{
                              padding: "3px 8px",
                              background: hasCreds ? "var(--green-dim)" : "var(--bg-elevated)",
                              border: `1px solid ${
                                hasCreds ? "var(--green)" : "var(--border-dim)"
                              }`,
                              borderRadius: 2,
                              color: hasCreds ? "var(--green)" : "var(--text-dim)",
                              fontFamily: "var(--mono)",
                              fontSize: 9,
                              cursor: hasCreds ? "pointer" : "not-allowed",
                            }}
                          >
                            TRADE
                          </button>
                          <button
                            onClick={() => act(sig.id, "watch")}
                            style={{
                              padding: "3px 8px",
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-active)",
                              borderRadius: 2,
                              color: "var(--cyan)",
                              fontFamily: "var(--mono)",
                              fontSize: 9,
                              cursor: "pointer",
                            }}
                          >
                            WATCH
                          </button>
                          <button
                            onClick={() => act(sig.id, "skip")}
                            style={{
                              padding: "3px 8px",
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-dim)",
                              borderRadius: 2,
                              color: "var(--text-dim)",
                              fontFamily: "var(--mono)",
                              fontSize: 9,
                              cursor: "pointer",
                            }}
                          >
                            SKIP
                          </button>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-dim)",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {sig.tradedAt
                            ? new Date(sig.tradedAt).toLocaleTimeString()
                            : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
