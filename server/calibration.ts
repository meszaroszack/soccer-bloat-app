import { randomUUID } from "crypto";
import { store } from "./storage";
import type { CalibrationBucket, VirtualPosition } from "../shared/types";

function scoreBucketFor(normalizedScore: number): string {
  if (normalizedScore < 60) return "<60";
  if (normalizedScore < 70) return "60-70";
  if (normalizedScore < 80) return "70-80";
  if (normalizedScore < 90) return "80-90";
  return "90+";
}

function edgeBucketFor(edgePercent: number): string {
  if (edgePercent < 5) return "<5";
  if (edgePercent < 10) return "5-10";
  if (edgePercent < 15) return "10-15";
  if (edgePercent < 20) return "15-20";
  return "20+";
}

function bucketKey(
  strategy: string,
  sport: string,
  scoreBucket: string,
  edgeBucket: string,
  liveOrPre: "live" | "pre",
): string {
  return `${strategy}|${sport}|${scoreBucket}|${edgeBucket}|${liveOrPre}`;
}

export function getOrCreateBucket(
  strategy: string,
  sport: string,
  normalizedScore: number,
  edgePercent: number,
  liveOrPre: "live" | "pre",
): CalibrationBucket {
  const sb = scoreBucketFor(normalizedScore);
  const eb = edgeBucketFor(edgePercent);
  const id = bucketKey(strategy, sport, sb, eb, liveOrPre);
  const existing = store.getCalibrationBucket(id);
  if (existing) return existing;
  const bucket: CalibrationBucket = {
    id,
    strategy,
    sport,
    scoreBucket: sb,
    edgeBucket: eb,
    liveOrPre,
    hitRate: 0.5,
    sampleSize: 0,
    totalPnl: 0,
    totalCapitalDeployed: 0,
    lastUpdated: new Date(),
    disabled: false,
  };
  store.upsertCalibrationBucket(bucket);
  return bucket;
}

export function getEffectiveMinScore(
  strategy: string,
  sport: string,
  normalizedScore: number,
  edgePercent: number,
  liveOrPre: "live" | "pre",
): number {
  const settings = store.getSettings();
  const base = settings.minNormalizedScore;
  const bucket = getOrCreateBucket(strategy, sport, normalizedScore, edgePercent, liveOrPre);
  if (bucket.sampleSize < 20) return base;
  if (bucket.hitRate < 0.45) return Math.min(95, base + 10);
  if (bucket.hitRate < 0.5) return Math.min(95, base + 5);
  if (bucket.hitRate > 0.65) return Math.max(50, base - 5);
  return base;
}

export function isBucketDisabled(
  strategy: string,
  sport: string,
  normalizedScore: number,
  edgePercent: number,
  liveOrPre: "live" | "pre",
): boolean {
  const bucket = getOrCreateBucket(strategy, sport, normalizedScore, edgePercent, liveOrPre);
  return bucket.disabled;
}

export function recordOutcome(pos: VirtualPosition): void {
  if (pos.outcome === undefined) return;
  const liveOrPre: "live" | "pre" = "pre";
  const sb = scoreBucketFor(50);
  const eb = edgeBucketFor(0);
  let bucket: CalibrationBucket | undefined;
  for (const b of store.getAllCalibrationBuckets()) {
    if (b.strategy === pos.strategy && b.sport === pos.sport) {
      bucket = b;
      break;
    }
  }
  if (!bucket) {
    bucket = getOrCreateBucket(pos.strategy, pos.sport, 75, 5, liveOrPre);
  }
  const prevHitRate = bucket.hitRate;
  const prevSize = bucket.sampleSize;
  const win = pos.outcome === "win" ? 1 : 0;
  const newSize = prevSize + 1;
  const newHitRate = (prevHitRate * prevSize + win) / newSize;
  bucket.hitRate = newHitRate;
  bucket.sampleSize = newSize;
  bucket.totalPnl += pos.realizedPnlDollars ?? 0;
  bucket.totalCapitalDeployed += pos.sizeDollars;
  bucket.lastUpdated = new Date();

  if (newSize >= 30 && newHitRate < 0.35) {
    bucket.disabled = true;
    bucket.disabledReason = `Disabled: hit rate ${(newHitRate * 100).toFixed(1)}% over ${newSize} samples`;
  }

  store.upsertCalibrationBucket(bucket);

  store.addModelAdjustment({
    id: randomUUID(),
    timestamp: new Date(),
    type: "outcome_recorded",
    bucketId: bucket.id,
    detail: `${pos.outcome} on ${pos.matchup} — bucket hit rate ${(prevHitRate * 100).toFixed(1)}% → ${(newHitRate * 100).toFixed(1)}% (n=${newSize})`,
    beforeValue: prevHitRate,
    afterValue: newHitRate,
  });
}
