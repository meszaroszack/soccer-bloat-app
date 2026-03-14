import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

// ─── Types ─────────────────────────────────────────────────────────────────────────

type MarketTier = "bet" | "watch" | "early" | "cold";

interface ScoredMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  favoriteProb: number | null;
  drawPrice: number | null;
  yesPrice: number | null;
  minuteEstimate: number | null;
  bloatScore: number;
  tier: MarketTier;
}

interface Signal {
  id: string;
  matchTitle: string;
  ticker: string;
  marketTitle: string;
  favoriteProb: number;
  drawPrice?: number;
  yesPrice?: number;
  minuteEstimate?: number;
  bloatScore: number;
  status: string;
  betSide?: string;
  betAmount?: number;
  orderIds?: string;
  outcome?: string;
  profit?: number;
  isAuto: boolean;
  errorMsg?: string;
  detectedAt: string;
  tradedAt?: string;
}

interface Stats {
  totalSignals: number;
  activeSignals: number;
  autoTraded: number;
  manuallyTraded: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalProfit: number;
  totalBet: number;
  roi: number | null;
}

interface ScanStatus {
  scanEnabled: boolean;
  botEnabled: boolean;
  credentialsLoaded: boolean;
  scanning: boolean;
  lastScanTime: string | null;
  lastScanCount: number;
  scanInterval: number;
}

