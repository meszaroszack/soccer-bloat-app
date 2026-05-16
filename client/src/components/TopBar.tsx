import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Tab } from "../App";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "markets", label: "Live Markets" },
  { id: "signals", label: "Signals" },
  { id: "bot", label: "Bot" },
  { id: "analytics", label: "Analytics" },
  { id: "intelligence", label: "Intelligence" },
  { id: "settings", label: "Settings" },
];

interface Props {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
}

export function TopBar({ activeTab, onTabChange }: Props) {
  const { data: status } = useQuery({
    queryKey: ["scanner-status"],
    queryFn: api.getScannerStatus,
    refetchInterval: 5000,
  });

  const running = status?.running;
  const lastScan = status?.lastScan ? new Date(status.lastScan).toLocaleTimeString() : "—";
  const errCount = status?.errors?.length ?? 0;

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
      }}
    >
      <div
        style={{
          padding: "0 22px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRight: "1px solid var(--border-dim)",
          height: 52,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: "var(--cyan)",
            boxShadow: "0 0 8px var(--cyan)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontWeight: 700,
            letterSpacing: "0.18em",
            fontSize: 13,
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
            className={`tab-btn ${activeTab === t.id ? "tab-active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div
        style={{
          padding: "0 22px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className={running ? "dot-live" : "dot-dead"} />
          <span style={{ color: running ? "var(--green)" : "var(--text-dim)" }}>
            {running ? "SCANNING" : "IDLE"}
          </span>
        </div>
        <span style={{ color: "var(--text-dim)" }}>•</span>
        <span>LAST {lastScan}</span>
        {errCount > 0 && (
          <>
            <span style={{ color: "var(--text-dim)" }}>•</span>
            <span style={{ color: "var(--red)" }}>{errCount} ERR</span>
          </>
        )}
      </div>
    </header>
  );
}
