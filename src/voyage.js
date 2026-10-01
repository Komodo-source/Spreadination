/**
 * The voyage economy: what a delivery pays, what a hull costs, and how a trip resolves.
 *
 * Both numbers here used to be off by orders of magnitude. The old reward used
 * `good.value * 1000` where `value` is a country's *annual* trade in thousands of USD,
 * so a single hop paid out up to $179,000,000,000,000 (the largest export in
 * assets/trade_summary.json) — and the old hull price of `gt * 100` put the smallest
 * ship in the game at $9,000,000 against a $5,000 starting balance, which meant no new
 * player could ever sail. Freight is now paid per kilometre with a capped cargo bonus,
 * and a hull costs about as much as a port, which is the scale the rest of the game
 * (ports at 500-5,000, a 5,000 starting bank) already uses.
 *
 * Pure — the caller supplies the dice.
 */

import { VOYAGE_FULL_DISTANCE_KM, airVoyageDurationMs, voyageDurationMs } from './geo';
import {
  lossRiskPercent,
  researchPointsForVoyage,
  rewardMultiplier,
  voyageDurationMultiplier
} from './Research';

/** Freight rate, in money per kilometre of route. */
export const FREIGHT_PER_KM = 0.6;

/** Ceiling on the cargo's contribution, so a mega-exporter is not a money printer. */
export const CARGO_BONUS_CAP = 400;

/**
 * Paid on top of the freight when the load is a flow that really runs between the two
 * countries (see `cargo.js`): carrying what the ports actually trade is worth 5% more.
 */
export const REAL_TRADE_BONUS_SHARE = 0.05;

/**
 * How much extra the longest ocean legs pay, as a share of the base freight, and the
 * distance at which all of it is earned.
 *
 * The crossing duration flattens out at VOYAGE_FULL_DISTANCE_KM, so past that point a
 * flat per-km rate would quote the same sea mile whether it is the tenth or the
 * twentieth thousand kilometres. The premium scales the freight itself with the extra
 * distance, so the far ports are worth sailing to rather than being identical money for
 * more water.
 */
export const LONG_HAUL_BONUS_SHARE = 0.25;
export const LONG_HAUL_FULL_DISTANCE_KM = 20000;

/**
 * The multiplier on a route's freight by length: 1 up to the distance where the crossing
 * curve flattens, then rising with the extra sea miles to 1 + LONG_HAUL_BONUS_SHARE at
 * LONG_HAUL_FULL_DISTANCE_KM and flat thereafter.
 */
export function longHaulMultiplier(distanceKm) {
  const distance = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;

  if (distance <= VOYAGE_FULL_DISTANCE_KM) return 1;

  const span = (distance - VOYAGE_FULL_DISTANCE_KM) / (LONG_HAUL_FULL_DISTANCE_KM - VOYAGE_FULL_DISTANCE_KM);

  return 1 + LONG_HAUL_BONUS_SHARE * Math.min(1, span);
}

/** Share of the delivery value lost when cargo is hit. */
export const VOYAGE_LOSS_SHARE = 0.25;

/** Cheapest hull, so that even a coastal trader has to be paid for. */
export const MIN_HULL_PRICE = 250;

/** Price of a hull, from its gross tonnage. */
export function hullPrice(gt) {
  const tonnage = Number(gt);
  if (!Number.isFinite(tonnage) || tonnage <= 0) return MIN_HULL_PRICE;

  return Math.max(MIN_HULL_PRICE, Math.round(tonnage / 100));
}

// ---------------------------------------------------------------------------
// Aircraft
//
// An air fleet is capital, not cargo: the whole point of an aircraft is that it crosses
// a border a ship cannot, in a fraction of the time, and it is priced to be a serious
// commitment. Where a hull at most a large ship is worth a few thousand, the dearest
// vessel in the catalog is 4,992 — roughly ten times that is the entry ticket to the air.
// ---------------------------------------------------------------------------

/**
 * Payload share an air delivery earns against the same distance by sea. Aircraft carry far
 * less than a hull, so a flight pays less for the same trip even before its shorter route
 * is taken into account — the trade for crossing land.
 */
export const AIR_FREIGHT_SHARE = 0.3;

/** How much of the air freight the cargo's own trade value adds, scaled down from sea. */
export const AIR_CARGO_SHARE = 0.25;

/** Cheapest aircraft, so even the lightest type is a real purchase. */
export const MIN_AIRCRAFT_PRICE = 12000;

/**
 * Money per tonne of air payload. Roughly ten times a hull's price per tonne of gross
 * tonnage, so an aircraft costs about an order of magnitude more than a comparable ship.
 */
export const AIRCRAFT_PRICE_PER_TONNE = 1000;

/** Price of an aircraft, from its cargo payload in tonnes. */
export function aircraftPrice(payloadTonnes) {
  const tonnage = Number(payloadTonnes);
  if (!Number.isFinite(tonnage) || tonnage <= 0) return MIN_AIRCRAFT_PRICE;

  return Math.max(MIN_AIRCRAFT_PRICE, Math.round(tonnage * AIRCRAFT_PRICE_PER_TONNE));
}

/**
 * The cargo's own contribution: the square root of a country's trade in that good, so
 * the ranking between goods is kept while the gap between the biggest exporter and the
 * smallest is not.
 */
export function cargoBonus(cargoValueK) {
  const value = Number(cargoValueK);

  if (!Number.isFinite(value) || value <= 0) return 0;

  return Math.min(CARGO_BONUS_CAP, Math.round(Math.sqrt(value)));
}

/**
 * Settles a completed voyage.
 *
 * `lossRoll` is the die: a value in 0..100, and cargo is hit when it comes in under the
 * loss risk Security Systems has reduced. `realTrade` marks a load that is a genuine
 * export/import pair for the route, which pays the reality bonus on top of the freight.
 * Tests pass both explicitly; the UI lets the roll default to a real one.
 */
export function resolveVoyage({ cargoValueK, distanceKm, research, lossRoll = Math.random() * 100, realTrade = false, air = false }) {
  const distance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const airborne = Boolean(air);
  // The long-haul premium is an ocean thing: it rewards sailing further, and an air route
  // is priced off its own (much shorter) direct distance, so it never earns it.
  const longHaul = airborne ? 1 : longHaulMultiplier(distance);
  const freight =
    Math.round(distance * FREIGHT_PER_KM * (airborne ? AIR_FREIGHT_SHARE : longHaul)) +
    Math.round(cargoBonus(cargoValueK) * (airborne ? AIR_CARGO_SHARE : 1));
  const bonus = realTrade ? Math.round(freight * REAL_TRADE_BONUS_SHARE) : 0;
  const gross = Math.round((freight + bonus) * rewardMultiplier(research));
  const lost = Number.isFinite(lossRoll) && lossRoll < lossRiskPercent(research);
  const lostAmount = lost ? Math.round(gross * VOYAGE_LOSS_SHARE) : 0;

  return {
    distanceKm: distance,
    durationMs: airborne
      ? airVoyageDurationMs(distance, voyageDurationMultiplier(research))
      : voyageDurationMs(distance, voyageDurationMultiplier(research)),
    air: airborne,
    realTrade: Boolean(realTrade),
    /** How much the length of the route scaled the per-km freight: 1 for a short hop. */
    longHaul,
    /** Freight plus cargo bonus, before the reality bonus and research. */
    freight,
    bonus,
    gross,
    lost,
    lostAmount,
    points: researchPointsForVoyage(distance),
    reward: gross - lostAmount,
  };
}
