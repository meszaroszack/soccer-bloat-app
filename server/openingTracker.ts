import { store } from "./storage";
import type { NormalizedEvent, OpeningObservation } from "../shared/types";

export function recordOpeningSnapshot(event: NormalizedEvent): void {
  const existing = store.getOpening(event.eventTicker);
  if (existing) {
    const ageMs = Date.now() - existing.firstSeenAt.getTime();
    const ageMin = ageMs / 60_000;

    const updated = { ...existing };
    if (ageMin >= 5 && !existing.favoriteAfter5m) updated.favoriteAfter5m = event.favoriteProb;
    if (ageMin >= 15 && !existing.favoriteAfter15m) updated.favoriteAfter15m = event.favoriteProb;
    if (ageMin >= 30 && !existing.favoriteAfter30m) updated.favoriteAfter30m = event.favoriteProb;
    if (ageMin >= 60 && !existing.favoriteAfter60m) updated.favoriteAfter60m = event.favoriteProb;
    store.upsertOpening(updated);
    return;
  }

  const firstYes = event.favoriteProb;
  const firstNo = 1 - firstYes;
  const near5050 = firstYes >= 0.44 && firstYes <= 0.56;

  const observation: OpeningObservation = {
    eventTicker: event.eventTicker,
    marketTicker: event.markets[0]?.ticker ?? event.eventTicker,
    firstSeenAt: new Date(),
    firstYesPrice: firstYes,
    firstNoPrice: firstNo,
    near5050AtOpen: near5050,
    researchScore: near5050 ? 80 : 20,
  };

  store.upsertOpening(observation);
}

export function getDriftResearchData(): Array<
  OpeningObservation & { drift60m?: number; driftClass: string }
> {
  const obs = store.getAllOpenings();
  return obs.map((o) => {
    const finalProb = o.favoriteAfter60m ?? o.favoriteAfter30m ?? o.favoriteAfter15m;
    const drift60m = finalProb !== undefined ? finalProb - o.firstYesPrice : undefined;
    const driftClass = drift60m === undefined
      ? "tracking"
      : Math.abs(drift60m) > 0.15
        ? "strong_drift"
        : Math.abs(drift60m) > 0.05
          ? "mild_drift"
          : "stable";
    return { ...o, drift60m, driftClass };
  });
}
