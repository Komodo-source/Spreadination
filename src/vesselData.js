/**
 * The player's fleet: the backend's ownership rows joined to the vessel catalog.
 *
 * `public.player_vessel` holds one row per hull the player owns and the API hands back
 * the vessel ids in it — the hull's own data (name, class, tonnage, dimensions) is the
 * catalog both sides share. Doing the join in one place means the Fleet directory and the
 * navigation panel always agree about what is owned.
 */

import vessels from './assets/vessels.json';
import * as api from './api';
import { AIRCRAFT_CATALOG } from './aircraftData';

/**
 * Every transport the player can own, hulls and aircraft together. Aircraft are tagged
 * `kind: 'aircraft'` (see aircraftData.js) and live in the same map because the backend's
 * `player_vessel` rows are one id space; the callers branch on `kind` where the two differ.
 */
export const VESSEL_CATALOG = new Map(
  [...vessels, ...AIRCRAFT_CATALOG].map((vessel) => [vessel.id_vessel, vessel])
);

/** A catalog hull by its id, or null. */
export function vesselById(id) {
  return VESSEL_CATALOG.get(id) ?? null;
}

/**
 * The simple coastal hull every player is given, so a new game can sail without having to
 * buy a ship first. It is an ordinary catalog entry (id 201): class S and at the price
 * floor, which is what makes it fit nearly every berth on the map.
 */
export const STARTER_VESSEL_ID = 201;

export const STARTER_VESSEL = vesselById(STARTER_VESSEL_ID);

/**
 * Every vessel the signed-in player owns, in the order the backend lists them. Resolves to
 * an empty fleet when nobody is signed in, so callers can use it unconditionally.
 */
export async function ownedFleetFromDb() {
  if (!api.isSignedIn()) return [];

  const ownedIds = await api.listVessels();

  return ownedIds.map((id) => vesselById(id)).filter(Boolean);
}
