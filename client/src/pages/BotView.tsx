import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, heatClass } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";

export function BotView() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, refetchInterval: 10_000 });
  const { data: bot } = useQuery({ queryKey: ["bot-status"], queryFn: api.getBotStatus, refetchInterval: 5_000 });
  const { data: pending = [] } = useQuery({
    queryKey: ["pending-signals"],
    queryFn: api.getPendingSignals,
    refetchInterval: 5_000,
  });
  const { data: actions = [] } = useQuery({
    queryKey: ["bot-actions"],
    queryFn: api.getBotActions,
    refetchInterval: 5_000,
  });
  const { data: credStatus } = useQuery({
    queryKey: ["cred-status"],
    queryFn: api.getCredStatus,
    refetchInterval: 30_000,
  });

  async function patchSettings(patch: any) {
    await api.updateSettings(patch);
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["bot-status"] });
  }

  async function act(id: string, action: "confirm" | "skip" | "watch") {
    try {
      if (action === "confirm") await api.confirmSignal(id);
      else if (action === "skip") await api.skipSignal(id);
      else await api.watchSignal(id);
      qc.invalidateQueries({ queryKey: ["pending-signals"] });
      qc.invalidateQueries({ queryKey: ["bot-actions"] });
    } catch (err) {
      alert(String(err));
    }
  }

  return (
    <div style={{ padding: 18, display: "grid", gridTemplateColumns: "380px 1fr", gap: 14 }}>
      <section className="panel" style={{ padding: 16 }}>
        <h3 className="h-section">Bot Control</h3>

        {!credStatus?.hasCredentials && (
          <div className="card-panel glow-amber" style={{ padding: 10, marginBottom: 14, fontSize: 12, color: "var(--amber)" }}>
            ⚠ No Kalshi credentials configured. Bot cannot place orders. Add credentials in Settings.
          </div>
        )}

        <Row label="BOT ENABLED">
          <div
            className={`toggle ${settings?.botEnabled ? "on" : ""}`}
            onClick={() => patchSettings({ botEnabled: !settings?.botEnabled })}
          />
        </Row>
        <Row label="CONFIRM MODE">
          <div
            className={`toggle ${settings?.confirmMode ? "on" : ""}`}
            onClick={() => patchSettings({ confirmMode: !settings?.confirmMode })}
          />
        </Row>

        <Row label="MAX CONCURRENT BETS">
          <input
            className="input"
            style={{ width: 70 }}
            type="number"
            value={settings?.maxConcurrentBets ?? 3}
            onChange={(e) => patchSettings({ maxConcurrentBets: Number(e.target.value) })}
          />
        </Row>
        <Row label="BET AMOUNT $">
          <input
            className="input"
            style={{ width: 90 }}
            type="number"
            step="0.5"
            value={settings?.betAmountDollars ?? 2}
            onChange={(e) => patchSettings({ betAmountDollars: Number(e.target.value) })}
          />
        </Row>
        <Row label="BET MODE">
          <select
            className="select"
            style={{ width: 130 }}
            value={settings?.betMode ?? "no_only"}
            onChange={(e) => patchSettings({ betMode: e.target.value })}
          >
            <option value="no_only">NO only</option>
            <option value="yes_only">YES only</option>
            <option value="both">Both</option>
          </select>
        </Row>

        <div style={{ marginTop: 18, borderTop: "1px solid var(--border-dim)", paddingTop: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <KV k="ACTIVE" v={bot?.activeBets ?? 0} />
          <KV k="PENDING" v={bot?.pendingConfirmations ?? 0} color="var(--amber)" />
          <KV k="MANUAL" v={bot?.totalManualTrades ?? 0} color="var(--green)" />
          <KV k="AUTO" v={bot?.totalAutoTrades ?? 0} color="var(--cyan)" />
          <KV k="SKIPPED" v={bot?.totalSkipped ?? 0} color="var(--text-dim)" />
        </div>

        <h3 className="h-section" style={{ marginTop: 24 }}>Pending Confirmations</h3>
        {pending.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: 12 }}>None.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((s) => (
              <div key={s.id} className="card-panel glow-amber" style={{ padding: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <StrategyBadge strategy={s.strategy} />
                  <span style={{ fontSize: 12 }}>{s.matchTitle}</span>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
                  {s.sideRecommendation} • SCORE <span className={heatClass(s.compositeScore)}>{Math.round(s.compositeScore)}</span> • RISK {Math.round(s.riskScore)}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="btn btn-green"
                    disabled={!credStatus?.hasCredentials}
                    onClick={() => act(s.id, "confirm")}
                  >
                    CONFIRM
                  </button>
                  <button className="btn" onClick={() => act(s.id, "watch")}>WATCH</button>
                  <button className="btn btn-red" onClick={() => act(s.id, "skip")}>SKIP</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h3 className="h-section">Bot Actions Log</h3>
        {actions.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: 12, padding: 10 }}>No actions yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Match</th>
                <th>Auto</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="table-row">
                  <td className="mono" style={{ color: "var(--text-secondary)" }}>
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="mono" style={{ color: actionColor(a.action) }}>{a.action}</td>
                  <td>{a.matchTitle}</td>
                  <td>{a.isAuto ? "AUTO" : "—"}</td>
                  <td style={{ color: a.error ? "var(--red)" : "var(--text-secondary)", fontSize: 11 }}>
                    {a.error ?? a.result ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed var(--border-dim)" }}>
      <span className="kv-label">{label}</span>
      {children}
    </div>
  );
}

function KV({ k, v, color }: { k: string; v: number | string; color?: string }) {
  return (
    <div className="card-panel" style={{ padding: 10 }}>
      <div className="kv-label">{k}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: color ?? "var(--text-primary)" }}>{v}</div>
    </div>
  );
}

function actionColor(a: string): string {
  if (a === "confirm" || a === "auto_trade") return "var(--green)";
  if (a === "skip") return "var(--text-dim)";
  if (a === "watch_only") return "var(--cyan)";
  return "var(--text-secondary)";
}
