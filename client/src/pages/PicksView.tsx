import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, fmtUsd } from "../lib/api";

function timeAgo(ts: string | Date | undefined | null): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function modeColor(mode: string | undefined): string {
  switch (mode) {
    case "live_auto":
      return "var(--green)";
    case "manual_confirm":
      return "var(--cyan)";
    case "beta_shadow":
      return "var(--amber)";
    default:
      return "var(--text-dim)";
  }
}

function pnlColor(v: number | undefined): string {
  if (v == null || v === 0) return "var(--text-dim)";
  return v > 0 ? "var(--green)" : "var(--red)";
}

function resolverTickColor(ts: string | Date | undefined | null): string {
  if (!ts) return "var(--red)";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "var(--red)";
  const ageSec = (Date.now() - d.getTime()) / 1000;
  if (ageSec < 90) return "var(--green)";
  if (ageSec < 300) return "var(--amber)";
  return "var(--red)";
}

function fmtHHMM(t: string | Date | undefined | null): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const RANK_GLOW: Record<number, string> = {
  1: "var(--green)",
  2: "var(--cyan)",
  3: "var(--amber)",
  4: "#9c27b0",
};

export function PicksView() {
  const qc = useQueryClient();
  const { data: cycle } = useQuery({
    queryKey: ["picks-today"],
    queryFn: api.getPicksToday,
    refetchInterval: 30_000,
  });
  const { data: ledger } = useQuery({
    queryKey: ["ledger-summary"],
    queryFn: api.getLedgerSummary,
    refetchInterval: 30_000,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });
  const { data: resolverStat } = useQuery({
    queryKey: ["resolver-status"],
    queryFn: api.getResolverStatus,
    refetchInterval: 30_000,
  });
  const { data: openPositions } = useQuery({
    queryKey: ["open-positions"],
    queryFn: api.getOpenPositions,
    refetchInterval: 30_000,
  });
  const { data: deployment } = useQuery({
    queryKey: ["deployment-summary"],
    queryFn: api.getDeploymentSummary,
    refetchInterval: 30_000,
  });
  const { data: resolvedData } = useQuery({
    queryKey: ["resolved-positions"],
    queryFn: () => api.getResolvedPositions(50),
    refetchInterval: 60_000,
  });
  const { data: byMatchData } = useQuery({
    queryKey: ["by-match"],
    queryFn: api.getByMatch,
    refetchInterval: 60_000,
  });
  const { data: circuitLog } = useQuery({
    queryKey: ["circuit-breaker-log"],
    queryFn: () => api.getCircuitBreakerLog(Date.now() - 24 * 3600_000),
    refetchInterval: 30_000,
  });

  const [posSort, setPosSort] = useState<"age" | "pnl">("pnl");
  const [posSortDir, setPosSortDir] = useState<"desc" | "asc">("desc");
  const [resolvedSort, setResolvedSort] = useState<"resolved_at" | "pnl" | "hold">("resolved_at");
  const [resolvedSortDir, setResolvedSortDir] = useState<"desc" | "asc">("desc");
  const [showAllResolved, setShowAllResolved] = useState(false);
  const [byMatchExpanded, setByMatchExpanded] = useState(false);

  const promote = useMutation({
    mutationFn: () => api.promoteToLive(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["ledger-summary"] });
    },
  });

  const picks = cycle?.topPicks ?? [];
  const nearMisses = cycle?.nearMisses ?? [];
  const rejectionReasons: Record<string, number> = cycle?.rejectionReasons ?? {};
  const modelHealth = cycle?.modelHealth ?? {
    avgCalibratedHitRate: 0,
    avgSampleSize: 0,
    coldStartPct: 0,
  };

  const execMode = settings?.executionMode ?? "off";
  const mc = modeColor(execMode);

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* TOP STRIP */}
      <div
        className="panel"
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: mc,
              boxShadow: `0 0 8px ${mc}`,
            }}
          />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: mc,
            }}
          >
            {String(execMode).toUpperCase().replace("_", " ")}
          </span>
        </div>

        <Stat label="VIRTUAL BANKROLL" value={fmtUsd(ledger?.virtualBankroll)} />
        <Stat
          label="DAILY P&L"
          value={fmtUsd(ledger?.dailyPnl, true)}
          color={pnlColor(ledger?.dailyPnl)}
        />
        <Stat
          label="ALL-TIME P&L"
          value={fmtUsd(ledger?.allTimeVirtualPnl, true)}
          color={pnlColor(ledger?.allTimeVirtualPnl)}
        />
        <Stat
          label="CYCLE"
          value={cycle?.cycleId ? String(cycle.cycleId).slice(0, 8) : "—"}
        />
        <Stat label="LAST CYCLE" value={timeAgo(cycle?.evaluatedAt)} />
        <Stat
          label="EVALUATED"
          value={`${cycle?.totalEvaluated ?? 0} sig`}
        />
      </div>

      {/* WARNING BANNER — only renders when conditions met */}
      {deployment && (() => {
        const bk = deployment.bankroll;
        const dep = deployment.deployed;
        const mtm = deployment.mtmPnl ?? 0;

        const breachBankroll = dep > bk;
        const heavyDeploy = dep > bk * 0.75;
        const sigLoss = mtm < -(bk * 0.20);

        if (!breachBankroll && !heavyDeploy && !sigLoss) return null;

        const isCritical = breachBankroll;
        const borderColor = isCritical ? "var(--red)" : "var(--amber)";
        const bgColor = isCritical ? "rgba(255,82,82,0.08)" : "rgba(255,171,64,0.07)";

        return (
          <div
            style={{
              background: bgColor,
              border: `2px solid ${borderColor}`,
              borderRadius: 6,
              padding: "12px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              animation: isCritical ? "pulse-green 1.5s infinite" : undefined,
            }}
          >
            {breachBankroll && (
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--red)",
                  letterSpacing: "0.08em",
                }}
              >
                ⚠ BANKROLL BREACH — circuit breaker active — deployed ${dep.toFixed(2)} exceeds bankroll ${bk.toFixed(2)}
              </div>
            )}
            {!breachBankroll && heavyDeploy && (
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--amber)",
                  letterSpacing: "0.08em",
                }}
              >
                ⚠ BANKROLL HEAVILY DEPLOYED — ${dep.toFixed(2)} / ${bk.toFixed(2)} ({(dep / bk * 100).toFixed(0)}%)
              </div>
            )}
            {sigLoss && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--amber)" }}>
                Significant unrealized losses: ${mtm.toFixed(2)} MtM ({(mtm / bk * 100).toFixed(1)}% of bankroll)
              </div>
            )}
            {isCritical && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
                No new positions will open until deployed &lt; {(bk * 0.25).toFixed(2)} (25% cap). Use the reset endpoint to force-close all and restore a clean state.
              </div>
            )}
          </div>
        );
      })()}

      {/* DEPLOYMENT STRIP */}
      <DeploymentStrip deployment={deployment} settings={settings} />

      {/* PICK CARDS */}
      <section className="panel" style={{ padding: 18 }}>
        <h3 className="h-section">TODAY'S TOP {settings?.topPicksN ?? 4}</h3>
        {picks.length === 0 ? (
          <div
            style={{
              padding: "28px 0",
              textAlign: "center",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            No picks this cycle — waiting for actionable signals to clear gates.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                picks.length >= 3
                  ? "repeat(auto-fit, minmax(360px, 1fr))"
                  : "repeat(2, 1fr)",
              gap: 14,
            }}
          >
            {picks.map((p: any) => (
              <PickCard key={p.id} pick={p} />
            ))}
          </div>
        )}
      </section>

      {/* OPEN VIRTUAL POSITIONS */}
      <OpenPositionsSection
        positions={openPositions}
        posSort={posSort}
        posSortDir={posSortDir}
        setPosSort={setPosSort}
        setPosSortDir={setPosSortDir}
      />

      {/* RESOLVED VIRTUAL POSITIONS */}
      <ResolvedPositionsSection
        resolvedData={resolvedData}
        resolvedSort={resolvedSort}
        resolvedSortDir={resolvedSortDir}
        setResolvedSort={setResolvedSort}
        setResolvedSortDir={setResolvedSortDir}
        showAllResolved={showAllResolved}
        setShowAllResolved={setShowAllResolved}
      />

      {/* BY MATCH */}
      <ByMatchSection
        byMatchData={byMatchData}
        expanded={byMatchExpanded}
        setExpanded={setByMatchExpanded}
      />

      {/* CIRCUIT BREAKER REJECTIONS */}
      <section className="panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h3 className="h-section" style={{ margin: 0 }}>CIRCUIT BREAKER REJECTIONS</h3>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--red)",
              fontWeight: 700,
            }}
          >
            (last 24h: {(circuitLog ?? []).length})
          </span>
        </div>

        {(!circuitLog || circuitLog.length === 0) ? (
          <div
            style={{
              padding: "16px 0",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            No circuit breaker rejections in the last 24h — system is operating within limits.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                fontFamily: "var(--mono)",
                fontSize: 11,
                borderCollapse: "collapse",
                minWidth: 600,
              }}
            >
              <thead>
                <tr
                  style={{
                    color: "var(--text-dim)",
                    textAlign: "left",
                    letterSpacing: "0.07em",
                    borderBottom: "1px solid var(--border-dim)",
                  }}
                >
                  <th style={{ padding: "5px 8px" }}>TIME</th>
                  <th style={{ padding: "5px 8px" }}>MATCH</th>
                  <th style={{ padding: "5px 8px" }}>STRATEGY</th>
                  <th style={{ padding: "5px 8px" }}>SIDE</th>
                  <th style={{ padding: "5px 8px", textAlign: "right" }}>SIZE</th>
                  <th style={{ padding: "5px 8px" }}>REASON</th>
                  <th style={{ padding: "5px 8px" }}>DETAIL</th>
                </tr>
              </thead>
              <tbody>
                {(circuitLog ?? []).slice(0, 50).map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: "1px dashed var(--border-dim)" }}>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--text-dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(r.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--text-primary)",
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.matchup}
                    </td>
                    <td style={{ padding: "5px 8px", color: "var(--text-secondary)" }}>
                      {r.strategy}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: r.side === "yes" ? "var(--green)" : "var(--red)",
                        fontWeight: 700,
                      }}
                    >
                      {r.side?.toUpperCase()}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--cyan)",
                      }}
                    >
                      {r.attemptedSizeDollars != null
                        ? `$${r.attemptedSizeDollars.toFixed(2)}`
                        : "—"}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          fontWeight: 700,
                          color:
                            r.rejectionReason === "bankroll_cap_breached" ||
                            r.rejectionReason === "duplicate_event_position" ||
                            r.rejectionReason === "duplicate_market_position"
                              ? "var(--red)"
                              : "var(--amber)",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {r.rejectionReason}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--text-dim)",
                        fontSize: 10,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MIDDLE ROW: NEAR MISSES + MODEL HEALTH */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 14,
        }}
      >
        <section className="panel" style={{ padding: 18 }}>
          <h3 className="h-section">REJECTED THIS CYCLE</h3>
          {nearMisses.length === 0 ? (
            <div
              style={{
                padding: 12,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
                fontSize: 12,
              }}
            >
              No rejected signals.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                fontFamily: "var(--mono)",
                fontSize: 11,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    color: "var(--text-dim)",
                    textAlign: "left",
                    letterSpacing: "0.08em",
                    borderBottom: "1px solid var(--border-dim)",
                  }}
                >
                  <th style={{ padding: "6px 6px" }}>MATCHUP</th>
                  <th style={{ padding: "6px 6px" }}>STRATEGY</th>
                  <th style={{ padding: "6px 6px", textAlign: "right" }}>RANK</th>
                  <th style={{ padding: "6px 6px" }}>FAILED</th>
                  <th style={{ padding: "6px 6px" }}>DETAIL</th>
                </tr>
              </thead>
              <tbody>
                {nearMisses.map((nm: any) => (
                  <tr
                    key={nm.signalId}
                    style={{ borderBottom: "1px dashed var(--border-dim)" }}
                  >
                    <td
                      style={{
                        padding: "6px 6px",
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 220,
                      }}
                    >
                      {nm.matchup}
                    </td>
                    <td style={{ padding: "6px 6px" }}>
                      <span
                        className={`badge-${nm.strategy.startsWith("bloat") ? "bloat" : nm.strategy}`}
                      >
                        {nm.strategy}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "6px 6px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {nm.rankScore.toFixed(1)}
                    </td>
                    <td style={{ padding: "6px 6px", color: "var(--amber)" }}>
                      {nm.failedGate}
                    </td>
                    <td style={{ padding: "6px 6px", color: "var(--text-dim)" }}>
                      {nm.failedGateDetail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" style={{ padding: 18 }}>
          <h3 className="h-section">MODEL HEALTH</h3>
          <HealthRow
            label="AVG CALIBRATED HIT"
            value={`${(modelHealth.avgCalibratedHitRate * 100).toFixed(1)}%`}
          />
          <HealthRow
            label="AVG SAMPLE SIZE"
            value={modelHealth.avgSampleSize.toFixed(1)}
          />
          <HealthRow
            label="COLD START %"
            value={`${(modelHealth.coldStartPct * 100).toFixed(0)}%`}
            color={
              modelHealth.coldStartPct > 0.5
                ? "var(--amber)"
                : "var(--text-primary)"
            }
          />
          <HealthRow
            label="EVALUATED"
            value={String(cycle?.totalEvaluated ?? 0)}
          />
          <HealthRow
            label="ELIGIBLE"
            value={String(cycle?.eligibleCount ?? 0)}
            color="var(--green)"
          />
          <HealthRow
            label="REJECTED"
            value={String(cycle?.rejectedCount ?? 0)}
            color="var(--red)"
          />
          <HealthRow
            label="LAST RESOLVER TICK"
            value={timeAgo(resolverStat?.lastTickAt)}
            color={resolverTickColor(resolverStat?.lastTickAt)}
          />
          <HealthRow
            label="POSITIONS RESOLVED"
            value={
              resolverStat?.positionsResolved != null
                ? String(resolverStat.positionsResolved)
                : "—"
            }
          />
          <HealthRow
            label="RESOLVER ERROR"
            value={resolverStat?.lastError ? String(resolverStat.lastError) : "none"}
            color={resolverStat?.lastError ? "var(--red)" : "var(--green)"}
          />

          <div
            style={{
              marginTop: 12,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--text-dim)",
              letterSpacing: "0.06em",
            }}
          >
            REJECTION BREAKDOWN
          </div>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {Object.entries(rejectionReasons).map(([k, v]) => {
              const maxV = Math.max(
                ...Object.values(rejectionReasons).map((x: any) => Number(x)),
                1,
              );
              const pct = (Number(v) / maxV) * 100;
              return (
                <div
                  key={k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 1fr 40px",
                    gap: 6,
                    alignItems: "center",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                  <div
                    style={{
                      height: 6,
                      background: "var(--bg-base)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "var(--amber)",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span
                    style={{ color: "var(--text-dim)", textAlign: "right" }}
                  >
                    {String(v)}
                  </span>
                </div>
              );
            })}
            {Object.keys(rejectionReasons).length === 0 && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                No rejections this cycle.
              </span>
            )}
          </div>
        </section>
      </div>

      {/* LEDGER MINI PANEL */}
      <section className="panel" style={{ padding: 18 }}>
        <h3 className="h-section">VIRTUAL LEDGER</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <Stat
            label="OPEN POSITIONS"
            value={String(ledger?.totalOpenPositions ?? 0)}
          />
          <Stat
            label="W / L"
            value={`${ledger?.winCount ?? 0}W / ${ledger?.lossCount ?? 0}L`}
          />
          <Stat
            label="HIT RATE"
            value={`${((ledger?.overallHitRate ?? 0) * 100).toFixed(1)}%`}
            color="var(--cyan)"
          />
          <Stat
            label="ROI"
            value={`${((ledger?.overallROI ?? 0) * 100).toFixed(1)}%`}
            color={pnlColor(ledger?.overallROI)}
          />
          <Stat
            label="TOTAL P&L"
            value={fmtUsd(ledger?.allTimeVirtualPnl, true)}
            color={pnlColor(ledger?.allTimeVirtualPnl)}
          />
          <Stat
            label="AVG WIN"
            value={fmtUsd(ledger?.avgWinDollars)}
            color="var(--green)"
          />
          <Stat
            label="AVG LOSS"
            value={fmtUsd(ledger?.avgLossDollars)}
            color="var(--red)"
          />
        </div>

        <div
          style={{
            marginTop: 16,
            borderTop: "1px dashed var(--border-dim)",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            PROMOTE-TO-LIVE READINESS
          </div>
          <ReadinessBar
            label="RESOLVED"
            value={ledger?.promoteReadiness?.resolvedCount ?? 0}
            target={ledger?.promoteReadiness?.requiredResolved ?? 30}
            display={`${ledger?.promoteReadiness?.resolvedCount ?? 0} / ${ledger?.promoteReadiness?.requiredResolved ?? 30}`}
          />
          <ReadinessBar
            label="HIT RATE"
            value={(ledger?.promoteReadiness?.hitRate ?? 0) * 100}
            target={(ledger?.promoteReadiness?.requiredHitRate ?? 0.55) * 100}
            display={`${((ledger?.promoteReadiness?.hitRate ?? 0) * 100).toFixed(1)}% / ${((ledger?.promoteReadiness?.requiredHitRate ?? 0.55) * 100).toFixed(0)}%`}
          />
          <ReadinessBar
            label="ROI"
            value={((ledger?.promoteReadiness?.roi ?? 0) + 0.5) * 100}
            target={50.01}
            display={`${((ledger?.promoteReadiness?.roi ?? 0) * 100).toFixed(1)}%`}
          />

          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="btn btn-green"
              disabled={
                !ledger?.promoteReadiness?.isReady || promote.isPending
              }
              onClick={() => promote.mutate()}
            >
              {promote.isPending ? "PROMOTING…" : "PROMOTE TO LIVE"}
            </button>
            {!ledger?.promoteReadiness?.isReady && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                {(ledger?.promoteReadiness?.missingCriteria ?? []).join("  ·  ")}
              </span>
            )}
            {promote.isError && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--red)",
                }}
              >
                {String((promote.error as Error)?.message ?? "Failed")}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function DeploymentStrip({
  deployment,
  settings,
}: {
  deployment: any;
  settings: any;
}) {
  const renderBar = () => {
    if (!deployment || !(deployment.bankroll > 0)) return null;
    const bk = deployment.bankroll;
    const deployedPct = Math.min(100, (deployment.deployed / bk) * 100);
    const availPct = Math.max(0, 100 - deployedPct);
    const profitablePct =
      deployment.openCount > 0
        ? (deployment.profitableOpenCount / Math.max(deployment.openCount, 1)) * deployedPct
        : 0;
    const underwaterPct =
      deployment.openCount > 0
        ? (deployment.underwaterOpenCount / Math.max(deployment.openCount, 1)) * deployedPct
        : 0;
    const flatPct = deployedPct - profitablePct - underwaterPct;
    return (
      <div
        style={{
          position: "relative",
          height: 8,
          background: "var(--bg-base)",
          borderRadius: 4,
          overflow: "hidden",
          border: "1px solid var(--border-dim)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${profitablePct}%`,
            background: "var(--green)",
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${profitablePct}%`,
            top: 0,
            height: "100%",
            width: `${flatPct}%`,
            background: "var(--amber)",
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${profitablePct + flatPct}%`,
            top: 0,
            height: "100%",
            width: `${underwaterPct}%`,
            background: "var(--red)",
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            height: "100%",
            width: `${availPct}%`,
            background: "var(--bg-panel)",
          }}
        />
      </div>
    );
  };

  return (
    <section className="panel" style={{ padding: "14px 18px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <DeployStat
          label="BANKROLL"
          value={fmtUsd(deployment?.bankroll ?? settings?.virtualBankroll)}
        />
        <DeployStat
          label="DEPLOYED"
          value={fmtUsd(deployment?.deployed)}
          sub={deployment ? `${deployment.openCount} open` : undefined}
          color="var(--cyan)"
        />
        <DeployStat
          label="AVAILABLE"
          value={fmtUsd(deployment?.available)}
          color="var(--green)"
        />
        <DeployStat
          label="MtM P&L"
          value={fmtUsd(deployment?.mtmPnl, true)}
          color={pnlColor(deployment?.mtmPnl)}
          sub="unrealized"
        />
        <DeployStat
          label="REALIZED P&L"
          value={fmtUsd(deployment?.realizedPnl, true)}
          color={pnlColor(deployment?.realizedPnl)}
          sub={deployment ? `${deployment.resolvedCount} closed` : undefined}
        />
        <DeployStat
          label="TOTAL P&L"
          value={fmtUsd(deployment?.totalPnl, true)}
          color={pnlColor(deployment?.totalPnl)}
        />
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          {deployment
            ? `${deployment.openCount} open · ${deployment.resolvedCount} resolved · ${deployment.expiredCount} expired · ${deployment.totalCount} total tracked`
            : "—"}
        </span>
      </div>

      {deployment?.recentRejectionCounters &&
        Object.keys(deployment.recentRejectionCounters).length > 0 && (
          <div
            style={{
              marginTop: 6,
              marginBottom: 6,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--text-dim)",
            }}
          >
            Circuit breakers this cycle:{" "}
            {Object.entries(
              deployment.recentRejectionCounters as Record<string, number>,
            ).map(([k, v]) => (
              <span key={k} style={{ color: "var(--amber)", marginRight: 12 }}>
                {k}={v}
              </span>
            ))}
          </div>
        )}

      {renderBar()}

      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 6,
          fontFamily: "var(--mono)",
          fontSize: 9,
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
        }}
      >
        <span style={{ color: "var(--green)" }}>
          ■ IN PROFIT ({deployment?.profitableOpenCount ?? 0})
        </span>
        <span style={{ color: "var(--amber)" }}>
          ■ FLAT ({deployment?.flatOpenCount ?? 0})
        </span>
        <span style={{ color: "var(--red)" }}>
          ■ UNDERWATER ({deployment?.underwaterOpenCount ?? 0})
        </span>
        <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
          ■ AVAILABLE
        </span>
      </div>
    </section>
  );
}

function OpenPositionsSection({
  positions,
  posSort,
  posSortDir,
  setPosSort,
  setPosSortDir,
}: {
  positions: any[] | undefined;
  posSort: "age" | "pnl";
  posSortDir: "desc" | "asc";
  setPosSort: (f: "age" | "pnl") => void;
  setPosSortDir: (fn: (d: "desc" | "asc") => "desc" | "asc") => void;
}) {
  const list = positions ?? [];

  const renderTable = () => {
    const sorted = [...list].sort((a: any, b: any) => {
      const dir = posSortDir === "desc" ? -1 : 1;
      if (posSort === "pnl") {
        return ((a.markToMarketPnlDollars ?? 0) - (b.markToMarketPnlDollars ?? 0)) * -dir;
      }
      return ((a.ageMins ?? 0) - (b.ageMins ?? 0)) * -dir;
    });
    return (
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            fontFamily: "var(--mono)",
            fontSize: 11,
            borderCollapse: "collapse",
            minWidth: 740,
          }}
        >
          <thead>
            <tr
              style={{
                color: "var(--text-dim)",
                textAlign: "left",
                letterSpacing: "0.07em",
                borderBottom: "1px solid var(--border-dim)",
              }}
            >
              <th style={{ padding: "5px 8px" }}>#</th>
              <th
                style={{ padding: "5px 8px", cursor: "pointer" }}
                onClick={() => {
                  if (posSort === "age") setPosSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  else {
                    setPosSort("age");
                    setPosSortDir(() => "desc");
                  }
                }}
              >
                AGE {posSort === "age" ? (posSortDir === "desc" ? "▼" : "▲") : ""}
              </th>
              <th style={{ padding: "5px 8px" }}>MATCH</th>
              <th style={{ padding: "5px 8px" }}>STRATEGY</th>
              <th style={{ padding: "5px 8px" }}>SIDE</th>
              <th style={{ padding: "5px 8px", textAlign: "right" }}>SIZE</th>
              <th style={{ padding: "5px 8px", textAlign: "right" }}>ENTRY</th>
              <th style={{ padding: "5px 8px", textAlign: "right" }}>NOW</th>
              <th style={{ padding: "5px 8px", textAlign: "right" }}>Δ</th>
              <th
                style={{ padding: "5px 8px", textAlign: "right", cursor: "pointer" }}
                onClick={() => {
                  if (posSort === "pnl") setPosSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  else {
                    setPosSort("pnl");
                    setPosSortDir(() => "desc");
                  }
                }}
              >
                MtM P&L {posSort === "pnl" ? (posSortDir === "desc" ? "▼" : "▲") : ""}
              </th>
              <th style={{ padding: "5px 8px", textAlign: "right" }}>EXP. RES.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos: any, idx: number) => {
              const mtm = pos.markToMarketPnlDollars ?? null;
              const mtmColor =
                mtm == null
                  ? "var(--text-dim)"
                  : mtm > 0.005
                    ? "var(--green)"
                    : mtm < -0.005
                      ? "var(--red)"
                      : "var(--text-secondary)";
              const borderColor =
                mtm == null
                  ? "transparent"
                  : mtm > 0.005
                    ? "var(--green)"
                    : mtm < -0.005
                      ? "#ff5252aa"
                      : "transparent";
              const currentP = pos.currentPrice ?? null;
              const delta = currentP != null ? currentP - pos.entryPrice : null;
              const almostResolving =
                pos.ageMins != null &&
                pos.maxAgeMins != null &&
                pos.maxAgeMins - pos.ageMins < 60;
              const ageMins = pos.ageMins ?? 0;
              const ageStr =
                ageMins >= 60
                  ? `${Math.floor(ageMins / 60)}h ${Math.round(ageMins % 60)}m`
                  : `${Math.round(ageMins)}m`;
              return (
                <tr
                  key={pos.id}
                  style={{
                    borderBottom: "1px dashed var(--border-dim)",
                    borderLeft: `3px solid ${borderColor}`,
                  }}
                >
                  <td style={{ padding: "5px 8px", color: "var(--text-dim)" }}>{idx + 1}</td>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: almostResolving ? "var(--cyan)" : "var(--text-secondary)",
                    }}
                  >
                    {ageStr}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: "var(--text-primary)",
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div>{pos.matchup}</div>
                    <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>
                      {pos.sport} · {pos.league}
                    </div>
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <span
                      className={`badge-${pos.strategy?.startsWith("bloat") ? "bloat" : pos.strategy}`}
                    >
                      {pos.strategy}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: pos.side === "yes" ? "var(--green)" : "var(--red)",
                      fontWeight: 700,
                    }}
                  >
                    {pos.side?.toUpperCase() ?? "?"}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--cyan)" }}>
                    {fmtUsd(pos.sizeDollars)}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {(pos.entryPrice * 100).toFixed(0)}¢
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: currentP != null ? "var(--text-primary)" : "var(--text-dim)",
                    }}
                  >
                    {currentP != null ? `${(currentP * 100).toFixed(0)}¢` : "—"}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color:
                        delta == null
                          ? "var(--text-dim)"
                          : delta > 0
                            ? "var(--green)"
                            : delta < 0
                              ? "var(--red)"
                              : "var(--text-secondary)",
                    }}
                  >
                    {delta != null ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}¢` : "—"}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: mtmColor,
                      fontWeight: 700,
                    }}
                  >
                    {mtm != null ? fmtUsd(mtm, true) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: almostResolving ? "var(--cyan)" : "var(--text-dim)",
                    }}
                  >
                    {fmtHHMM(pos.expectedResolutionAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="panel" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          OPEN VIRTUAL POSITIONS
        </h3>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--cyan)",
            fontWeight: 700,
          }}
        >
          ({list.length})
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          sort:
        </span>
        {(["pnl", "age"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              if (posSort === f) setPosSortDir((d) => (d === "desc" ? "asc" : "desc"));
              else {
                setPosSort(f);
                setPosSortDir(() => "desc");
              }
            }}
            style={{
              background: posSort === f ? "var(--bg-card)" : "transparent",
              border: `1px solid ${posSort === f ? "var(--cyan)" : "var(--border-dim)"}`,
              color: posSort === f ? "var(--cyan)" : "var(--text-dim)",
              fontFamily: "var(--mono)",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f.toUpperCase()} {posSort === f ? (posSortDir === "desc" ? "▼" : "▲") : ""}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div
          style={{
            padding: "24px 0",
            textAlign: "center",
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          No open virtual positions yet — next picks cycle will create them.
        </div>
      ) : (
        renderTable()
      )}
    </section>
  );
}

function ResolvedPositionsSection({
  resolvedData,
  resolvedSort,
  resolvedSortDir,
  setResolvedSort,
  setResolvedSortDir,
  showAllResolved,
  setShowAllResolved,
}: {
  resolvedData: any;
  resolvedSort: "resolved_at" | "pnl" | "hold";
  resolvedSortDir: "desc" | "asc";
  setResolvedSort: (f: "resolved_at" | "pnl" | "hold") => void;
  setResolvedSortDir: (fn: (d: "desc" | "asc") => "desc" | "asc") => void;
  showAllResolved: boolean;
  setShowAllResolved: (fn: (v: boolean) => boolean) => void;
}) {
  const positions: any[] = resolvedData?.positions ?? [];
  const totalCount: number = resolvedData?.totalCount ?? 0;

  const renderSummary = () => {
    const s = resolvedData?.summary;
    if (!s) return null;
    return (
      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          padding: "8px 0 12px",
          borderBottom: "1px solid var(--border-dim)",
          marginBottom: 10,
        }}
      >
        <DeployStat label="WINS" value={String(s.wins)} color="var(--green)" />
        <DeployStat label="LOSSES" value={String(s.losses)} color="var(--red)" />
        <DeployStat
          label="HIT RATE"
          value={`${(s.hitRate * 100).toFixed(1)}%`}
          color={s.hitRate >= 0.55 ? "var(--green)" : "var(--amber)"}
        />
        <DeployStat
          label="NET P&L"
          value={fmtUsd(s.netPnl, true)}
          color={pnlColor(s.netPnl)}
        />
        <DeployStat label="AVG WIN" value={fmtUsd(s.avgWin)} color="var(--green)" />
        <DeployStat label="AVG LOSS" value={fmtUsd(-s.avgLoss)} color="var(--red)" />
        <DeployStat
          label="AVG HOLD"
          value={
            s.avgHoldMinutes >= 60
              ? `${(s.avgHoldMinutes / 60).toFixed(1)}h`
              : `${s.avgHoldMinutes.toFixed(0)}m`
          }
        />
      </div>
    );
  };

  const renderTable = () => {
    const sorted = [...positions].sort((a, b) => {
      const dir = resolvedSortDir === "desc" ? -1 : 1;
      if (resolvedSort === "pnl")
        return ((a.realizedPnlDollars ?? 0) - (b.realizedPnlDollars ?? 0)) * -dir;
      if (resolvedSort === "hold")
        return ((a.holdMinutes ?? 0) - (b.holdMinutes ?? 0)) * -dir;
      const at = a.exitTime ? new Date(a.exitTime).getTime() : 0;
      const bt = b.exitTime ? new Date(b.exitTime).getTime() : 0;
      return (at - bt) * -dir;
    });
    const display = showAllResolved ? sorted : sorted.slice(0, 20);
    return (
      <>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: 11,
              borderCollapse: "collapse",
              minWidth: 700,
            }}
          >
            <thead>
              <tr
                style={{
                  color: "var(--text-dim)",
                  textAlign: "left",
                  letterSpacing: "0.07em",
                  borderBottom: "1px solid var(--border-dim)",
                }}
              >
                <th style={{ padding: "5px 8px" }}>RESOLVED AT</th>
                <th style={{ padding: "5px 8px" }}>MATCH</th>
                <th style={{ padding: "5px 8px" }}>STRATEGY</th>
                <th style={{ padding: "5px 8px" }}>SIDE</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>SIZE</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>ENTRY</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>EXIT</th>
                <th style={{ padding: "5px 8px" }}>OUTCOME</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>REALIZED P&L</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>HOLD</th>
              </tr>
            </thead>
            <tbody>
              {display.map((pos: any) => {
                const pnl = pos.realizedPnlDollars ?? null;
                const pnlColor2 =
                  pnl == null
                    ? "var(--text-dim)"
                    : pnl > 0
                      ? "var(--green)"
                      : pnl < 0
                        ? "var(--red)"
                        : "var(--text-secondary)";
                const isExpired = pos.status === "virtual_expired";
                const outcomeLabel = isExpired
                  ? "EXPIRED"
                  : pos.outcome === "win"
                    ? "WIN"
                    : pos.outcome === "loss"
                      ? "LOSS"
                      : "PUSH";
                const outcomeColor = isExpired
                  ? "var(--text-dim)"
                  : pos.outcome === "win"
                    ? "var(--green)"
                    : pos.outcome === "loss"
                      ? "var(--red)"
                      : "var(--amber)";
                const holdStr =
                  pos.holdMinutes != null
                    ? pos.holdMinutes >= 60
                      ? `${Math.floor(pos.holdMinutes / 60)}h ${Math.round(pos.holdMinutes % 60)}m`
                      : `${Math.round(pos.holdMinutes)}m`
                    : "—";
                return (
                  <tr
                    key={pos.id}
                    style={{ borderBottom: "1px dashed var(--border-dim)" }}
                  >
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--text-dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pos.exitTime
                        ? new Date(pos.exitTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--text-primary)",
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pos.matchup}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span
                        className={`badge-${pos.strategy?.startsWith("bloat") ? "bloat" : pos.strategy}`}
                      >
                        {pos.strategy}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        color: pos.side === "yes" ? "var(--green)" : "var(--red)",
                        fontWeight: 700,
                      }}
                    >
                      {pos.side?.toUpperCase() ?? "?"}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--cyan)",
                      }}
                    >
                      {fmtUsd(pos.sizeDollars)}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {pos.entryPrice != null ? `${(pos.entryPrice * 100).toFixed(0)}¢` : "—"}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {pos.exitPrice != null ? `${(pos.exitPrice * 100).toFixed(0)}¢` : "—"}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          fontWeight: 700,
                          color: outcomeColor,
                          letterSpacing: "0.06em",
                        }}
                      >
                        {outcomeLabel}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: pnlColor2,
                        fontWeight: 700,
                      }}
                    >
                      {pnl != null ? fmtUsd(pnl, true) : "—"}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--text-dim)",
                      }}
                    >
                      {holdStr}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalCount > 20 && (
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <button
              onClick={() => setShowAllResolved((v) => !v)}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--cyan)",
                background: "transparent",
                border: "1px solid var(--cyan)",
                padding: "4px 16px",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              {showAllResolved ? "SHOW LESS" : `SHOW ALL ${totalCount}`}
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <section className="panel" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          RESOLVED VIRTUAL POSITIONS
        </h3>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            fontWeight: 700,
          }}
        >
          ({totalCount})
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          sort:
        </span>
        {(["resolved_at", "pnl", "hold"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              if (resolvedSort === f)
                setResolvedSortDir((d) => (d === "desc" ? "asc" : "desc"));
              else {
                setResolvedSort(f);
                setResolvedSortDir(() => "desc");
              }
            }}
            style={{
              background: resolvedSort === f ? "var(--bg-card)" : "transparent",
              border: `1px solid ${resolvedSort === f ? "var(--cyan)" : "var(--border-dim)"}`,
              color: resolvedSort === f ? "var(--cyan)" : "var(--text-dim)",
              fontFamily: "var(--mono)",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f === "resolved_at" ? "TIME" : f.toUpperCase()}{" "}
            {resolvedSort === f ? (resolvedSortDir === "desc" ? "▼" : "▲") : ""}
          </button>
        ))}
      </div>

      {renderSummary()}

      {positions.length === 0 ? (
        <div
          style={{
            padding: "24px 0",
            textAlign: "center",
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          No resolved virtual positions yet.
        </div>
      ) : (
        renderTable()
      )}
    </section>
  );
}

function ByMatchSection({
  byMatchData,
  expanded,
  setExpanded,
}: {
  byMatchData: any;
  expanded: boolean;
  setExpanded: (fn: (v: boolean) => boolean) => void;
}) {
  const matches: any[] = byMatchData?.matches ?? [];

  return (
    <section className="panel" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: expanded ? 12 : 0,
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <h3 className="h-section" style={{ margin: 0 }}>
          BY MATCH
        </h3>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          ({matches.length} events tracked)
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          {expanded ? "▲" : "▼"}
        </span>
      </div>
      {expanded &&
        (matches.length === 0 ? (
          <div
            style={{
              padding: "16px 0",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            No match data yet.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: 11,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  color: "var(--text-dim)",
                  textAlign: "left",
                  letterSpacing: "0.07em",
                  borderBottom: "1px solid var(--border-dim)",
                }}
              >
                <th style={{ padding: "5px 8px" }}>MATCH</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>OPEN</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>RESOLVED</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>NET P&L</th>
                <th style={{ padding: "5px 8px", textAlign: "right" }}>MtM P&L</th>
                <th style={{ padding: "5px 8px" }}>LATEST STATUS</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m: any) => (
                <tr
                  key={m.eventTicker}
                  style={{ borderBottom: "1px dashed var(--border-dim)" }}
                >
                  <td
                    style={{
                      padding: "5px 8px",
                      color: "var(--text-primary)",
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.matchTitle}
                    <div style={{ fontSize: 9, color: "var(--text-dim)" }}>
                      {m.eventTicker}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: m.openCount > 0 ? "var(--cyan)" : "var(--text-dim)",
                    }}
                  >
                    {m.openCount}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {m.resolvedCount}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: pnlColor(m.netPnl),
                    }}
                  >
                    {fmtUsd(m.netPnl, true)}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      textAlign: "right",
                      color: pnlColor(m.mtmPnl),
                    }}
                  >
                    {fmtUsd(m.mtmPnl, true)}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: "var(--text-dim)",
                      fontSize: 10,
                    }}
                  >
                    {m.latestStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </section>
  );
}

function PickCard({ pick }: { pick: any }) {
  const glow = RANK_GLOW[pick.rank] ?? "var(--text-dim)";
  const sideColor = pick.side === "yes" ? "var(--green)" : "var(--red)";
  return (
    <div
      className="card-panel"
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderTop: `2px solid ${glow}`,
        boxShadow: `0 0 18px ${glow}26`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--bg-base)",
            border: `1px solid ${glow}`,
            color: glow,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            boxShadow: `0 0 6px ${glow}`,
          }}
        >
          #{pick.rank}
        </div>
        <span
          className={`badge-${pick.strategy.startsWith("bloat") ? "bloat" : pick.strategy}`}
        >
          {pick.strategy}
        </span>
        {pick.isColdStart && (
          <span className="badge-amber">COLD START</span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-dim)",
          }}
        >
          rank {pick.rankScore.toFixed(1)}
        </span>
      </div>

      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "0.04em",
        }}
      >
        {pick.matchup}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 22,
            fontWeight: 800,
            color: sideColor,
            letterSpacing: "0.08em",
            textShadow: `0 0 10px ${sideColor}66`,
          }}
        >
          {pick.recommendation}
        </span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          @ {(pick.virtualEntryPrice * 100).toFixed(1)}¢
        </span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--cyan)",
            marginLeft: "auto",
            fontWeight: 700,
          }}
        >
          SIZE ${pick.recommendedSizeDollars.toFixed(2)}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        <div>
          <div style={{ color: "var(--text-dim)" }}>CAL HIT</div>
          <div
            style={{
              color: pick.isColdStart ? "var(--amber)" : "var(--text-primary)",
            }}
          >
            {(pick.calibratedHitRate * 100).toFixed(1)}% ({pick.bucketSampleSize})
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-dim)" }}>EDGE</div>
          <div style={{ color: "var(--text-primary)" }}>
            {pick.edgePercent.toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-dim)" }}>EV / $1</div>
          <div style={{ color: pnlColor(pick.expectedValue) }}>
            {pick.expectedValue >= 0 ? "+" : ""}
            {(pick.expectedValue * 100).toFixed(1)}¢
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          fontStyle: "italic",
          lineHeight: 1.5,
          borderLeft: "2px solid var(--border-dim)",
          paddingLeft: 8,
        }}
      >
        {pick.whyThisPick}
      </div>

      <div
        style={{
          marginTop: 4,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {pick.rankComponents.map((c: any) => (
          <ComponentBar key={c.key} c={c} />
        ))}
      </div>
    </div>
  );
}

function ComponentBar({ c }: { c: any }) {
  const isPositive = c.contribution >= 0;
  const pct = Math.min(100, (Math.abs(c.contribution) / 0.3) * 100);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr 50px",
        gap: 6,
        alignItems: "center",
        fontFamily: "var(--mono)",
        fontSize: 9,
      }}
    >
      <span style={{ color: "var(--text-dim)" }}>{c.label}</span>
      <div
        style={{
          height: 5,
          background: "var(--bg-base)",
          borderRadius: 2,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: isPositive ? "var(--green)" : "var(--red)",
            opacity: 0.7,
          }}
        />
      </div>
      <span
        style={{
          color: isPositive ? "var(--green)" : "var(--red)",
          textAlign: "right",
        }}
      >
        {isPositive ? "+" : ""}
        {(c.contribution * 100).toFixed(1)}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          color: "var(--text-dim)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 14,
          fontWeight: 700,
          color: color ?? "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DeployStat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | undefined;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 15,
          fontWeight: 700,
          color: color ?? "var(--text-primary)",
        }}
      >
        {value ?? "—"}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            color: "var(--text-dim)",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function HealthRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: "1px dashed var(--border-dim)",
        fontFamily: "var(--mono)",
        fontSize: 11,
      }}
    >
      <span style={{ color: "var(--text-dim)", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ color: color ?? "var(--text-primary)", fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );
}

function ReadinessBar({
  label,
  value,
  target,
  display,
}: {
  label: string;
  value: number;
  target: number;
  display: string;
}) {
  const pct = Math.min(100, (value / Math.max(target, 0.01)) * 100);
  const ready = value >= target;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr 110px",
        gap: 8,
        alignItems: "center",
        padding: "4px 0",
        fontFamily: "var(--mono)",
        fontSize: 11,
      }}
    >
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <div
        style={{
          height: 6,
          background: "var(--bg-base)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: ready ? "var(--green)" : "var(--amber)",
            opacity: 0.8,
          }}
        />
      </div>
      <span
        style={{
          color: ready ? "var(--green)" : "var(--text-secondary)",
          textAlign: "right",
        }}
      >
        {display}
      </span>
    </div>
  );
}
