import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

const STRATEGIES: Array<{ key: string; label: string; desc: string }> = [
  { key: "bloat_no", label: "Bloat NO", desc: "Sell inflated favorite probabilities in live games." },
  { key: "lay_draw", label: "Lay Draw", desc: "NO on Draw in three-way soccer markets before repricing." },
  { key: "pre_goal_back", label: "Pre-Goal Back", desc: "Back underdogs in close games before goal-driven repricing (research-leaning)." },
  { key: "spread_scalp", label: "Spread Scalp", desc: "Exploit YES+NO spread deviations from 100%." },
  { key: "external_misprice", label: "External Misprice", desc: "Cross-reference with external odds (requires ODDS API key)." },
  { key: "open_drift_favorite", label: "Open Drift Favorite", desc: "Track 50/50 opens to observe favorite drift (research)." },
  { key: "perplexity_overlay", label: "Perplexity Overlay", desc: "Weight composite scores with Perplexity-derived context." },
];

export function SettingsView() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: credStatus } = useQuery({ queryKey: ["cred-status"], queryFn: api.getCredStatus });

  const [apiKeyId, setApiKeyId] = useState("");
  const [pem, setPem] = useState("");
  // credState: idle | testing | connected | error | cleared
  const [credState, setCredState] = useState<"idle" | "testing" | "connected" | "error" | "cleared">("idle");
  const [credMsg, setCredMsg] = useState<string | null>(null);
  const [credBalance, setCredBalance] = useState<number | null>(null);

  const [local, setLocal] = useState<any | null>(null);
  useEffect(() => {
    if (settings && !local) setLocal(settings);
  }, [settings, local]);

  if (!local) return <div style={{ padding: 18 }}>Loading…</div>;

  function patch(updates: any) {
    const next = { ...local, ...updates };
    setLocal(next);
    api.updateSettings(updates).then(() => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    });
  }

  function patchStrategies(key: string, value: boolean) {
    const next = { ...local.enabledStrategies, [key]: value };
    patch({ enabledStrategies: next });
  }

  async function testCreds() {
    if (!apiKeyId.trim() || !pem.trim()) {
      setCredState("error");
      setCredMsg("Both API Key ID and Private Key are required.");
      return;
    }
    setCredState("testing");
    setCredMsg(null);
    setCredBalance(null);
    try {
      const r = await api.setCredentials({ apiKeyId: apiKeyId.trim(), privateKeyPem: pem.trim() });
      if (r.valid) {
        setCredState("connected");
        setCredBalance(r.balanceDollars ?? (r.balanceCents ?? 0) / 100);
        setCredMsg(r.warning ?? null);
        qc.invalidateQueries({ queryKey: ["cred-status"] });
        qc.invalidateQueries({ queryKey: ["account-summary"] });
        qc.invalidateQueries({ queryKey: ["positions"] });
        qc.invalidateQueries({ queryKey: ["topbar-account"] });
      } else {
        setCredState("error");
        setCredMsg(r.error ?? "Validation failed");
      }
    } catch (err: any) {
      setCredState("error");
      // Parse clean error from API response
      const raw = String(err);
      const match = raw.match(/API \d+: (.*)/);
      try {
        const parsed = JSON.parse(match?.[1] ?? "");
        setCredMsg(parsed.error ?? raw);
      } catch {
        setCredMsg(match?.[1] ?? raw);
      }
    }
  }

  async function clearCreds() {
    await api.clearCredentials();
    setCredState("cleared");
    setCredMsg(null);
    setCredBalance(null);
    setApiKeyId("");
    setPem("");
    qc.invalidateQueries({ queryKey: ["cred-status"] });
    qc.invalidateQueries({ queryKey: ["account-summary"] });
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["topbar-account"] });
  }

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 }}>
      <Section title="Kalshi Credentials">
        {/* ── Live server-side connection status ── */}
        <Row label="SERVER STATUS">
          <CredStatusBadge status={credStatus} localState={credState} />
        </Row>

        {/* Memory-only persistence warning — always visible */}
        <div style={{
          margin: "10px 0 4px",
          padding: "8px 12px",
          background: "#0f0e00",
          border: "1px solid #3a3000",
          borderRadius: 3,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}>
          <span style={{ color: "var(--amber)", fontSize: 13, lineHeight: 1 }}>&#9888;</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--amber)", lineHeight: 1.5 }}>
            Credentials are stored in server memory only and will clear on restart or redeploy.
            Re-enter them after any server restart.
          </span>
        </div>

        <Row label="API KEY ID">
          <input
            className="input"
            value={apiKeyId}
            onChange={(e) => setApiKeyId(e.target.value)}
            placeholder="UUID api key id (e.g. 00000000-0000-…)"
            style={{ width: 380 }}
            autoComplete="off"
          />
        </Row>
        <Row label="PRIVATE KEY (PEM)">
          <textarea
            className="textarea"
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
            rows={7}
            style={{ width: 560, fontFamily: "var(--mono)", fontSize: 10 }}
            autoComplete="off"
            spellCheck={false}
          />
        </Row>

        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button
            className="btn btn-cyan"
            onClick={testCreds}
            disabled={credState === "testing"}
            style={{ minWidth: 120 }}
          >
            {credState === "testing" ? "TESTING…" : "TEST + SAVE"}
          </button>
          <button className="btn btn-red" onClick={clearCreds} disabled={credState === "testing"}>CLEAR</button>
        </div>

        {/* Result feedback */}
        {credState === "connected" && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              padding: "10px 14px",
              background: "#001a09",
              border: "1px solid var(--green)",
              borderRadius: 3,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--green)",
            }}>
              ✓ CONNECTED TO KALSHI
              {credBalance !== null && (
                <span style={{ marginLeft: 16, color: "var(--text-secondary)" }}>
                  BALANCE: <span style={{ color: "var(--green)" }}>${credBalance.toFixed(2)}</span>
                </span>
              )}
            </div>
            {credMsg && (
              <div style={{ fontSize: 11, color: "var(--amber)", fontFamily: "var(--mono)" }}>
                ⚠ {credMsg}
              </div>
            )}
          </div>
        )}
        {credState === "error" && credMsg && (
          <div style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "#1a0000",
            border: "1px solid var(--red)",
            borderRadius: 3,
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--red)",
          }}>
            ✗ {credMsg}
          </div>
        )}
        {credState === "cleared" && (
          <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-dim)" }}>
            Credentials cleared — account disconnected.
          </div>
        )}
      </Section>

      <Section title="Scanner">
        <Row label="SCAN ENABLED">
          <div className={`toggle ${local.scanEnabled ? "on" : ""}`} onClick={() => patch({ scanEnabled: !local.scanEnabled })} />
        </Row>
        <Row label="SCAN INTERVAL (s)">
          <input
            type="range"
            min={30}
            max={600}
            step={10}
            value={local.scanIntervalSec}
            onChange={(e) => patch({ scanIntervalSec: Number(e.target.value) })}
            style={{ width: 260 }}
          />
          <span className="mono" style={{ marginLeft: 10 }}>{local.scanIntervalSec}s</span>
        </Row>
      </Section>

      <Section title="Bot">
        <Row label="BOT ENABLED">
          <div className={`toggle ${local.botEnabled ? "on" : ""}`} onClick={() => patch({ botEnabled: !local.botEnabled })} />
        </Row>
        <Row label="CONFIRM MODE">
          <div className={`toggle ${local.confirmMode ? "on" : ""}`} onClick={() => patch({ confirmMode: !local.confirmMode })} />
        </Row>
        <Row label="MAX CONCURRENT BETS">
          <input className="input" type="number" style={{ width: 70 }} value={local.maxConcurrentBets} onChange={(e) => patch({ maxConcurrentBets: Number(e.target.value) })} />
        </Row>
        <Row label="BET AMOUNT $">
          <input className="input" type="number" step="0.5" style={{ width: 90 }} value={local.betAmountDollars} onChange={(e) => patch({ betAmountDollars: Number(e.target.value) })} />
        </Row>
        <Row label="BET MODE">
          <select className="select" style={{ width: 140 }} value={local.betMode} onChange={(e) => patch({ betMode: e.target.value })}>
            <option value="no_only">NO only</option>
            <option value="yes_only">YES only</option>
            <option value="both">Both</option>
          </select>
        </Row>
      </Section>

      <Section title="Trading Model">
        <Row label="EXECUTION MODE">
          <select className="select" style={{ width: 240 }} value={local.executionMode} onChange={(e) => patch({ executionMode: e.target.value })}>
            <option value="off">OFF — disabled</option>
            <option value="beta_shadow">BETA SHADOW — virtual trades only</option>
            <option value="manual_confirm">MANUAL CONFIRM — picks shown, you decide</option>
            <option value="live_auto">LIVE AUTO — real orders (requires promote)</option>
          </select>
        </Row>
        <Row label="VIRTUAL BANKROLL $">
          <input className="input" type="number" step="10" style={{ width: 100 }} value={local.virtualBankroll} onChange={(e) => patch({ virtualBankroll: Number(e.target.value) })} />
        </Row>
        <Row label="PER TRADE MIN $">
          <input className="input" type="number" step="0.25" style={{ width: 90 }} value={local.perTradeMin} onChange={(e) => patch({ perTradeMin: Number(e.target.value) })} />
        </Row>
        <Row label="PER TRADE MAX $">
          <input className="input" type="number" step="0.5" style={{ width: 90 }} value={local.perTradeMax} onChange={(e) => patch({ perTradeMax: Number(e.target.value) })} />
        </Row>
        <Row label="MIN NORMALIZED SCORE">
          <input type="range" min={50} max={95} step={1} value={local.minNormalizedScore} onChange={(e) => patch({ minNormalizedScore: Number(e.target.value) })} style={{ width: 200 }} />
          <span className="mono" style={{ marginLeft: 10 }}>{local.minNormalizedScore}</span>
        </Row>
        <Row label="MIN LIQUIDITY SCORE">
          <input type="range" min={0} max={1} step={0.05} value={local.minLiquidityScore} onChange={(e) => patch({ minLiquidityScore: Number(e.target.value) })} style={{ width: 200 }} />
          <span className="mono" style={{ marginLeft: 10 }}>{Number(local.minLiquidityScore).toFixed(2)}</span>
        </Row>
        <Row label="MAX RISK GATE">
          <input type="range" min={20} max={100} step={5} value={local.maxRiskScoreGate} onChange={(e) => patch({ maxRiskScoreGate: Number(e.target.value) })} style={{ width: 200 }} />
          <span className="mono" style={{ marginLeft: 10 }}>{local.maxRiskScoreGate}</span>
        </Row>
        <Row label="TOP PICKS PER CYCLE">
          <input className="input" type="number" min={1} max={10} style={{ width: 70 }} value={local.topPicksN} onChange={(e) => patch({ topPicksN: Number(e.target.value) })} />
        </Row>
      </Section>

      <Section title="Strategies">
        {STRATEGIES.map((s) => (
          <div
            key={s.key}
            style={{
              padding: "10px 0",
              borderBottom: "1px dashed var(--border-dim)",
              display: "grid",
              gridTemplateColumns: "200px 1fr 50px",
              gap: 12,
              alignItems: "center",
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-primary)", letterSpacing: "0.06em" }}>{s.label}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.desc}</span>
            <div
              className={`toggle ${local.enabledStrategies?.[s.key] ? "on" : ""}`}
              onClick={() => patchStrategies(s.key, !local.enabledStrategies?.[s.key])}
            />
          </div>
        ))}
      </Section>

      <Section title="Thresholds">
        <Slider label="MIN BLOAT SCORE" value={local.minBloatScore} onChange={(v) => patch({ minBloatScore: v })} />
        <Slider label="MIN COMPOSITE SCORE" value={local.minCompositeScore} onChange={(v) => patch({ minCompositeScore: v })} />
        <Slider label="MIN EDGE %" value={local.minEdgePercent} onChange={(v) => patch({ minEdgePercent: v })} max={50} />
      </Section>

      <Section title="Perplexity">
        <Row label="ENABLED">
          <div className={`toggle ${local.perplexityEnabled ? "on" : ""}`} onClick={() => patch({ perplexityEnabled: !local.perplexityEnabled })} />
        </Row>
        <Row label="DAILY REPORT">
          <div className={`toggle ${local.perplexityDailyReportEnabled ? "on" : ""}`} onClick={() => patch({ perplexityDailyReportEnabled: !local.perplexityDailyReportEnabled })} />
        </Row>
        <Row label="DAILY TIME (ET)">
          <input className="input" type="time" style={{ width: 130 }} value={local.perplexityDailyReportTimeEt} onChange={(e) => patch({ perplexityDailyReportTimeEt: e.target.value })} />
        </Row>
        <Row label="WEIGHT">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={local.perplexityWeight}
            onChange={(e) => patch({ perplexityWeight: Number(e.target.value) })}
            style={{ width: 240 }}
          />
          <span className="mono" style={{ marginLeft: 10 }}>{local.perplexityWeight.toFixed(2)}</span>
        </Row>
      </Section>

      <Section title="External Odds API">
        <div className="card-panel" style={{ padding: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 12 }}>
          DISABLED — no key
        </div>
        <Row label="ODDS API KEY">
          <input
            className="input"
            placeholder="(future) external odds API key"
            style={{ width: 360 }}
            value={local.oddsApiKey ?? ""}
            onChange={(e) => patch({ oddsApiKey: e.target.value })}
          />
        </Row>
      </Section>
    </div>
  );
}

