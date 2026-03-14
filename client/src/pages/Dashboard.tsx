import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { X, RefreshCw, TrendingDown, Wifi, WifiOff, Lock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMarket {
  ticker: string;
  teamCode: string;
  label: string;
  yesPrice: number;
  noPrice: number;
}

interface PricePoint {
  minute: number;
  favoriteProb: number;
  ts: number;
}

interface EventSnapshot {
  eventTicker: string;
  gameTitle: string;
  home: TeamMarket;
  away: TeamMarket;
  draw: TeamMarket;
  favorite: TeamMarket;
  favoriteProb: number;
  minute: number;
  isLive: boolean;
  kickoffTime: number | null;
  bloatScore: number;
  tier: "bet" | "watch" | "early" | "cold";
  priceHistory: PricePoint[];
}

interface WatchSlotState {
  slotIndex: number;
  eventTicker: string;
  rawInput: string;
  snapshot: EventSnapshot | null;
  lastFetched: string | null;
  active: boolean;
}

// ─── Tier colours ─────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  bet:   { label: "BET",   bg: "bg-red-500",    text: "text-white",      ring: "ring-red-400" },
  watch: { label: "WATCH", bg: "bg-amber-500",  text: "text-white",      ring: "ring-amber-400" },
  early: { label: "EARLY", bg: "bg-blue-500",   text: "text-white",      ring: "ring-blue-400" },
  cold:  { label: "COLD",  bg: "bg-zinc-600",   text: "text-zinc-200",   ring: "ring-zinc-500" },
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: PricePoint[] }) {
  if (data.length < 2) return (
    <div className="h-12 flex items-center justify-center text-xs text-zinc-500">Not enough data</div>
  );

  const W = 280, H = 48, PAD = 4;
  const probs = data.map(d => d.favoriteProb);
  const minP = Math.min(...probs);
  const maxP = Math.max(...probs);
  const range = maxP - minP || 0.01;

  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (d.favoriteProb - minP) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const lastProb = probs[probs.length - 1];
  const color = lastProb >= 0.7 ? "#ef4444" : lastProb >= 0.55 ? "#f59e0b" : "#22c55e";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts.split(" ").pop()!.split(",")[0]} cy={pts.split(" ").pop()!.split(",")[1]} r="3" fill={color} />
    </svg>
  );
}

// ─── BloatBar ─────────────────────────────────────────────────────────────────

function BloatBar({ score, tier }: { score: number; tier: EventSnapshot["tier"] }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">Bloat Score</span>
        <span className="font-mono font-bold text-white">{score.toFixed(0)}</span>
      </div>
      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${cfg.bg}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ─── Odds Row ─────────────────────────────────────────────────────────────────

function OddsRow({ snapshot }: { snapshot: EventSnapshot }) {
  const { home, away, draw, favorite } = snapshot;
  const isFav = (tm: TeamMarket) => tm.ticker === favorite.ticker;

  const OddsCell = ({ tm }: { tm: TeamMarket }) => (
    <div className={`flex-1 text-center px-2 py-2 rounded-lg ${isFav(tm) ? "bg-zinc-700 ring-1 ring-amber-400" : "bg-zinc-800"}`}>
      <div className="text-[10px] text-zinc-400 truncate">{tm.label}</div>
      <div className={`text-sm font-bold font-mono ${isFav(tm) ? "text-amber-300" : "text-white"}`}>
        {(tm.yesPrice * 100).toFixed(0)}%
      </div>
      {isFav(tm) && <div className="text-[9px] text-amber-400 mt-0.5">FAV</div>}
    </div>
  );

  return (
    <div className="flex gap-1.5">
      <OddsCell tm={home} />
      <OddsCell tm={draw} />
      <OddsCell tm={away} />
    </div>
  );
}

// ─── Bet Panel ────────────────────────────────────────────────────────────────

function BetPanel({ snapshot, connected }: { snapshot: EventSnapshot; connected: boolean }) {
  const [mode, setMode] = useState<"no" | "yes" | "both">("no");
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function place() {
    if (!connected) { setResult("Connect API key first"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: snapshot.favorite.ticker,
          betMode: mode,
          betAmountDollars: parseFloat(amount),
          drawPrice: snapshot.draw.yesPrice,
          yesPrice: snapshot.favorite.yesPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) setResult(`Error: ${data.error}`);
      else setResult(`Placed ${data.orders?.length ?? 0} order(s)`);
    } catch (e) {
      setResult("Network error");
    } finally {
      setLoading(false);
    }
  }

  const modeBtn = (m: typeof mode, label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`px-3 py-1 text-xs rounded font-medium transition-colors ${mode === m ? "bg-amber-500 text-black" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3 p-3 bg-zinc-800/60 rounded-lg border border-zinc-700 space-y-3">
      <div className="text-xs font-semibold text-zinc-300">Place Bet</div>
      <div className="flex gap-1.5">
        {modeBtn("no", "NO (compression)")}
        {modeBtn("yes", "YES")}
        {modeBtn("both", "Both")}
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-zinc-400 text-xs">$</span>
        <Input
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="h-7 text-xs bg-zinc-700 border-zinc-600 text-white w-20"
        />
        <Button
          size="sm"
          onClick={place}
          disabled={loading}
          className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold px-3"
        >
          {loading ? "..." : "Place"}
        </Button>
      </div>
      {result && (
        <div className={`text-xs font-medium ${result.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
          {result}
        </div>
      )}
    </div>
  );
}

