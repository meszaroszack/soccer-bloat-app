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

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketTier = "bet" | "watch" | "early" | "cold";

interface ScoredMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  favoriteProb: number | null;
  drawPrice: number | null;
  yesPrice: number | null;
  minuteEstimate: number | null; // null = pre-game or finished
  kickoffTime: string | null;    // ISO string — close_time = kickoff
  isLive: boolean;
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

// ─── Tier config ─────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bloatLabel(score: number): { label: string; color: string; bar: string } {
  if (score >= 70) return { label: "STRONG", color: "bg-red-500 text-white", bar: "bg-red-500" };
  if (score >= 45) return { label: "MODERATE", color: "bg-orange-400 text-white", bar: "bg-orange-400" };
  return { label: "WEAK", color: "bg-yellow-500 text-black", bar: "bg-yellow-400" };
}

const fmtProb = (p: number) => `${Math.round(p * 100)}%`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtPct = (n: number | null) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtMoney = (n: number) => n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;

// ─── Credentials Panel ────────────────────────────────────────────────────────

function CredentialsPanel({ onConnected }: { onConnected: () => void }) {
  const { toast } = useToast();
  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const connect = useMutation({
    mutationFn: () => apiRequest("POST", "/api/credentials", {
      apiKeyId: apiKeyId.trim(),
      privateKeyPem: privateKey.trim(),
    }).then(r => r.json()),
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

// ─── Bot Control Panel ────────────────────────────────────────────────────────

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
    mutationFn: (body: Partial<Settings>) => apiRequest("PATCH", "/api/settings", body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      setLocal({});
      toast({ title: "Settings saved" });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/credentials").then(r => r.json()),
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

// ─── Signal Card ──────────────────────────────────────────────────────────────

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
    }).then(r => r.json()),
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
      apiRequest("PATCH", `/api/signals/${signal.id}`, body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const skipSignal = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/signals/${signal.id}`, { status: "skipped" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/signals"] }),
  });

  const { label, color, bar } = bloatLabel(signal.bloatScore);
  // Prices are decimal probabilities (0-1); display as cents (e.g. 0.52 → "52¢")
  const noOdds = signal.drawPrice ? `${Math.round(signal.drawPrice * 100)}¢` : "—";
  const yesOdds = signal.yesPrice ? `${Math.round(signal.yesPrice * 100)}¢` : "—";
  const budget = parseFloat(betAmt) || 0;

  // price is a decimal (e.g. 0.52); each contract costs `price` dollars and pays $1 on win
  function calcPayout(price: number, amount: number) {
    const contracts = Math.floor(amount / price);
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
                    ? (Math.floor((signal.betAmount ?? 0) / signal.drawPrice) - (signal.betAmount ?? 0))
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

// ─── Stats Bar ────────────────────────────────────────────────────────────────

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

// ─── Trade History ────────────────────────────────────────────────────────────

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

// ─── Live Scoreboard ────────────────────────────────────────────────────────

function ScoreboardRow({ market }: { market: ScoredMarket }) {
  const cfg = TIER_CONFIG[market.tier];
  const favPct = market.favoriteProb != null ? `${Math.round(market.favoriteProb * 100)}%` : "—";
  // Prices are decimal probabilities (0-1); display as cents
  const noPr = market.drawPrice != null ? `${Math.round(market.drawPrice * 100)}¢` : "—";
  // Show game minute if live, kickoff time if pre-game
  let minDisplay: string;
  if (market.isLive && market.minuteEstimate != null) {
    minDisplay = `${market.minuteEstimate}'`;
  } else if (!market.isLive && market.kickoffTime) {
    const ko = new Date(market.kickoffTime);
    minDisplay = ko.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    minDisplay = "—";
  }
  const displayTitle = market.title.replace(/^(Will |Who wins |Match winner:\s*)/i, "");

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${cfg.border} ${cfg.bg} transition-all`}
      data-testid={`scoreboard-${market.ticker}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          market.tier === "cold" || market.tier === "early" ? "text-muted-foreground" : "text-foreground"
        }`}>{displayTitle}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
        {market.tier !== "cold" && (
          <>
            <span className="text-muted-foreground hidden sm:block">{minDisplay}</span>
            <span className="text-orange-400 hidden md:block">{favPct}</span>
            <span className="text-green-400 hidden lg:block">NO {noPr}</span>
            {market.bloatScore > 0 && (
              <span className="text-muted-foreground hidden md:block">{market.bloatScore}</span>
            )}
          </>
        )}
      </div>
      <Badge className={`text-[10px] px-1.5 py-0 h-5 border shrink-0 ${cfg.badge}`}>
        {cfg.badgeText}
      </Badge>
    </div>
  );
}

function LiveScoreboard() {
  const [showCold, setShowCold] = useState(false);
  const { data, isLoading, dataUpdatedAt } = useQuery<{ markets: ScoredMarket[]; fetchedAt: string }>({
    queryKey: ["/api/markets"],
    refetchInterval: 30000,
  });

  const markets = data?.markets ?? [];
  const betMarkets   = markets.filter(m => m.tier === "bet");
  const watchMarkets = markets.filter(m => m.tier === "watch");
  const earlyMarkets = markets.filter(m => m.tier === "early");
  const coldMarkets  = markets.filter(m => m.tier === "cold");
  const visible = showCold ? markets : [...betMarkets, ...watchMarkets, ...earlyMarkets];
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <Card className="border rounded-xl mb-5">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Live Soccer Markets
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            {lastUpdate && <span className="text-[10px] text-muted-foreground">Updated {lastUpdate}</span>}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />{betMarkets.length} bet</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />{watchMarkets.length} watch</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400/60" />{earlyMarkets.length} early</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500/60" />{coldMarkets.length} cold</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : markets.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No open soccer markets on Kalshi right now</p>
        ) : (
          <div className="space-y-1.5">
            {visible.length === 0 && !showCold ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No active matches — check back closer to game time</p>
            ) : (
              visible.map(m => <ScoreboardRow key={m.ticker} market={m} />)
            )}
            {coldMarkets.length > 0 && (
              <button
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 text-center transition-colors"
                onClick={() => setShowCold(v => !v)}
              >
                {showCold ? `▲ Hide ${coldMarkets.length} cold markets` : `▼ Show ${coldMarkets.length} no-bloat markets`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { toast } = useToast();
  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    refetchInterval: 10000,
  });
  const { data: settings } = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const { data: status } = useQuery<ScanStatus>({ queryKey: ["/api/status"], refetchInterval: 5000 });

  const isConnected = status?.credentialsLoaded ?? false;

  const manualScan = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scan").then(r => r.json()),
    onSuccess: (data: { found: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: `Scan complete — ${data.found} signal${data.found !== 1 ? "s" : ""} found` });
    },
  });

  const activeSignals = signals.filter(s => s.status === "active");
  const skippedSignals = signals.filter(s => s.status === "skipped");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Bloat Scout">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
              <polygon points="14,6 10,10 10,15 14,18 18,15 18,10" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
              <circle cx="14" cy="12" r="2.5" className="fill-primary" />
              <path d="M8 21 L20 21" stroke="currentColor" strokeWidth="1" className="text-muted-foreground" />
              <path d="M8 21 L10 18 L13 20 L16 17 L20 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400" />
            </svg>
            <div>
              <h1 className="text-base font-bold leading-none">Bloat Scout</h1>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">
                Kalshi Soccer ·{" "}
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? (status?.botEnabled ? "Bot Live" : "Connected") : "Not Connected"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && status?.botEnabled && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs animate-pulse">
                BOT LIVE
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => manualScan.mutate()}
              disabled={manualScan.isPending} className="h-8 text-xs" data-testid="button-scan">
              {manualScan.isPending ? "Scanning..." : "Scan Now"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <StatsBar />

        {/* Bloat explainer */}
        <div className="mb-5 p-3 rounded-xl border bg-orange-500/5 border-orange-500/20">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-orange-400">Favorite Bloat:</span> Late-game (65'+) tied soccer matches where the pre-game favorite is still priced too high (60–78%).
            Bet <span className="text-green-400 font-medium">NO</span> (draw/upset), <span className="text-blue-400 font-medium">YES</span> (underdog wins), or both.
            {isConnected && status?.botEnabled
              ? <span className="text-green-400 font-medium"> Bot is actively placing bets.</span>
              : <span className="text-muted-foreground"> Connect API key + enable bot to auto-trade.</span>
            }
          </p>
        </div>

        {/* Live Scoreboard */}
        <LiveScoreboard />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Signals — left 2 cols */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="active">
              <TabsList className="mb-4">
                <TabsTrigger value="active" data-testid="tab-active">
                  Active
                  {activeSignals.length > 0 && (
                    <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-orange-500 text-white">{activeSignals.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-history">Trades</TabsTrigger>
                <TabsTrigger value="skipped" data-testid="tab-skipped">
                  Skipped {skippedSignals.length > 0 && `(${skippedSignals.length})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                {isLoading ? (
                  <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}</div>
                ) : activeSignals.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <div className="text-4xl">⚽</div>
                    <p className="text-sm font-medium text-muted-foreground">No bloat signals detected</p>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Watching Kalshi soccer markets. Signals appear when a late-game favorite is priced too high on a tied match.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => manualScan.mutate()} disabled={manualScan.isPending} data-testid="button-scan-empty">
                      Scan Now
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeSignals.map(s => (
                      <SignalCard key={s.id} signal={s} settings={settings ?? {
                        minMinute: 65, maxFavoriteProb: 0.78, minFavoriteProb: 0.60,
                        scanEnabled: true, scanIntervalSec: 60, botEnabled: false,
                        betMode: "no_only", betAmountDollars: 2, minBloatScore: 40,
                      }} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history">
                <TradeHistory signals={signals} />
              </TabsContent>

              <TabsContent value="skipped">
                {skippedSignals.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">No skipped signals</div>
                ) : (
                  <div className="space-y-2">
                    {skippedSignals.map(s => (
                      <div key={s.id} className="p-3 rounded-lg border opacity-50 text-sm">
                        <p className="font-medium truncate">{s.marketTitle}</p>
                        <p className="text-xs text-muted-foreground">Bloat {s.bloatScore} · {fmtProb(s.favoriteProb)} fav · {fmtTime(s.detectedAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {!isConnected ? (
              <CredentialsPanel onConnected={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/status"] });
                queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
              }} />
            ) : null}
            <BotPanel />
          </div>
        </div>
      </main>

      <footer className="border-t py-4 mt-8">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Bloat Scout · Trade responsibly</p>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}