import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, heatClass } from "../lib/api";

export function IntelligenceView() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data } = useQuery({
    queryKey: ["intel-report"],
    queryFn: api.getIntelReport,
    refetchInterval: 60_000,
  });

  async function refresh() {
    setRefreshing(true);
    try {
      await api.refreshIntel();
      qc.invalidateQueries({ queryKey: ["intel-report"] });
    } catch (err) {
      alert(String(err));
    } finally {
      setRefreshing(false);
    }
  }

  if (!data) {
    return (
      <div style={{ padding: 18 }}>
        <div className="panel" style={{ padding: 24 }}>Loading…</div>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div style={{ padding: 18 }}>
        <div className="panel" style={{ padding: 32 }}>
          <h3 className="h-section">Perplexity Daily Intelligence</h3>
          {!data.hasKey ? (
            <div className="card-panel glow-amber" style={{ padding: 16, marginTop: 12 }}>
              <div style={{ color: "var(--amber)", fontFamily: "var(--mono)", fontSize: 12, marginBottom: 8 }}>
                ⚠ PERPLEXITY_API_KEY NOT CONFIGURED
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
                Set the environment variable <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 2, fontFamily: "var(--mono)" }}>PERPLEXITY_API_KEY</code> to enable
                Perplexity-driven daily intelligence reports. Once set, restart the server. The daily report
                will run automatically at the configured time, and you can also trigger a manual refresh.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                No report has been generated for today yet.
              </div>
              <button className="btn btn-cyan" onClick={refresh} disabled={refreshing}>
                {refreshing ? "GENERATING…" : "GENERATE NOW"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const report = data.report;

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="panel" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 className="h-section" style={{ marginBottom: 4 }}>Perplexity Daily Intelligence</h3>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
            Generated {new Date(report.generatedAt).toLocaleString()} • {report.date}
          </div>
        </div>
        <button className="btn btn-cyan" onClick={refresh} disabled={refreshing}>
          {refreshing ? "REFRESHING…" : "REFRESH"}
        </button>
      </div>

      {report.leagueThemes?.length > 0 && (
        <section className="panel" style={{ padding: 16 }}>
          <h3 className="h-section">League Themes</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.leagueThemes.map((t: any, i: number) => (
              <div key={i} className="card-panel" style={{ padding: 12, display: "grid", gridTemplateColumns: "140px 1fr", gap: 14 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--cyan)", letterSpacing: "0.10em" }}>
                  {t.league}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t.theme}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel" style={{ padding: 16 }}>
        <h3 className="h-section">Focus Events ({report.focusEvents?.length ?? 0})</h3>
        {!report.focusEvents?.length ? (
          <div style={{ color: "var(--text-dim)", padding: 12 }}>No focus events.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {report.focusEvents.map((e: any) => (
              <div key={e.eventTicker} className="card-panel" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{e.matchup}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>{e.eventTicker}</div>
                  </div>
                  <div style={{ display: "flex", gap: 14, fontFamily: "var(--mono)", fontSize: 11 }}>
                    <Pill label="ACT" v={e.actionabilityScore} heat />
                    <Pill label="NEWS" v={e.newsShockScore} />
                    <Pill label="MISPRICE" v={e.mispricingNarrativeScore} />
                    <Pill label="CONF" v={e.consensusConfidence} />
                    <Pill label="RISK" v={e.riskScore} risk />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>{e.shortReason}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  <Case title="BULL" body={e.bullCase} color="var(--green)" />
                  <Case title="BASE" body={e.baseCase} color="var(--cyan)" />
                  <Case title="BEAR" body={e.bearCase} color="var(--red)" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {report.citations?.length > 0 && (
        <section className="panel" style={{ padding: 16 }}>
          <h3 className="h-section">Citations</h3>
          <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" }}>
            {report.citations.map((c: string, i: number) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <a href={c} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>
                  {c}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Pill({ label, v, heat, risk }: { label: string; v: number; heat?: boolean; risk?: boolean }) {
  let color = "var(--text-secondary)";
  if (heat) color = v >= 7 ? "var(--green)" : v >= 4 ? "var(--amber)" : "var(--text-secondary)";
  if (risk) color = v >= 7 ? "var(--red)" : v >= 4 ? "var(--amber)" : "var(--text-secondary)";
  const cls = heat ? heatClass(v * 10) : "";
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span className="kv-label" style={{ fontSize: 9 }}>{label}</span>
      <span className={cls} style={{ color: heat ? undefined : color, fontWeight: 600 }}>{Math.round(v)}</span>
    </span>
  );
}

function Case({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <div className="card-panel" style={{ padding: 10 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", color }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>{body}</div>
    </div>
  );
}
