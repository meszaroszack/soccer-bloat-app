import { store } from "./storage";
import type { NormalizedEvent, NormalizedMarket, OpeningObservation } from "../shared/types";

export function recordOpeningSnapshot(
  eventTickerOrEvent: string | NormalizedEvent,
  market?: NormalizedMarket,
): void {
  const eventTicker =
    typeof eventTickerOrEvent === "string"
      ? eventTickerOrEvent
      : eventTickerOrEvent.eventTicker;

  let yesPrice: number;
  let noPrice: number;
  let marketTicker: string;

  if (market) {
    yesPrice = market.yesPrice;
    noPrice = market.noPrice;
    marketTicker = market.ticker;
  } else if (typeof eventTickerOrEvent !== "string") {
    yesPrice = eventTickerOrEvent.favoriteProb;
    noPrice = 1 - yesPrice;
    marketTicker = eventTickerOrEvent.markets[0]?.ticker ?? eventTicker;
  } else {
    return;
  }

  if (store.getOpening(eventTicker)) return;

  const near5050 = Math.abs(yesPrice - 0.5) < 0.05;

  const observation: OpeningObservation = {
    eventTicker,
    marketTicker,
    firstSeenAt: new Date(),
    firstYesPrice: yesPrice,
    firstNoPrice: noPrice,
    near5050AtOpen: near5050,
    researchScore: 0,
  };

  store.upsertOpening(observation);
}

export function updateDriftSnapshot(
  eventTicker: string,
  minuteMark: 5 | 15 | 30 | 60,
  currentFavoriteProb: number,
): void {
  const existing = store.getOpening(eventTicker);
  if (!existing) return;
  const updated: OpeningObservation = { ...existing };
  switch (minuteMark) {
    case 5:
      if (updated.favoriteAfter5m === undefined) updated.favoriteAfter5m = currentFavoriteProb;
      break;
    case 15:
      if (updated.favoriteAfter15m === undefined) updated.favoriteAfter15m = currentFavoriteProb;
      break;
    case 30:
      if (updated.favoriteAfter30m === undefined) updated.favoriteAfter30m = currentFavoriteProb;
      break;
    case 60:
      if (updated.favoriteAfter60m === undefined) updated.favoriteAfter60m = currentFavoriteProb;
      break;
  }
  updated.researchScore = Math.abs(currentFavoriteProb - updated.firstYesPrice) * 100;
  store.upsertOpening(updated);
}

export function maybeUpdateDriftFromEvent(event: NormalizedEvent): void {
  const obs = store.getOpening(event.eventTicker);
  if (!obs) return;
  const ageMin = (Date.now() - obs.firstSeenAt.getTime()) / 60_000;
  if (ageMin >= 5 && obs.favoriteAfter5m === undefined)
    updateDriftSnapshot(event.eventTicker, 5, event.favoriteProb);
  if (ageMin >= 15 && obs.favoriteAfter15m === undefined)
    updateDriftSnapshot(event.eventTicker, 15, event.favoriteProb);
  if (ageMin >= 30 && obs.favoriteAfter30m === undefined)
    updateDriftSnapshot(event.eventTicker, 30, event.favoriteProb);
  if (ageMin >= 60 && obs.favoriteAfter60m === undefined)
    updateDriftSnapshot(event.eventTicker, 60, event.favoriteProb);
  const fresh = store.getOpening(event.eventTicker);
  if (fresh) {
    fresh.researchScore = Math.abs(event.favoriteProb - fresh.firstYesPrice) * 100;
    store.upsertOpening(fresh);
  }
}

export function getDriftResearchData(): OpeningObservation[] {
  return [...store.getAllOpenings()].sort((a, b) => b.researchScore - a.researchScore);
}
