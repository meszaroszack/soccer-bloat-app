import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { StrategyBadge } from "./StrategyBadge";
import { heatClass } from "../lib/api";

interface Props {
  event: any | null;
  onClose: () => void;
}

export function EventDrawer({ event, onClose }: Props) {
  if (!event) return null;

  const reasons = (event.latestHeatmapBreakdown ?? []) as Array<{
    key: string;
    score: number;
    label: string;
  }>;

  const chartData = reasons.map((r) => ({
    name: r.label.length > 32 ? r.label.slice(0, 30) + "…" : r.label,
    score: r.score,
    key: r.key,
  }));

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "#000a",
          zIndex: 100,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 560,
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--border-active)",
          zIndex: 110,
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="kv-label">{event.sport} • {event.league}</div>
            <h2 style={{ fontSize: 18, color: "var(--text-primary)", margin: "6px 0 4px 0" }}>
              {event.matchup}
            </h2>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
              {event.eventTicker}
            </div>
          </div>
          <button onClick={onClose} className="btn">CLOSE</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 22 }}>
          <Stat label="LIVE" value={event.isLive ? "YES" : "NO"} accent={event.isLive ? "green" : "dim"} />
          <Stat label="MIN" value={String(event.minuteEstimate ?? 0)} />
          <Stat label="FAV %" value={(event.favoriteProb * 100).toFixed(0) + "%"} />
          <Stat label="SCORE" value={String(Math.round(event.latestCompositeScore ?? 0))} accent="heat" score={event.latestCompositeScore} />
        </div>

        <h3 className="h-section">Heatmap Breakdown</h3>
        {chartData.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "16px 0" }}>
            No active signal components yet.
          </div>
        ) : (
          <div style={{ width: "100%", height: Math.max(180, chartData.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                <XAxis type="number" stroke="#4a5568" tick={{ fontSize: 10, fill: "#8892a4", fontFamily: "var(--mono)" }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={160}
                  stroke="#4a5568"
                  tick={{ fontSize: 10, fill: "#8892a4", fontFamily: "var(--mono)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#13171e",
                    border: "1px solid #2a3548",
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Bar dataKey="score">
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.score >= 0 ? "#00bcd4" : "#ff5252"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {(event.detectedStrategies ?? []).length > 0 && (
          <>
            <h3 className="h-section" style={{ marginTop: 18 }}>Detected Strategies</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {event.detectedStrategies.map((s: string) => (
                <StrategyBadge key={s} strategy={s} />
              ))}
            </div>
          </>
        )}

        <h3 className="h-section">Markets ({event.markets?.length ?? 0})</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(event.markets ?? []).map((m: any) => (
            <div
              key={m.ticker}
              className="card-panel"
              style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{m.subtitle ?? m.title}</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>{m.ticker}</div>
              </div>
              <div style={{ display: "flex", gap: 16, fontFamily: "var(--mono)", fontSize: 12 }}>
                <span><span className="kv-label" style={{ marginRight: 4 }}>YES</span>{(m.yesPrice * 100).toFixed(0)}¢</span>
                <span><span className="kv-label" style={{ marginRight: 4 }}>NO</span>{(m.noPrice * 100).toFixed(0)}¢</span>
              </div>
            </div>
          ))}
        </div>

        {event.openingSnapshot && (
          <>
            <h3 className="h-section" style={{ marginTop: 18 }}>Opening Snapshot</h3>
            <div className="card-panel" style={{ padding: 12, fontFamily: "var(--mono)", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span className="kv-label">First seen</span>
                <span>{new Date(event.openingSnapshot.firstSeenAt).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span className="kv-label">First YES</span>
                <span>{(event.openingSnapshot.firstYesPrice * 100).toFixed(0)}¢</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span className="kv-label">Near 50/50</span>
                <span style={{ color: event.openingSnapshot.near5050AtOpen ? "var(--green)" : "var(--text-dim)" }}>
                  {event.openingSnapshot.near5050AtOpen ? "YES" : "NO"}
                </span>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  score,
}: {
  label: string;
  value: string;
  accent?: "green" | "dim" | "heat";
  score?: number;
}) {
  let color = "var(--text-primary)";
  if (accent === "green") color = "var(--green)";
  if (accent === "dim") color = "var(--text-dim)";
  return (
    <div className="card-panel" style={{ padding: 10 }}>
      <div className="kv-label">{label}</div>
      <div
        className={accent === "heat" && score !== undefined ? heatClass(score) : ""}
        style={{
          fontFamily: "var(--mono)",
          fontSize: 18,
          fontWeight: 600,
          color: accent === "heat" ? undefined : color,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
