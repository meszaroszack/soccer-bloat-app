import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function IntelligenceView() {
  const qc = useQueryClient();
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["intel-report"],
    queryFn: api.getIntelReport,
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: api.refreshIntel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-report"] }),
  });

  const hasKey = reportData?.hasKey !== false;
  const hasReport = reportData?.available && reportData?.report;

  const panelStyle = {
    background: "var(--bg-panel)",
    border: "1px solid var(--border-dim)",
    borderRadius: 4,
    overflow: "hidden" as const,
    marginBottom: 16,
  };
  const headerStyle = {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border-dim)",
    background: "var(--bg-card)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between" as const,
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--cyan)",
              }}
            >
              PERPLEXITY DAILY INTELLIGENCE
            </span>
            {hasReport && (
              <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 12 }}>
                Generated {new Date(reportData.report.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {hasKey && (
            <button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              style={{
                padding: "5px 12px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-active)",
                borderRadius: 3,
                color: "var(--cyan)",
                fontFamily: "var(--mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {refresh.isPending ? "REFRESHING..." : "MANUAL REFRESH"}
            </button>
          )}
        </div>

        {!hasKey ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div
              style={{
                display: "inline-block",
                padding: "20px 28px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-active)",
                borderRadius: 4,
                maxWidth: 480,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--text-dim)",
                  letterSpacing: "0.12em",
                  marginBottom: 10,
                }}
              >
                PERPLEXITY API KEY NOT CONFIGURED
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                  lineHeight: 1.6,
                }}
              >
                Daily context report available when Perplexity API key is connected. Fires once at
                11:00 AM ET. Results cached 24 hours.
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  background: "var(--bg-base)",
                  padding: "8px 12px",
                  borderRadius: 3,
                  textAlign: "left",
                }}
              >
                Set PERPLEXITY_API_KEY in your environment or .env file
              </div>
            </div>
          </div>
        ) : !hasReport ? (
          <div style={{ padding: 24 }}>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-dim)",
                marginBottom: 12,
              }}
            >
              {isLoading ? "LOADING REPORT..." : "NO REPORT FOR TODAY YET — FIRES AT 11:00 AM ET"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {["TOP FOCUS EVENT", "LEAGUE THEMES", "ACTIONABILITY SCORES"].map((label) => (
                <div
                  key={label}
                  style={{
                    padding: 16,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: 4,
                    opacity: 0.4,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      color: "var(--text-dim)",
                      marginBottom: 8,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: "var(--bg-elevated)",
                      borderRadius: 2,
                      marginBottom: 6,
                    }}
                  />
                  <div
                    style={{
                      height: 8,
                      width: "70%",
                      background: "var(--bg-elevated)",
                      borderRadius: 2,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            {reportData.report.leagueThemes?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: "var(--text-dim)",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}
                >
                  LEAGUE THEMES TODAY
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {reportData.report.leagueThemes.map((t: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 12px",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-active)",
                        borderRadius: 3,
                      }}
                    >
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--cyan)" }}>
                        {t.league}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 8 }}>
                        {t.theme}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {reportData.report.focusEvents?.map((e: any) => (
                <div
                  key={e.eventTicker}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: 4,
                    padding: 14,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                        {e.matchup || e.eventTicker}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                          marginTop: 2,
                        }}
                      >
                        {e.shortReason}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, fontFamily: "var(--mono)", fontSize: 11 }}>
                      <span style={{ color: "var(--green)" }}>{e.actionabilityScore}/10</span>
                      <span style={{ color: "var(--amber)" }}>R:{e.riskScore}</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {(
                      [
                        ["BULL", e.bullCase, "var(--green)"],
                        ["BASE", e.baseCase, "var(--cyan)"],
                        ["BEAR", e.bearCase, "var(--red)"],
                      ] as Array<[string, string, string]>
                    ).map(([label, text, color]) => (
                      <div
                        key={label}
                        style={{
                          padding: "8px 10px",
                          background: "var(--bg-elevated)",
                          borderRadius: 3,
                          borderTop: `2px solid ${color}`,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 9,
                            color,
                            marginBottom: 4,
                          }}
                        >
                          {label}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
