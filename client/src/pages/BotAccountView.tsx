import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StrategyBadge } from "../components/StrategyBadge";

function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-dim)",
        borderRadius: 4,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          color: "var(--text-dim)",
          letterSpacing: "0.12em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 20,
          fontWeight: 700,
          color: color ?? "var(--text-primary)",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PnlTile({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? "var(--green)" : value < 0 ? "var(--red)" : "var(--text-dim)";
  const fmt = value >= 0 ? `+$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`;
  return <StatTile label={label} value={fmt} color={color} />;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--border-dim)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <div
        onClick={onChange}
        style={{
          width: 38,
          height: 20,
          borderRadius: 10,
          background: on ? "var(--green)" : "var(--bg-elevated)",
          border: `1px solid ${on ? "var(--green)" : "var(--border-active)"}`,
          cursor: "pointer",
          position: "relative",
          transition: "all 0.2s",
          boxShadow: on ? "0 0 8px var(--green-dim)" : "none",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: on ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: on ? "#0a0b0d" : "var(--text-dim)",
            transition: "left 0.2s",
          }}
        />
      </div>
    </div>
  );
}

export function BotAccountView() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    refetchInterval: 10_000,
  });
  const { data: bot } = useQuery({
    queryKey: ["bot-status"],
    queryFn: api.getBotStatus,
    refetchInterval: 5_000,
  });
  const { data: pending = [] } = useQuery({
    queryKey: ["pending-signals"],
    queryFn: api.getPendingSignals,
    refetchInterval: 5_000,
  });
  const { data: actions = [] } = useQuery({
    queryKey: ["bot-actions"],
    queryFn: api.getBotActions,
    refetchInterval: 8_000,
  });
  const { data: credStatus } = useQuery({
    queryKey: ["cred-status"],
    queryFn: api.getCredStatus,
    refetchInterval: 20_000,
  });
  const isConnected = credStatus?.connected ?? false;

  const { data: account, isFetching: accountFetching } = useQuery({
    queryKey: ["account-summary"],
    queryFn: api.getAccountSummary,
    refetchInterval: isConnected ? 45_000 : false,
    enabled: isConnected,
  });
  const { data: posData, isFetching: posFetching } = useQuery({
    queryKey: ["positions"],
    queryFn: api.getPositions,
    refetchInterval: isConnected ? 45_000 : false,
    enabled: isConnected,
  });

  const refreshAcct = useMutation({
    mutationFn: api.refreshAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-summary"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["cred-status"] });
    },
  });

  async function patchSettings(patch: any) {
    await api.updateSettings(patch);
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["bot-status"] });
  }

  async function actOnSignal(id: string, action: "confirm" | "skip" | "watch") {
    try {
      if (action === "confirm") await api.confirmSignal(id);
      else if (action === "skip") await api.skipSignal(id);
      else await api.watchSignal(id);
      qc.invalidateQueries({ queryKey: ["pending-signals"] });
      qc.invalidateQueries({ queryKey: ["bot-actions"] });
    } catch (err) {
      console.error(err);
    }
  }

  const hasCreds = isConnected; // use richer connected field, not just hasCredentials
  const positions: any[] = posData?.positions ?? [];

  const panel = {
    background: "var(--bg-panel)",
    border: "1px solid var(--border-dim)",
    borderRadius: 4,
    overflow: "hidden" as const,
  };

  const sectionHdr = (title: string, action?: React.ReactNode) => (
    <div
      style={{
        padding: "9px 14px",
        borderBottom: "1px solid var(--border-dim)",
        background: "var(--bg-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "var(--cyan)",
        }}
      >
        {title}
      </span>
      {action}
    </div>
  );

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={panel}>
        {sectionHdr(
          "ACCOUNT COCKPIT",
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {account?.lastUpdatedTs && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-dim)",
                  fontFamily: "var(--mono)",
                }}
              >
                {new Date(account.lastUpdatedTs).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => refreshAcct.mutate()}
              disabled={refreshAcct.isPending}
              style={{
                padding: "4px 10px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-active)",
                borderRadius: 3,
                color: "var(--cyan)",
                fontFamily: "var(--mono)",
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: "0.08em",
              }}
            >
              {refreshAcct.isPending ? "..." : "REFRESH"}
            </button>
          </div>,
        )}

        {/* ── Memory-only warning ── */}
        {hasCreds && credStatus?.persistenceMode === "memory" && (
          <div style={{
            margin: "0 14px",
            marginTop: 10,
            padding: "6px 10px",
            background: "#0f0e00",
            border: "1px solid #3a3000",
            borderRadius: 3,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--amber)",
            letterSpacing: "0.04em",
          }}>
            ⚠️ Credentials stored in server memory only — will clear on restart/redeploy. Re-enter in Settings if balance disappears.
          </div>
        )}

        {!hasCreds ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
              No account connected
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Add your Kalshi API Key ID and RSA Private Key in the{" "}
              <strong style={{ color: "var(--cyan)" }}>Settings</strong> tab, then click TEST + SAVE.
            </div>
          </div>
        ) : accountFetching && !account ? (
          <div style={{ padding: 20, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
            Loading account data…
          </div>
        ) : account?.error && !account.connected ? (
          // Hard error (no last-known data available)
          <div style={{ padding: "12px 16px" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--red)", marginBottom: 6 }}>
              ACCOUNT FETCH ERROR
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)", lineHeight: 1.5 }}>
              {account.error}
            </div>
          </div>
        ) : (
          <>
            {account?.error && (
              // Soft error — showing last known data
              <div style={{
                margin: "10px 14px 0",
                padding: "6px 10px",
                background: "#1a0000",
                border: "1px solid #3a0000",
                borderRadius: 3,
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--red)",
              }}>
                Account refresh failed — showing last known snapshot. {account.error.replace("Refresh failed — showing last known data. ", "")}
              </div>
            )}
            <div
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
                gap: 10,
              }}
            >
              <StatTile
                label="AVAILABLE BALANCE"
                value={account?.balanceDollars != null ? `$${account.balanceDollars.toFixed(2)}` : "—"}
                color="var(--green)"
              />
              <StatTile
                label="PORTFOLIO VALUE"
                value={account?.portfolioValueDollars != null ? `$${account.portfolioValueDollars.toFixed(2)}` : "—"}
              />
              <StatTile
                label="OPEN EXPOSURE"
                value={account?.openExposureDollars != null ? `$${account.openExposureDollars.toFixed(2)}` : "—"}
                color="var(--amber)"
              />
              <StatTile label="OPEN POSITIONS" value={account?.openPositionsCount ?? "—"} />
              <PnlTile label="REALIZED P&L" value={account?.realizedPnlDollars ?? 0} />
            </div>

            {/* ── Positions table ── */}
            <div style={{ padding: "0 14px 14px" }}>
              <div style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--text-dim)",
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border-dim)",
              }}>
                OPEN POSITIONS {posFetching ? "— updating…" : `— ${positions.length}`}
              </div>
              {positions.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "8px 0" }}>
                  No open positions
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--mono)" }}>
                    <thead>
                      <tr style={{ color: "var(--text-dim)", fontSize: 9, letterSpacing: "0.08em" }}>
                        <th style={{ textAlign: "left", padding: "4px 8px 6px 0", fontWeight: 600 }}>MARKET</th>
                        <th style={{ textAlign: "center", padding: "4px 8px 6px", fontWeight: 600 }}>SIDE</th>
                        <th style={{ textAlign: "right", padding: "4px 8px 6px", fontWeight: 600 }}>SHARES</th>
                        <th style={{ textAlign: "right", padding: "4px 8px 6px", fontWeight: 600 }}>EXPOSURE</th>
                        <th style={{ textAlign: "right", padding: "4px 0 6px 8px", fontWeight: 600 }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p: any, i: number) => {
                        const pnl = p.realizedPnlDollars ?? 0;
                        const pnlColor = pnl > 0 ? "var(--green)" : pnl < 0 ? "var(--red)" : "var(--text-dim)";
                        const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
                        const sideColor = p.side === "yes" ? "var(--green)" : p.side === "no" ? "var(--red)" : "var(--amber)";
                        return (
                          <tr key={p.ticker ?? i} style={{ borderTop: "1px solid var(--border-dim)" }}>
                            <td style={{ padding: "6px 8px 6px 0", color: "var(--text-primary)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.marketTitle || p.ticker}
                            </td>
                            <td style={{ textAlign: "center", padding: "6px 8px", color: sideColor, fontWeight: 700, letterSpacing: "0.06em" }}>
                              {(p.side ?? "?").toUpperCase()}
                            </td>
                            <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>
                              {p.positionShares ?? 0}
                            </td>
                            <td style={{ textAlign: "right", padding: "6px 8px", color: "var(--amber)" }}>
                              ${(p.marketExposureDollars ?? 0).toFixed(2)}
                            </td>
                            <td style={{ textAlign: "right", padding: "6px 0 6px 8px", color: pnlColor, fontWeight: 600 }}>
                              {pnlStr}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={panel}>
            {sectionHdr("BOT ENGINE")}
            <div style={{ padding: "0 14px" }}>
              {!hasCreds && (
                <div
                  style={{
                    padding: "8px 10px",
                    margin: "10px 0",
                    background: "#1a0f00",
                    border: "1px solid var(--amber)",
                    borderRadius: 3,
                    fontSize: 11,
                    color: "var(--amber)",
                  }}
                >
                  ⚠ No credentials — bot cannot place orders
                </div>
              )}
              <Toggle
                label="Bot Enabled"
                on={settings?.botEnabled ?? false}
                onChange={() => patchSettings({ botEnabled: !settings?.botEnabled })}
              />
              <Toggle
                label="Confirm Mode (require approval)"
                on={settings?.confirmMode ?? true}
                onChange={() => patchSettings({ confirmMode: !settings?.confirmMode })}
              />

              {/* ── Mode description banner ── */}
              {bot?.modeDescription && (
                <div style={{
                  margin: "8px 0 4px",
                  padding: "8px 10px",
                  borderRadius: 3,
                  fontSize: 11,
                  lineHeight: 1.5,
                  background:
                    bot.mode === "auto_trade"     ? "#00100a" :
                    bot.mode === "manual_confirm" ? "#0d0c00" :
                    bot.mode === "no_creds"       ? "#1a0000" :
                    "var(--bg-elevated)",
                  border:
                    bot.mode === "auto_trade"     ? "1px solid var(--green)" :
                    bot.mode === "manual_confirm" ? "1px solid var(--amber)" :
                    bot.mode === "no_creds"       ? "1px solid var(--red)" :
                    "1px solid var(--border-dim)",
                  color:
                    bot.mode === "auto_trade"     ? "var(--green)" :
                    bot.mode === "manual_confirm" ? "var(--amber)" :
                    bot.mode === "no_creds"       ? "var(--red)" :
                    "var(--text-dim)",
                  fontFamily: "var(--mono)",
                }}>
                  {bot.mode === "auto_trade" && "⚡ AUTO-MODE: "}
                  {bot.mode === "manual_confirm" && "✋ CONFIRM-MODE: "}
                  {bot.mode === "no_creds" && "⚠ NO CREDENTIALS: "}
                  {bot.mode === "disabled" && "⭘ DISABLED: "}
                  {bot.modeDescription}
                </div>
              )}

              <div
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-dim)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Max Concurrent Bets</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() =>
                      patchSettings({
                        maxConcurrentBets: Math.max(1, (settings?.maxConcurrentBets ?? 3) - 1),
                      })
                    }
                    style={{
                      width: 22,
                      height: 22,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-active)",
                      borderRadius: 2,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    −
                  </button>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 14,
                      color: "var(--cyan)",
                      minWidth: 24,
                      textAlign: "center",
                    }}
                  >
                    {settings?.maxConcurrentBets ?? 3}
                  </span>
                  <button
                    onClick={() =>
                      patchSettings({
                        maxConcurrentBets: Math.min(20, (settings?.maxConcurrentBets ?? 3) + 1),
                      })
                    }
                    style={{
                      width: 22,
                      height: 22,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-active)",
                      borderRadius: 2,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div
                style={{
                  padding: "10px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Bet Amount</span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                >
                  ${settings?.betAmountDollars?.toFixed(2) ?? "2.00"}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                background: "var(--bg-card)",
                borderTop: "1px solid var(--border-dim)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}
            >
              {(
                [
                  // activeBets derived from real account positions
                  ["ACTIVE BETS", account?.connected ? (account?.openPositionsCount ?? bot?.activeBets ?? 0) : (bot?.activeBets ?? 0), "var(--cyan)"],
                  ["PENDING", bot?.pendingConfirmations ?? 0, "var(--amber)"],
                  ["SKIPPED", bot?.totalSkipped ?? 0, "var(--text-dim)"],
                ] as Array<[string, number, string]>
              ).map(([label, val, color]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 18,
                      fontWeight: 700,
                      color,
                    }}
                  >
                    {val}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 8,
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-trade stats — only shown in auto-mode */}
          {bot?.mode === "auto_trade" && (
            <div style={{
              ...panel,
              padding: "10px 14px",
              display: "flex",
              gap: 20,
              alignItems: "center",
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em" }}>AUTO TRADES:</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--green)" }}>{bot?.totalAutoTrades ?? 0}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginLeft: 12 }}>MANUAL:</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--cyan)" }}>{bot?.totalManualTrades ?? 0}</span>
            </div>
          )}

          <div style={panel}>
            {sectionHdr(`PENDING CONFIRMS (${pending.length})`)}
            {/* Show note when in auto-mode that pending confirms won't accumulate */}
            {bot?.mode === "auto_trade" && (
              <div style={{
                margin: "8px 10px 0",
                padding: "6px 10px",
                background: "#00100a",
                border: "1px solid var(--green)",
                borderRadius: 3,
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--green)",
              }}>
                Auto-mode is ON — eligible signals are traded automatically and will appear in Recent Bot Actions below, not here.
              </div>
            )}
            {pending.length === 0 ? (
              <div
                style={{
                  padding: "20px 14px",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  textAlign: "center",
                }}
              >
                {bot?.mode === "auto_trade" ? "No signals awaiting manual confirmation." : "No pending confirmations"}
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {pending.map((sig: any) => (
                  <div
                    key={sig.id}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border-dim)",
                      background: "#1a1500",
                      borderLeft: "3px solid var(--amber)",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 4 }}>
                      {sig.matchTitle}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}
                    >
                      <StrategyBadge strategy={sig.strategy} />
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {sig.sideRecommendation}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          color: "var(--amber)",
                          marginLeft: "auto",
                        }}
                      >
                        Score: {Math.round(sig.compositeScore)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => actOnSignal(sig.id, "confirm")}
                        disabled={!hasCreds}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          background: hasCreds ? "var(--green-dim)" : "var(--bg-elevated)",
                          border: `1px solid ${hasCreds ? "var(--green)" : "var(--border-dim)"}`,
                          borderRadius: 3,
                          color: hasCreds ? "var(--green)" : "var(--text-dim)",
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          cursor: hasCreds ? "pointer" : "not-allowed",
                        }}
                      >
                        CONFIRM
                      </button>
                      <button
                        onClick={() => actOnSignal(sig.id, "watch")}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-active)",
                          borderRadius: 3,
                          color: "var(--cyan)",
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          cursor: "pointer",
                        }}
                      >
                        WATCH
                      </button>
                      <button
                        onClick={() => actOnSignal(sig.id, "skip")}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-dim)",
                          borderRadius: 3,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          cursor: "pointer",
                        }}
                      >
                        SKIP
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={panel}>
            {sectionHdr("RECENT BOT ACTIONS")}
            {actions.length === 0 ? (
              <div
                style={{
                  padding: "20px 14px",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  textAlign: "center",
                }}
              >
                No bot actions recorded yet
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {actions.slice(0, 30).map((a: any) => {
                      const actionColor =
                        a.action === "confirm" || a.action === "auto_trade"
                          ? "var(--green)"
                          : a.action === "skip"
                            ? "var(--text-dim)"
                            : "var(--cyan)";
                      return (
                        <tr
                          key={a.id}
                          style={{ borderBottom: "1px solid var(--border-dim)" }}
                        >
                          <td style={{ padding: "7px 12px", width: 80 }}>
                            <span
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: 8,
                                color: "var(--text-dim)",
                              }}
                            >
                              {new Date(a.timestamp).toLocaleTimeString()}
                            </span>
                          </td>
                          <td style={{ padding: "7px 12px" }}>
                            <span
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: actionColor,
                              }}
                            >
                              {a.action.toUpperCase()}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "7px 12px",
                              fontSize: 11,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {a.matchTitle}
                          </td>
                          <td
                            style={{
                              padding: "7px 12px",
                              fontSize: 10,
                              color: a.isAuto ? "var(--violet)" : "var(--text-dim)",
                              fontFamily: "var(--mono)",
                            }}
                          >
                            {a.isAuto ? "AUTO" : "MANUAL"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