interface Settings {
  minMinute: number;
  maxFavoriteProb: number;
  minFavoriteProb: number;
  scanEnabled: boolean;
  scanIntervalSec: number;
  botEnabled: boolean;
  betMode: string;
  betAmountDollars: number;
  minBloatScore: number;
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<MarketTier, {
  label: string;
  dot: string;
  border: string;
  bg: string;
  badge: string;
  badgeText: string;
}> = {
  bet: {
    label: "GO — BET NOW",
    dot: "bg-green-400 animate-pulse",
    border: "border-green-500/50",
    bg: "bg-green-500/8",
    badge: "bg-green-500/20 text-green-300 border-green-500/30",
    badgeText: "🟢 BET",
  },
  watch: {
    label: "WARMING UP",
    dot: "bg-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/5",
    badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    badgeText: "🟡 WATCH",
  },
  early: {
    label: "TOO EARLY",
    dot: "bg-blue-400/60",
    border: "border-blue-500/20",
    bg: "bg-blue-500/3",
    badge: "bg-blue-500/10 text-blue-400/80 border-blue-500/20",
    badgeText: "🔵 EARLY",
  },
  cold: {
    label: "NO BLOAT",
    dot: "bg-red-500/60",
    border: "border-red-500/20",
    bg: "bg-red-500/3",
    badge: "bg-red-500/10 text-red-400/70 border-red-500/20",
    badgeText: "🔴 COLD",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────────────

function bloatLabel(score: number): { label: string; color: string; bar: string } {
  if (score >= 70) return { label: "STRONG", color: "bg-red-500 text-white", bar: "bg-red-500" };
  if (score >= 45) return { label: "MODERATE", color: "bg-orange-400 text-white", bar: "bg-orange-400" };
  return { label: "WEAK", color: "bg-yellow-500 text-black", bar: "bg-yellow-400" };
}

const fmtProb = (p: number) => `${Math.round(p * 100)}%`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtPct = (n: number | null) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtMoney = (n: number) => n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;

// ─── Credentials Panel ──────────────────────────────────────────────────────────────────

function CredentialsPanel({ onConnected }: { onConnected: () => void }) {
  const { toast } = useToast();
  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const connect = useMutation({
    mutationFn: () => apiRequest("POST", "/api/credentials", {
      apiKeyId: apiKeyId.trim(),
      privateKeyPem: privateKey.trim(),
    }),
    onSuccess: (data: { balance: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      toast({
        title: "Connected to Kalshi",
        description: `Balance: $${data.balance.toFixed(2)}`,
      });
      onConnected();
    },
    onError: (e: Error) => {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          Connect Kalshi API
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Go to <span className="text-primary font-medium">kalshi.com → Account → API Keys</span> to generate your key.
          Keys are stored in memory only — never written to disk.
        </p>

        <div className="space-y-1">
          <Label className="text-xs">API Key ID</Label>
          <Input
            placeholder="a952bcbe-ec3b-4b5b-b8f9-11dae589608c"
            value={apiKeyId}
            onChange={e => setApiKeyId(e.target.value)}
            className="h-8 text-xs font-mono"
            data-testid="input-api-key-id"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Private Key (.pem)</Label>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey(v => !v)}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <Textarea
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEowIBAAK...&#10;-----END RSA PRIVATE KEY-----"
            value={privateKey}
            onChange={e => setPrivateKey(e.target.value)}
            className={`text-xs font-mono h-28 resize-none ${!showKey ? "text-security-disc" : ""}`}
            style={!showKey ? { WebkitTextSecurity: "disc" } as React.CSSProperties : {}}
            data-testid="input-private-key"
          />
        </div>

        <Button
          className="w-full"
          disabled={!apiKeyId || !privateKey || connect.isPending}
          onClick={() => connect.mutate()}
          data-testid="button-connect"
        >
          {connect.isPending ? "Verifying..." : "Connect & Verify"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Bot Control Panel ────────────────────────────────────────────────────────────────

function BotPanel() {
  const { toast } = useToast();
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: status } = useQuery<ScanStatus>({ queryKey: ["/api/status"], refetchInterval: 5000 });
  const { data: balanceData } = useQuery<{ balance: number }>(
    { queryKey: ["/api/balance"], refetchInterval: 30000, retry: false }
  );

  const [local, setLocal] = useState<Partial<Settings>>({});
  const merged = { ...settings, ...local } as Settings;

  const saveSettings = useMutation({
    mutationFn: (body: Partial<Settings>) => apiRequest("PATCH", "/api/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      setLocal({});
      toast({ title: "Settings saved" });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/credentials"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      // Also turn off bot
      saveSettings.mutate({ botEnabled: false });
      toast({ title: "Disconnected from Kalshi" });
    },
  });

  if (!settings) return null;

  const isConnected = status?.credentialsLoaded ?? false;

  return (
    <div className="space-y-4">

      {/* Connection status */}
      <Card className={`border rounded-xl ${isConnected ? "border-green-500/30 bg-green-500/5" : "border-red-500/20"}`}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-500"}`} />
            <div>
              <p className="text-sm font-medium">{isConnected ? "Connected to Kalshi" : "Not Connected"}</p>
              {isConnected && balanceData && (
                <p className="text-xs text-muted-foreground">Balance: <span className="text-green-400 font-mono font-bold">${balanceData.balance.toFixed(2)}</span></p>
              )}
            </div>
          </div>
          {isConnected && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => disconnect.mutate()} data-testid="button-disconnect">
              Disconnect
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bot master switch */}
      <Card className="border rounded-xl">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold">Bot Auto-Trade</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {merged.botEnabled ? "Bot will auto-place bets on qualifying signals" : "Bot is OFF — signals are flagged for manual review"}
              </p>
            </div>
            <Switch
              checked={merged.botEnabled ?? false}
              disabled={!isConnected}
              onCheckedChange={v => {
                setLocal(p => ({ ...p, botEnabled: v }));
                saveSettings.mutate({ botEnabled: v });
              }}
              data-testid="toggle-bot"
            />
          </div>

          {!isConnected && (
            <p className="text-xs text-orange-400">Connect your API key above to enable auto-trading.</p>
          )}
        </CardContent>
      </Card>

      {/* Bet mode */}
      <Card className="border rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bet Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">What to bet on each signal</Label>
            <Select
              value={merged.betMode ?? "no_only"}
              onValueChange={v => setLocal(p => ({ ...p, betMode: v }))}
            >
              <SelectTrigger className="h-9" data-testid="select-bet-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_only">
                  <div>
                    <p className="font-medium">NO only — Draw / Upset</p>
                    <p className="text-xs text-muted-foreground">Bet the draw or upset wins. Classic bloat play.</p>
                  </div>
                </SelectItem>
                <SelectItem value="yes_only">
                  <div>
                    <p className="font-medium">YES only — Underdog wins</p>
                    <p className="text-xs text-muted-foreground">Bet the underdog gets a late winner. Higher payout, lower hit rate.</p>
                  </div>
                </SelectItem>
                <SelectItem value="both">
                  <div>
                    <p className="font-medium">Both — Hedge</p>
                    <p className="text-xs text-muted-foreground">Split bet between NO and YES. Covers draw or any non-favorite outcome.</p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bet amount */}
          <div className="space-y-1">
            <Label className="text-xs">Bet Amount ($)</Label>
            <Input
              type="number"
              step="0.50"
              min="0.50"
              value={merged.betAmountDollars ?? 2}
              onChange={e => setLocal(p => ({ ...p, betAmountDollars: parseFloat(e.target.value) }))}
              className="h-8 w-28 text-sm"
              data-testid="input-bet-amount"
            />
            <p className="text-xs text-muted-foreground">
              {merged.betMode === "both" ? "Split equally between NO and YES" : "Total per trade"}
            </p>
          </div>

          {/* Min bloat score */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Min Bloat Score to Auto-Trade</Label>
              <span className="text-xs font-mono text-primary">{merged.minBloatScore ?? 40}</span>
            </div>
            <Slider
              min={20} max={90} step={5}
              value={[merged.minBloatScore ?? 40]}
              onValueChange={([v]) => setLocal(p => ({ ...p, minBloatScore: v }))}
              data-testid="slider-min-score"
            />
            <p className="text-xs text-muted-foreground">Only auto-trade signals above this score. 40+ recommended.</p>
          </div>
        </CardContent>
      </Card>

      {/* Detection thresholds */}
      <Card className="border rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detection Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Min Game Minute</Label>
              <span className="text-xs font-mono text-primary">{merged.minMinute ?? 65}'</span>
            </div>
            <Slider min={45} max={85} step={5}
              value={[merged.minMinute ?? 65]}
              onValueChange={([v]) => setLocal(p => ({ ...p, minMinute: v }))}
              data-testid="slider-min-minute"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Favorite Prob Range</Label>
              <span className="text-xs font-mono text-primary">
                {Math.round((merged.minFavoriteProb ?? 0.60) * 100)}% – {Math.round((merged.maxFavoriteProb ?? 0.78) * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Min</Label>
                <Slider min={0.50} max={0.70} step={0.05}
                  value={[merged.minFavoriteProb ?? 0.60]}
                  onValueChange={([v]) => setLocal(p => ({ ...p, minFavoriteProb: v }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max</Label>
                <Slider min={0.65} max={0.85} step={0.05}
                  value={[merged.maxFavoriteProb ?? 0.78]}
                  onValueChange={([v]) => setLocal(p => ({ ...p, maxFavoriteProb: v }))}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Auto-Scan</Label>
              <p className="text-xs text-muted-foreground">{merged.scanIntervalSec ?? 60}s interval</p>
            </div>
            <Switch
              checked={merged.scanEnabled ?? true}
              onCheckedChange={v => setLocal(p => ({ ...p, scanEnabled: v }))}
              data-testid="toggle-scan"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        disabled={Object.keys(local).length === 0 || saveSettings.isPending}
        onClick={() => saveSettings.mutate(local)}
        data-testid="button-save-settings"
      >
        Save Settings
      </Button>
    </div>
  );
}

// ─── Signal Card ────────────────────────────────────────────────────────────────────────

function SignalCard({ signal, settings }: { signal: Signal; settings: Settings }) {
  const { toast } = useToast();
  const [betAmt, setBetAmt] = useState(settings.betAmountDollars.toFixed(2));
  const [betMode, setBetMode] = useState(settings.betMode);
  const [showOutcome, setShowOutcome] = useState(false);

  const { data: status } = useQuery<ScanStatus>({ queryKey: ["/api/status"] });
  const isConnected = status?.credentialsLoaded ?? false;

  const tradeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/signals/${signal.id}/trade`, {
      betMode,
      betAmount: parseFloat(betAmt),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
      toast({ title: "Trade placed on Kalshi ✓" });
      setShowOutcome(true);
    },
    onError: (e: Error) => {
      toast({ title: "Trade failed", description: e.message, variant: "destructive" });
    },
  });

  const logOutcome = useMutation({
    mutationFn: (body: { outcome: string; profit: number }) =>
      apiRequest("PATCH", `/api/signals/${signal.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const skipSignal = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/signals/${signal.id}`, { status: "skipped" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/signals"] }),
  });

  const { label, color, bar } = bloatLabel(signal.bloatScore);
  const noOdds = signal.drawPrice ? `${signal.drawPrice}¢` : "—";
  const yesOdds = signal.yesPrice ? `${signal.yesPrice}¢` : "—";
  const budget = parseFloat(betAmt) || 0;

  function calcPayout(price: number, amount: number) {
    const contracts = Math.floor(amount / (price / 100));
    return (contracts * 1.0).toFixed(2);
  }

  const isActive = signal.status === "active";
  const isTraded = ["auto_traded", "manually_traded"].includes(signal.status);
  const isError = signal.status === "error";

  return (
    <Card className="border rounded-xl overflow-hidden" data-testid={`signal-card-${signal.id}`}>
      <div className={`h-1.5 ${bar}`} style={{ width: `${signal.bloatScore}%` }} />
      <CardContent className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate" data-testid="signal-title">{signal.marketTitle}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">{fmtTime(signal.detectedAt)}</p>
              {signal.isAuto && (
                <Badge className="h-4 px-1.5 text-[10px] bg-primary/20 text-primary border-0">AUTO</Badge>
              )}
            </div>
          </div>
          <Badge className={`${color} text-xs shrink-0`}>{label} {signal.bloatScore}</Badge>
        </div>

        <Separator />

        {/* Odds grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Fav Win</p>
            <p className="font-bold text-sm text-orange-400">{fmtProb(signal.favoriteProb)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">NO price</p>
            <p className="font-bold text-sm text-green-400">{noOdds}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">YES price</p>
            <p className="font-bold text-sm text-blue-400">{yesOdds}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Minute</p>
            <p className="font-bold text-sm text-purple-400">
              {signal.minuteEstimate ? `${signal.minuteEstimate}'` : "Live"}
            </p>
          </div>
        </div>

        {/* Payout preview */}
        {budget > 0 && (signal.drawPrice || signal.yesPrice) && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 space-y-0.5">
            {(betMode === "no_only" || betMode === "both") && signal.drawPrice && (
              <p>NO ${betMode === "both" ? (budget / 2).toFixed(2) : betAmt} → payout <span className="text-green-400 font-medium">${calcPayout(signal.drawPrice, betMode === "both" ? budget / 2 : budget)}</span></p>
            )}
            {(betMode === "yes_only" || betMode === "both") && signal.yesPrice && (
              <p>YES ${betMode === "both" ? (budget / 2).toFixed(2) : betAmt} → payout <span className="text-blue-400 font-medium">${calcPayout(signal.yesPrice, betMode === "both" ? budget / 2 : budget)}</span></p>
            )}
          </div>
        )}

        {/* Active signal — trade controls */}
        {isActive && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bet ($)</Label>
                <Input
                  type="number" step="0.50" min="0.50"
                  value={betAmt}
                  onChange={e => setBetAmt(e.target.value)}
                  className="h-7 text-sm"
                  data-testid="input-signal-bet"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mode</Label>
                <Select value={betMode} onValueChange={setBetMode}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-signal-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_only">NO — Draw/Upset</SelectItem>
                    <SelectItem value="yes_only">YES — Underdog</SelectItem>
                    <SelectItem value="both">Both (Hedge)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              {isConnected ? (
                <Button
                  size="sm"
                  className="flex-1 h-8 bg-green-600 hover:bg-green-700 text-white text-xs"
                  onClick={() => tradeMutation.mutate()}
                  disabled={tradeMutation.isPending}
                  data-testid="button-place-bet"
                >
                  {tradeMutation.isPending ? "Placing..." : "Place Bet on Kalshi →"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs opacity-50" disabled>
                  Connect API to trade
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => skipSignal.mutate()}
                data-testid="button-skip">
                Skip
              </Button>
            </div>
          </div>
        )}

        {/* Traded — outcome logging */}
        {isTraded && !signal.outcome && (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              {signal.isAuto ? "Auto-traded" : "Manually traded"} · {signal.betSide?.toUpperCase()} · ${signal.betAmount?.toFixed(2)}
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                onClick={() => logOutcome.mutate({
                  outcome: "won",
                  profit: signal.drawPrice && signal.betSide === "no"
                    ? (Math.floor((signal.betAmount ?? 0) / (signal.drawPrice / 100)) - (signal.betAmount ?? 0))
                    : (signal.betAmount ?? 0)
                })}
                data-testid="button-won">Won ✓</Button>
              <Button size="sm" className="flex-1 h-7 bg-red-600 hover:bg-red-700 text-white text-xs"
                onClick={() => logOutcome.mutate({ outcome: "lost", profit: -(signal.betAmount ?? 0) })}
                data-testid="button-lost">Lost ✗</Button>
            </div>
          </div>
        )}

        {/* Final outcome */}
        {isTraded && signal.outcome && (
          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            signal.outcome === "won" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            <span>{signal.isAuto ? "Auto" : "Manual"} · {signal.betSide?.toUpperCase()} · {signal.outcome}</span>
            <span className="font-bold">{fmtMoney(signal.profit ?? 0)}</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="bg-red-500/10 text-red-400 rounded-lg px-3 py-2 text-xs">
            <p className="font-medium">Trade error</p>
            <p className="text-red-300 mt-0.5">{signal.errorMsg}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────────────

function StatsBar() {
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: status } = useQuery<ScanStatus>({ queryKey: ["/api/status"], refetchInterval: 5000 });

  const botActive = status?.botEnabled && status?.credentialsLoaded;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      {[
        { label: "Active", value: stats?.activeSignals ?? 0, sub: `${stats?.totalSignals ?? 0} total`, color: "text-blue-400", testId: "stat-active" },
        { label: "Win Rate", value: fmtPct(stats?.winRate ?? null), sub: `${stats?.wins ?? 0}W ${stats?.losses ?? 0}L`, color: "text-green-400", testId: "stat-wins" },
        { label: "P&L", value: stats ? fmtMoney(stats.totalProfit) : "—", sub: `${(stats?.autoTraded ?? 0) + (stats?.manuallyTraded ?? 0)} traded`, color: (stats?.totalProfit ?? 0) >= 0 ? "text-green-400" : "text-red-400", testId: "stat-pnl" },
        { label: "Bot", value: botActive ? "LIVE" : status?.scanEnabled ? "Scanning" : "Off", sub: status?.lastScanTime ? `Scanned ${fmtTime(status.lastScanTime)}` : "Never scanned", color: botActive ? "text-green-400" : "text-muted-foreground", testId: "stat-bot" },
      ].map(({ label, value, sub, color, testId }) => (
        <Card key={label} className="border rounded-xl" data-testid={testId}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Trade History ───────────────────────────────────────────────────────────────────────

function TradeHistory({ signals }: { signals: Signal[] }) {
  const traded = signals.filter(s => ["auto_traded", "manually_traded"].includes(s.status));
  if (!traded.length) return (
    <div className="text-center py-12 text-sm text-muted-foreground">
      No trades yet. Trades appear here once placed.
    </div>
  );
  return (
    <div className="space-y-2">
      {traded.map(s => (
        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border text-sm" data-testid={`history-${s.id}`}>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{s.marketTitle}</p>
            <p className="text-xs text-muted-foreground">
              {s.isAuto ? "Auto" : "Manual"} · {s.betSide?.toUpperCase()} · ${s.betAmount?.toFixed(2)} · Bloat {s.bloatScore}
            </p>
          </div>
          <div className="text-right ml-3">
            {s.outcome ? (
              <p className={`font-bold ${s.outcome === "won" ? "text-green-400" : "text-red-400"}`}>{fmtMoney(s.profit ?? 0)}</p>
            ) : (
              <Badge variant="outline" className="text-xs">Pending</Badge>
            )}
            <p className="text-xs text-muted-foreground">{fmtTime(s.detectedAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Live Scoreboard ──────────────────────────────────────────────────────────────────────

function ScoreboardRow({ market }: { market: ScoredMarket }) {
  const cfg = TIER_CONFIG[market.tier];
  const favPct = market.favoriteProb != null ? `${Math.round(market.favoriteProb * 100)}%` : "—";
  const noPr = market.drawPrice != null ? `${market.drawPrice}¢` : "—";
  const min = market.minuteEstimate != null ? `${market.minuteEstimate}'` : "—";
  const displayTitle = market.title.replace(/^(Will |Who wins |Match winner:\s*)/i, "");

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${cfg.border} ${cfg.bg} transition-all`}
      data-testid={`scoreboard-row-${market.ticker}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayTitle}</p>
        <p className="text-xs text-muted-foreground">{market.ticker}</p>
      </div>
      <div className="flex items-center gap-4 text-xs shrink-0">
        <div className="text-center hidden sm:block">
          <p className="text-muted-foreground">Fav</p>
          <p className="font-mono font-semibold text-orange-400">{favPct}</p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-muted-foreground">NO</p>
          <p className="font-mono font-semibold text-green-400">{noPr}</p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-muted-foreground">Min</p>
          <p className="font-mono font-semibold text-purple-400">{min}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Score</p>
          <p className="font-mono font-bold">{market.bloatScore}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.badge}`}>
          {cfg.badgeText}
        </span>
      </div>
    </div>
  );
}

function LiveScoreboard() {
  const [showCold, setShowCold] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ markets: ScoredMarket[]; fetchedAt: string }>({
    queryKey: ["/api/markets"],
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const markets = data?.markets ?? [];
  const hotMarkets = markets.filter(m => m.tier !== "cold");
  const coldMarkets = markets.filter(m => m.tier === "cold");
  const betCount = markets.filter(m => m.tier === "bet").length;
  const watchCount = markets.filter(m => m.tier === "watch").length;

  const lastFetch = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <Card className="border rounded-xl mb-5" data-testid="live-scoreboard">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live Market Scoreboard
          </CardTitle>
          <div className="flex items-center gap-2">
            {betCount > 0 && (
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                {betCount} BET
              </Badge>
            )}
            {watchCount > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">
                {watchCount} WATCH
              </Badge>
            )}
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => refetch()}
              data-testid="button-refresh-scoreboard"
            >
              Refresh
            </button>
          </div>
        </div>
        {lastFetch && (
          <p className="text-xs text-muted-foreground">Updated {lastFetch} · auto-refreshes every 30s</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Loading Kalshi soccer markets...
          </div>
        )}
        {error && (
          <div className="text-center py-4 text-xs text-red-400">
            Failed to load markets. Check connection.
          </div>
        )}
        {!isLoading && !error && markets.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No live soccer markets found on Kalshi right now.
          </div>
        )}
        {hotMarkets.map(m => (
          <ScoreboardRow key={m.ticker} market={m} />
        ))}
        {coldMarkets.length > 0 && (
          <div>
            <button
              className="w-full text-xs text-muted-foreground py-1.5 hover:text-foreground flex items-center justify-center gap-1"
              onClick={() => setShowCold(v => !v)}
              data-testid="button-toggle-cold"
            >
              {showCold ? "▲ Hide" : "▼ Show"} {coldMarkets.length} cold markets (no bloat)
            </button>
            {showCold && coldMarkets.map(m => (
              <ScoreboardRow key={m.ticker} market={m} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: signals } = useQuery<Signal[]>({ queryKey: ["/api/signals"], refetchInterval: 10000 });
  const { data: status } = useQuery<ScanStatus>({ queryKey: ["/api/status"], refetchInterval: 5000 });
  const [showCreds, setShowCreds] = useState(false);
  const { toast } = useToast();

  const isConnected = status?.credentialsLoaded ?? false;

  const scanMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/scan").then(r => r.json()),
    onSuccess: (data: { found: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      toast({
        title: `Scan complete — ${data.found} signal${data.found !== 1 ? "s" : ""} found`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    },
  });

  const activeSignals = (signals ?? []).filter(s => s.status === "active");
  const skippedSignals = (signals ?? []).filter(s => s.status === "skipped");
  const autoSignals = (signals ?? []).filter(s => s.status === "auto_traded");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Favorite Bloat Tracker</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Soccer prediction market scanner · Kalshi
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid="button-scan"
            >
              {scanMutation.isPending ? "Scanning..." : "Scan Now"}
            </Button>
            <Button
              size="sm"
              variant={showCreds ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setShowCreds(v => !v)}
              data-testid="button-toggle-creds"
            >
              {isConnected ? "● Connected" : "Connect API"}
            </Button>
          </div>
        </div>

        {/* Credentials panel (collapsible) */}
        {(showCreds || !isConnected) && (
          <div className="mb-5">
            <CredentialsPanel onConnected={() => setShowCreds(false)} />
          </div>
        )}

        {/* Stats Bar */}
        <StatsBar />

        {/* Live Scoreboard */}
        <LiveScoreboard />

        {/* Main Tabs */}
        <Tabs defaultValue="signals">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="signals" className="flex-1" data-testid="tab-signals">
              Signals {activeSignals.length > 0 && `(${activeSignals.length})`}
            </TabsTrigger>
            <TabsTrigger value="bot" className="flex-1" data-testid="tab-bot">Bot</TabsTrigger>
            <TabsTrigger value="history" className="flex-1" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="space-y-3" data-testid="content-signals">
            {!settings ? null : activeSignals.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No active signals</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Hit Scan Now or enable auto-scan to detect favorite bloat.
                </p>
              </div>
            ) : (
              activeSignals.map(s => <SignalCard key={s.id} signal={s} settings={settings} />)
            )}
          </TabsContent>

          <TabsContent value="bot" className="space-y-3" data-testid="content-bot">
            <BotPanel />
          </TabsContent>

          <TabsContent value="history" data-testid="content-history">
            <TradeHistory signals={signals ?? []} />
          </TabsContent>
        </Tabs>

        <PerplexityAttribution />
      </div>
    </div>
  );
}
