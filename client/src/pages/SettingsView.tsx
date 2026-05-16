import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [credResult, setCredResult] = useState<string | null>(null);
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
    setCredResult("Testing…");
    setCredBalance(null);
    try {
      const r = await api.setCredentials({ apiKeyId, privateKeyPem: pem });
      if (r.valid) {
        setCredResult("✓ Credentials valid");
        setCredBalance(r.balance);
        qc.invalidateQueries({ queryKey: ["cred-status"] });
      } else {
        setCredResult("✗ Invalid: " + (r.error ?? "unknown"));
      }
    } catch (err) {
      setCredResult("✗ Error: " + String(err));
    }
  }

  async function clearCreds() {
    await api.clearCredentials();
    setCredResult("Cleared");
    setApiKeyId("");
    setPem("");
    qc.invalidateQueries({ queryKey: ["cred-status"] });
  }

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 }}>
      <Section title="Kalshi Credentials">
        <Row label="STATUS">
          <span style={{ color: credStatus?.hasCredentials ? "var(--green)" : "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 12 }}>
            {credStatus?.hasCredentials ? "CONFIGURED" : "NOT CONFIGURED"}
          </span>
        </Row>
        <Row label="API KEY ID">
          <input className="input" value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)} placeholder="UUID api key id" style={{ width: 360 }} />
        </Row>
        <Row label="PRIVATE KEY (PEM)">
          <textarea
            className="textarea"
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY-----..."
            rows={6}
            style={{ width: 560 }}
          />
        </Row>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-cyan" onClick={testCreds}>TEST + SAVE</button>
          <button className="btn btn-red" onClick={clearCreds}>CLEAR</button>
        </div>
        {credResult && (
          <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 12, color: credResult.startsWith("✓") ? "var(--green)" : "var(--red)" }}>
            {credResult}
            {credBalance !== null && <span style={{ marginLeft: 12, color: "var(--text-secondary)" }}>BALANCE: ${(credBalance / 100).toFixed(2)}</span>}
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
