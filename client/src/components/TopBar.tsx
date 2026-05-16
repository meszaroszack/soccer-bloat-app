import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Tab } from "../App";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "markets", label: "LIVE MARKETS" },
  { id: "signals", label: "SIGNALS" },
  { id: "account", label: "BOT / ACCOUNT" },
  { id: "analytics", label: "ANALYTICS" },
  { id: "intelligence", label: "INTELLIGENCE" },
  { id: "settings", label: "SETTINGS" },
];

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
}

function nowEt(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TopBar({ activeTab, onTabChange }: Props) {
  const [tick, setTick] = useState(nowEt());
  useEffect(() => {
    const i = setInterval(() => setTick(nowEt()), 1000);
    return () => clearInterval(i);
  }, []);

  const { data: health } = useQuery({
    queryKey: ["scan-health"],
    queryFn: api.getScanHealth,
    refetchInterval: 8000,
  });
  const { data: credStatus } = useQuery({
    queryKey: ["cred-status"],
    queryFn: api.getCredStatus,
    refetchInterval: 30_000,
  });
  const { data: account } = useQuery({
    queryKey: ["account-summary"],
    queryFn: api.getAccountSummary,
    refetchInterval: credStatus?.connected ? 45_000 : false,
    enabled: !!credStatus?.connected,
  });

  const hStatus = health?.status ?? "stopped";
  const running = health?.running;
  const dotColor = running
    ? hStatus === "healthy"
      ? "var(--green)"
      : "var(--amber)"
    : "var(--text-dim)";

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-panel)",
        display: "flex",
        alignItems: "stretch",
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 48,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          gap: 9,
          borderRight: "1px solid var(--border-dim)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: "var(--cyan)",
            boxShadow: "0 0 8px var(--cyan-dim)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontWeight: 700,
            letterSpacing: "0.18em",
            fontSize: 11,
            color: "var(--cyan)",
          }}
        >
          KALSHI SPORTS TERMINAL
        </span>
      </div>

      <nav style={{ display: "flex", flex: 1 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              height: "100%",
              padding: "0 14px",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === t.id ? "2px solid var(--cyan)" : "2px solid transparent",
              color: activeTab === t.id ? "var(--cyan)" : "var(--text-dim)",
              fontFamily: "var(--mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              cursor: "pointer",
              transition: "color 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div
        style={{
          padding: "0 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "var(--mono)",
          fontSize: 10,
          borderLeft: "1px solid var(--border-dim)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: dotColor,
              boxShadow: running ? `0 0 6px ${dotColor}` : "none",
              animation: running ? "pulse-green 2s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ color: dotColor, letterSpacing: "0.06em" }}>
            {running ? "SCAN" : "OFF"}
          </span>
        </div>

        <span style={{ color: "var(--border-active)" }}>|</span>

        <span style={{ color: "var(--text-dim)" }}>
          <span style={{ color: "var(--text-secondary)" }}>{health?.normalizedEventCount ?? 0}</span> EVT
        </span>
        <span style={{ color: "var(--text-dim)" }}>
          <span style={{ color: "var(--text-secondary)" }}>{health?.signalCount ?? 0}</span> SIG
        </span>
        {health?.errorCount > 0 && (
          <span style={{ color: "var(--red)", fontWeight: 700 }}>{health.errorCount} ERR</span>
        )}

        <div style={{ width: 1, height: 14, background: "var(--border-dim)" }} />
        {credStatus?.connected ? (
          account?.connected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--green)",
                  boxShadow: "0 0 4px var(--green)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--green)",
                  fontWeight: 600,
                }}
              >
                ${(account.balanceDollars ?? 0).toFixed(2)}
              </span>
            </div>
          ) : (
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)" }}>
              {account?.error ? "ACCT ERR" : "LOADING…"}
            </span>
          )
        ) : (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
            NO ACCOUNT
          </span>
        )}

        <div style={{ width: 1, height: 14, background: "var(--border-dim)" }} />
        <span style={{ color: "var(--text-dim)" }}>{tick} ET</span>
      </div>
    </header>
  );
}
