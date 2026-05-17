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