// ── Credential status badge ──────────────────────────────────────────────────
type LocalCredState = "idle" | "testing" | "connected" | "error" | "cleared";

function CredStatusBadge({ status, localState }: { status: any; localState: LocalCredState }) {
  // Local state (just tested) takes priority over server poll
  if (localState === "testing") {
    return <Badge color="var(--amber)" label="TESTING…" dot />
  }
  if (localState === "connected") {
    return <Badge color="var(--green)" label="CONNECTED" dot />
  }
  if (localState === "error") {
    return <Badge color="var(--red)" label="ERROR" />
  }
  if (localState === "cleared") {
    return <Badge color="var(--text-dim)" label="NOT CONNECTED" />
  }

  // Fall back to server-side status
  if (!status) return <Badge color="var(--text-dim)" label="LOADING…" />
  if (!status.connected) return <Badge color="var(--text-dim)" label="NOT CONNECTED" />
  if (status.connected && !status.validated) return <Badge color="var(--amber)" label="SAVED — UNVERIFIED" />
  if (status.connected && status.validated) {
    const ts = status.lastValidatedAt
      ? new Date(status.lastValidatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;
    return <Badge color="var(--green)" label={`CONNECTED${ts ? ` — verified ${ts}` : ""}`} dot />
  }
  return <Badge color="var(--text-dim)" label="UNKNOWN" />
}

function Badge({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {dot && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color,
          boxShadow: `0 0 5px ${color}`,
        }} />
      )}
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color, letterSpacing: "0.08em", fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel" style={{ padding: 18 }}>
      <h3 className="h-section">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px dashed var(--border-dim)", display: "flex", alignItems: "center", gap: 12 }}>
      <span className="kv-label" style={{ width: 180 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{children}</div>
    </div>
  );
}

function Slider({ label, value, onChange, max = 100 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <Row label={label}>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 240 }} />
      <span className="mono" style={{ marginLeft: 10 }}>{value}</span>
    </Row>
  );
}
