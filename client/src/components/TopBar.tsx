import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Tab } from "../App";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "markets", label: "LIVE MARKETS" },
  { id: "signals", label: "SIGNALS" },
  { id: "bot", label: "BOT" },
  { id: "analytics", label: "ANALYTICS" },
  { id: "intelligence", label: "INTELLIGENCE" },
  { id: "settings", label: "SETTINGS" },
];

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
}

export function TopBar({ activeTab, onTabChange }: Props) {
  const { data: health } = useQuery({
    queryKey: ["scan-health"],
    queryFn: api.getScanHealth,
    refetchInterval: 8000,
  });

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: api.getAnalyticsSummary,
    refetchInterval: 15000,
  });

  const status = health?.status ?? "stopped";
  const dotColor =
    status === "healthy"
      ? "var(--green)"
      : status === "degraded" || status === "no_data"
        ? "var(--amber)"
        : "var(--red)";
  const statusLabel =
    status === "healthy"
      ? "SCANNING"
      : status === "degraded"
        ? "DEGRADED"
        : status === "no_data"
          ? "NO DATA"
          : "IDLE";

  const lastScanAge = health?.lastScanAgeSeconds;
  const ageStr =
    lastScanAge == null
      ? "—"
      : lastScanAge < 60
        ? `${lastScanAge}s ago`
        : `${Math.round(lastScanAge / 60)}m ago`;

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-panel)",
        display: "flex",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 50,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRight: "1px solid var(--border-dim)",
          height: 48,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: 1,
            background: "var(--cyan)",
            boxShadow: "0 0 8px var(--cyan)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontWeight: 700,
            letterSpacing: "0.16em",
            fontSize: 12,
            color: "var(--cyan)",
          }}
        >
          KALSHI TERMINAL
        </span>
      </div>

      <nav style={{ display: "flex", flex: 1 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              height: 48,
              padding: "0 16px",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === t.id ? "2px solid var(--cyan)" : "2px solid transparent",
              color: activeTab === t.id ? "var(--cyan)" : "var(--text-secondary)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div
        style={{
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "var(--mono)",
          fontSize: 10,
          color: "var(--text-secondary)",
          borderLeft: "1px solid var(--border-dim)",
          height: 48,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: dotColor,
              boxShadow: status === "healthy" ? `0 0 6px ${dotColor}` : "none",
              animation: status === "healthy" ? "pulse-green 2s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ color: dotColor, letterSpacing: "0.08em" }}>{statusLabel}</span>
        </div>

        {summary && (
          <>
            <div style={{ width: 1, height: 14, background: "var(--border-dim)" }} />
            <span style={{ color: "var(--text-dim)" }}>
              {summary.eventsTracked}{" "}
              <span style={{ color: "var(--text-secondary)" }}>EVT</span>
            </span>
            <span style={{ color: "var(--text-dim)" }}>
              {summary.signalsPending}{" "}
              <span
                style={{
                  color: summary.signalsPending > 0 ? "var(--amber)" : "var(--text-secondary)",
                }}
              >
                PEND
              </span>
            </span>
            <span style={{ color: "var(--text-dim)" }}>
              {summary.topOpportunitiesToday}{" "}
              <span style={{ color: "var(--text-secondary)" }}>OPP</span>
            </span>
          </>
        )}

        <div style={{ width: 1, height: 14, background: "var(--border-dim)" }} />
        <span style={{ color: "var(--text-dim)" }}>LAST {ageStr}</span>

        {health?.errorCount > 0 && (
          <span style={{ color: "var(--red)", fontWeight: 600 }}>{health.errorCount} ERR</span>
        )}
      </div>
    </header>
  );
}
