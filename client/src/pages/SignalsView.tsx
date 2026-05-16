import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, heatClass } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";

const STATUSES = [
  "pending_confirm",
  "active",
  "auto_traded",
  "manually_traded",
  "skipped",
  "observed_only",
  "resolved",
  "error",
];

export function SignalsView() {
  const qc = useQueryClient();
  const [strategyFilter, setStrategyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sportFilter, setSportFilter] = useState("");

  const { data: signals = [] } = useQuery({
    queryKey: ["signals"],
    queryFn: () => api.getSignals(),
    refetchInterval: 10_000,
  });
  const { data: credStatus } = useQuery({
    queryKey: ["cred-status"],
    queryFn: api.getCredStatus,
    refetchInterval: 30_000,
  });

  const sports = useMemo(() => Array.from(new Set(signals.map((s) => s.sport))).sort(), [signals]);
  const strategies = useMemo(() => Array.from(new Set(signals.map((s) => s.strategy))).sort(), [signals]);

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (strategyFilter && s.strategy !== strategyFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (sportFilter && s.sport !== sportFilter) return false;
      return true;
    });
  }, [signals, strategyFilter, statusFilter, sportFilter]);

  const counts = useMemo(() => {
    const pending = signals.filter((s) => s.status === "pending_confirm").length;
    const active = signals.filter((s) => s.status === "active" || s.status === "manually_traded" || s.status === "auto_traded").length;
    const observed = signals.filter((s) => s.status === "observed_only").length;
    const skipped = signals.filter((s) => s.status === "skipped").length;
    return { pending, active, observed, skipped, total: signals.length };
  }, [signals]);

  async function act(id: string, action: "confirm" | "skip" | "watch") {
    try {
      if (action === "confirm") await api.confirmSignal(id);
      else if (action === "skip") await api.skipSignal(id);
      else await api.watchSignal(id);
      qc.invalidateQueries({ queryKey: ["signals"] });
    } catch (err) {
      console.error(err);
      alert(String(err));
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
        <SummaryStat label="TOTAL" value={counts.total} />
        <SummaryStat label="PENDING" value={counts.pending} color="var(--amber)" />
        <SummaryStat label="TRADED" value={counts.active} color="var(--green)" />
        <SummaryStat label="OBSERVED" value={counts.observed} color="var(--cyan)" />
        <SummaryStat label="SKIPPED" value={counts.skipped} color="var(--text-dim)" />
      </div>

      <div className="panel" style={{ padding: 12, marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Filter label="STRATEGY" value={strategyFilter} onChange={setStrategyFilter} options={strategies} />
        <Filter label="STATUS" value={statusFilter} onChange={setStatusFilter} options={STATUSES} />
        <Filter label="SPORT" value={sportFilter} onChange={setSportFilter} options={sports} />
        <div style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
          {filtered.length}/{signals.length} SIGNALS
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          <div className="kv-label">NO SIGNALS</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 8 }}>
            Signals appear when strategies fire on scanned events.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`card-panel ${s.status === "pending_confirm" ? "glow-amber" : ""}`}
              style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <StrategyBadge strategy={s.strategy} />
                  <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{s.matchTitle}</span>
                  <span className="kv-label">{s.sport} • {s.league}</span>
                </div>
                <div style={{ display: "flex", gap: 18, fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>SIDE: <span style={{ color: "var(--text-primary)" }}>{s.sideRecommendation}</span></span>
                  <span>SCORE: <span className={heatClass(s.compositeScore)}>{Math.round(s.compositeScore)}</span></span>
                  <span>EDGE: {s.edgePercent.toFixed(1)}%</span>
                  <span>RISK: <span style={{ color: s.riskScore > 50 ? "var(--red)" : s.riskScore > 30 ? "var(--amber)" : "var(--green)" }}>{Math.round(s.riskScore)}</span></span>
                  <span>ACT: {Math.round(s.actionability)}</span>
                  <span>STATUS: <span style={{ color: statusColor(s.status) }}>{s.status}</span></span>
                </div>
                {s.notes && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--red)" }}>{s.notes}</div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(s.status === "pending_confirm" || s.status === "observed_only") && (
                  <>
                    <button
                      className="btn btn-green"
                      disabled={!credStatus?.hasCredentials}
                      onClick={() => act(s.id, "confirm")}
                      title={credStatus?.hasCredentials ? "" : "Configure Kalshi credentials in Settings"}
                    >
                      CONFIRM
                    </button>
                    <button className="btn" onClick={() => act(s.id, "watch")}>WATCH</button>
                    <button className="btn btn-red" onClick={() => act(s.id, "skip")}>SKIP</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card-panel" style={{ padding: 14 }}>
      <div className="kv-label">{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600, color: color ?? "var(--text-primary)", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="kv-label">{label}</span>
      <select className="select" style={{ minWidth: 140 }} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function statusColor(status: string): string {
  if (status === "pending_confirm") return "var(--amber)";
  if (status === "manually_traded" || status === "auto_traded" || status === "active") return "var(--green)";
  if (status === "skipped") return "var(--text-dim)";
  if (status === "error") return "var(--red)";
  if (status === "observed_only") return "var(--cyan)";
  return "var(--text-secondary)";
}
