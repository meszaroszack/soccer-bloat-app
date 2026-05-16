import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveMarketsView } from "./pages/LiveMarketsView";
import { SignalsView } from "./pages/SignalsView";
import { BotView } from "./pages/BotView";
import { AnalyticsView } from "./pages/AnalyticsView";
import { IntelligenceView } from "./pages/IntelligenceView";
import { SettingsView } from "./pages/SettingsView";
import { TopBar } from "./components/TopBar";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export type Tab = "markets" | "signals" | "bot" | "analytics" | "intelligence" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("markets");

  return (
    <QueryClientProvider client={qc}>
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-base)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar activeTab={tab} onTabChange={setTab} />
        <main style={{ flex: 1, overflow: "auto" }}>
          {tab === "markets" && <LiveMarketsView />}
          {tab === "signals" && <SignalsView />}
          {tab === "bot" && <BotView />}
          {tab === "analytics" && <AnalyticsView />}
          {tab === "intelligence" && <IntelligenceView />}
          {tab === "settings" && <SettingsView />}
        </main>
      </div>
    </QueryClientProvider>
  );
}
