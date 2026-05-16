const BASE = "";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

const post = (path: string, body?: any) =>
  req<any>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

const put = (path: string, body?: any) =>
  req<any>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

const del = (path: string) => req<any>(path, { method: "DELETE" });

export const api = {
  // settings
  getSettings: () => req<any>("/api/settings"),
  updateSettings: (data: any) => put("/api/settings", data),

  // credentials
  getCredStatus: () => req<any>("/api/credentials/status"),
  setCredentials: (data: any) => post("/api/credentials", data),
  credRefresh: () => post("/api/credentials/refresh"),
  clearCredentials: () => del("/api/credentials"),

  // scanner
  getScanHealth: () => req<any>("/api/scan/health"),
  getEvents: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<any[]>(`/api/scan/events${qs}`);
  },
  getEvent: (ticker: string) => req<any>(`/api/events/${encodeURIComponent(ticker)}`),
  triggerScan: () => post("/api/scan/run"),

  // signals
  getSignals: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<any[]>(`/api/signals${qs}`);
  },
  skipSignal: (id: string) => post(`/api/signals/${id}/skip`),
  watchSignal: (id: string) => post(`/api/signals/${id}/watch`),
  confirmSignal: (id: string) => post(`/api/signals/${id}/confirm`),

  // bot
  getBotStatus: () => req<any>("/api/bot/status"),
  getBotPending: () => req<any[]>("/api/bot/pending"),
  getBotActions: () => req<any[]>("/api/bot/actions"),
  botConfirm: (id: string) => post(`/api/bot/confirm/${id}`),
  botDismiss: (id: string) => post(`/api/bot/dismiss/${id}`),
  botSettings: (data: any) => post("/api/bot/settings", data),

  // account
  getAccountSummary: () => req<any>("/api/account/summary"),
  refreshAccount: () => post("/api/account/refresh"),
  getPositions: () => req<any>("/api/account/positions"),
  getTrades: () => req<any>("/api/account/trades"),

  // analytics
  getTopOpportunities: (date?: string) => {
    const qs = date ? `?date=${date}` : "";
    return req<any[]>(`/api/analytics/top-opportunities${qs}`);
  },
  getLeagueHeat: () => req<any[]>("/api/analytics/league-heat"),
  getOpeningDrift: () => req<any[]>("/api/analytics/opening-drift"),
  getPerformanceSummary: () => req<any>("/api/analytics/performance-summary"),

  // intelligence
  getDailyReport: () => req<any>("/api/intelligence/daily-report"),
  refreshIntel: () => post("/api/intelligence/refresh"),
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

export function heatCell(value: number, max = 100): string {
  if (max <= 0) return "heat-cell-0";
  const r = value / max;
  if (r <= 0) return "heat-cell-0";
  if (r < 0.2) return "heat-cell-1";
  if (r < 0.4) return "heat-cell-2";
  if (r < 0.6) return "heat-cell-3";
  if (r < 0.8) return "heat-cell-4";
  return "heat-cell-5";
}

export function fmtUsd(n: number | undefined | null, withSign = false): string {
  if (n == null || isNaN(n as number)) return "—";
  const v = n as number;
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}$${v.toFixed(2)}`;
}

export function fmtTime(t?: string | Date | null): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
