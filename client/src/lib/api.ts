const BASE = "";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, options);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  getSettings: () => req<any>("/api/settings"),
  updateSettings: (data: any) =>
    req<any>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getCredStatus: () => req<any>("/api/credentials/status"),
  setCredentials: (data: any) =>
    req<any>("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  clearCredentials: () => req<any>("/api/credentials", { method: "DELETE" }),

  getScannerStatus: () => req<any>("/api/scanner/status"),
  getScanHealth: () => req<any>("/api/scan/health"),
  getAnalyticsSummary: () => req<any>("/api/analytics/summary"),
  triggerScan: () => req<any>("/api/scanner/run", { method: "POST" }),

  getEvents: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<any[]>(`/api/events${qs}`);
  },
  getEvent: (ticker: string) => req<any>(`/api/events/${encodeURIComponent(ticker)}`),

  getSignals: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<any[]>(`/api/signals${qs}`);
  },
  getPendingSignals: () => req<any[]>("/api/signals/pending"),
  confirmSignal: (id: string) =>
    req<any>(`/api/signals/${id}/confirm`, { method: "POST" }),
  skipSignal: (id: string) =>
    req<any>(`/api/signals/${id}/skip`, { method: "POST" }),
  watchSignal: (id: string) =>
    req<any>(`/api/signals/${id}/watch`, { method: "POST" }),

  getBotStatus: () => req<any>("/api/bot/status"),
  getBotActions: () => req<any[]>("/api/bot/actions"),

  getOpportunities: (date?: string) => {
    const qs = date ? `?date=${date}` : "";
    return req<any[]>(`/api/analytics/opportunities${qs}`);
  },
  getOpeningDrift: () => req<any[]>("/api/analytics/opening-drift"),
  getLeagueHeat: () => req<any[]>("/api/analytics/league-heat"),

  getIntelReport: () => req<any>("/api/intelligence/report"),
  refreshIntel: () => req<any>("/api/intelligence/refresh", { method: "POST" }),
};

export function heatClass(score: number): string {
  if (score <= 0) return "heat-0";
  if (score < 20) return "heat-low";
  if (score < 40) return "heat-mid";
  if (score < 70) return "heat-high";
  return "heat-max";
}
export function heatBgClass(score: number): string {
  if (score <= 0) return "heat-bg-0";
  if (score < 20) return "heat-bg-low";
  if (score < 40) return "heat-bg-mid";
  if (score < 70) return "heat-bg-high";
  return "heat-bg-max";
}