// ─── Watch Slot Card ──────────────────────────────────────────────────────────

function WatchSlotCard({
  slotIndex,
  state,
  connected,
  onSet,
  onClear,
}: {
  slotIndex: number;
  state: WatchSlotState;
  connected: boolean;
  onSet: (slotIndex: number, input: string) => void;
  onClear: (slotIndex: number) => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snap = state.snapshot;
  const tier = snap?.tier;
  const cfg = tier ? TIER_CONFIG[tier] : null;

  async function handleWatch() {
    if (!inputVal.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/watch/${slotIndex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: inputVal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      onSet(slotIndex, inputVal.trim());
      setInputVal("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    await fetch(`/api/watch/${slotIndex}`, { method: "DELETE" });
    onClear(slotIndex);
  }

  return (
    <Card className="bg-zinc-900 border-zinc-700 flex-1 min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-zinc-300 font-semibold">
            Game {slotIndex + 1}
          </CardTitle>
          {state.active && cfg && (
            <Badge className={`${cfg.bg} ${cfg.text} text-[10px] font-bold px-2`}>
              {cfg.label}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* URL Input */}
        <div className="flex gap-2">
          <Input
            placeholder="kalshi.com/markets/... or event ticker"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleWatch()}
            className="h-8 text-xs bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500 flex-1"
          />
          <Button
            size="sm"
            onClick={handleWatch}
            disabled={loading || !inputVal.trim()}
            className="h-8 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3"
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Watch"}
          </Button>
          {state.active && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}

        {/* Active game */}
        {snap && (
          <div className="space-y-3">
            {/* Game title + minute */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white leading-tight">{snap.gameTitle}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{snap.eventTicker}</div>
              </div>
              <div className={`shrink-0 text-xs font-bold px-2 py-1 rounded font-mono ${snap.isLive ? "bg-green-900 text-green-300" : "bg-zinc-800 text-zinc-400"}`}>
                {snap.isLive ? `${snap.minute}'` : "PRE"}
              </div>
            </div>

            <Separator className="bg-zinc-700/50" />

            {/* Odds */}
            <OddsRow snapshot={snap} />

            {/* Bloat bar */}
            <BloatBar score={snap.bloatScore} tier={snap.tier} />

            {/* Sparkline */}
            {snap.priceHistory.length >= 2 && (
              <div className="mt-1">
                <div className="text-[10px] text-zinc-500 mb-1">Favourite probability (last {snap.priceHistory.length} samples)</div>
                <Sparkline data={snap.priceHistory} />
              </div>
            )}

            {/* Bet panel */}
            {(tier === "bet" || tier === "watch") && (
              <BetPanel snapshot={snap} connected={connected} />
            )}
          </div>
        )}

        {!state.active && !snap && (
          <div className="text-xs text-zinc-500 text-center py-6">
            Paste a Kalshi game URL or event ticker to start watching
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Credentials Panel ────────────────────────────────────────────────────────

function CredentialsPanel({ onStatusChange }: { onStatusChange: (c: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [apiKeyId, setApiKeyId] = useState("");
  const [pem, setPem] = useState("");
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credentials/status")
      .then(r => r.json())
      .then(d => {
        setConnected(d.connected);
        onStatusChange(d.connected);
        if (d.connected) fetchBalance();
      })
      .catch(() => {});
  }, []);

  async function fetchBalance() {
    try {
      const r = await fetch("/api/balance");
      const d = await r.json();
      if (r.ok) setBalance(d.balance);
    } catch {}
  }

  async function connect() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId, privateKeyPem: pem }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed"); return; }
      setConnected(true);
      setBalance(d.balance ?? null);
      onStatusChange(true);
      setOpen(false);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  async function disconnect() {
    await fetch("/api/credentials", { method: "DELETE" });
    setConnected(false); setBalance(null); onStatusChange(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">API Key</span>
        {connected
          ? <Badge className="bg-green-900 text-green-300 text-[10px]">Connected</Badge>
          : <Badge className="bg-zinc-800 text-zinc-500 text-[10px]">Disconnected</Badge>
        }
      </div>

      {connected ? (
        <div className="space-y-2">
          {balance !== null && (
            <div className="text-xs text-zinc-400">
              Balance: <span className="text-white font-mono">${(balance / 100).toFixed(2)}</span>
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={disconnect} className="w-full h-7 text-xs text-zinc-500 hover:text-red-400">
            Disconnect
          </Button>
        </div>
      ) : (
        <>
          <Button size="sm" onClick={() => setOpen(!open)} className="w-full h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600">
            <Lock className="w-3 h-3 mr-1.5" /> Connect Key
          </Button>
          {open && (
            <div className="space-y-2 pt-1">
              <Input
                placeholder="API Key ID"
                value={apiKeyId}
                onChange={e => setApiKeyId(e.target.value)}
                className="h-7 text-xs bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
              />
              <textarea
                placeholder="RSA Private Key (PEM)"
                value={pem}
                onChange={e => setPem(e.target.value)}
                rows={4}
                className="w-full text-xs bg-zinc-800 border border-zinc-600 text-white placeholder:text-zinc-500 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {error && <div className="text-xs text-red-400">{error}</div>}
              <Button size="sm" onClick={connect} disabled={loading || !apiKeyId || !pem} className="w-full h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold">
                {loading ? "Verifying..." : "Connect"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [slots, setSlots] = useState<WatchSlotState[]>([
    { slotIndex: 0, eventTicker: "", rawInput: "", snapshot: null, lastFetched: null, active: false },
    { slotIndex: 1, eventTicker: "", rawInput: "", snapshot: null, lastFetched: null, active: false },
  ]);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSlots = useCallback(async () => {
    try {
      const r = await fetch("/api/watch");
      if (r.ok) {
        const data: WatchSlotState[] = await r.json();
        setSlots(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSlots();
    pollRef.current = setInterval(fetchSlots, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchSlots]);

  function handleSet(_slotIndex: number, _input: string) {
    setTimeout(fetchSlots, 500); // give server a moment to start polling
  }

  function handleClear(_slotIndex: number) {
    fetchSlots();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-5 h-5 text-amber-400" />
          <span className="text-lg font-bold tracking-tight">Bloat Scout</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          {connected
            ? <><Wifi className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Live</span></>
            : <><WifiOff className="w-3.5 h-3.5" /><span>No key</span></>
          }
        </div>
      </header>

      {/* Body */}
      <div className="flex gap-6 p-6 max-w-5xl mx-auto">
        {/* Game slots */}
        <div className="flex gap-4 flex-1 min-w-0">
          {slots.map(slot => (
            <WatchSlotCard
              key={slot.slotIndex}
              slotIndex={slot.slotIndex}
              state={slot}
              connected={connected}
              onSet={handleSet}
              onClear={handleClear}
            />
          ))}
        </div>

        {/* Sidebar */}
        <div className="w-52 shrink-0">
          <Card className="bg-zinc-900 border-zinc-700">
            <CardContent className="pt-4">
              <CredentialsPanel onStatusChange={setConnected} />
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-700 mt-3">
            <CardContent className="pt-4 space-y-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Tier Guide</div>
              {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.bg}`} />
                  <span className="text-xs text-zinc-400">{cfg.label}</span>
                  <span className="text-[10px] text-zinc-600 ml-auto">
                    {key === "bet" ? "≥40 + 65'" : key === "watch" ? "≥20 + 50'" : key === "early" ? "Pre / <50'" : "No bloat"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
