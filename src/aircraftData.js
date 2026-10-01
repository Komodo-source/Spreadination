/**
 * The player's aircraft, and the airports a flight runs between.
 *
 * Aircraft are the air counterpart to the hulls in `vessels.json`. The source catalog
 * (`assets/aircraft-database-complete-2025-08.json`) is a list of types, not individual
 * airframes, so it carries no id and no tonnage; both are derived here so an aircraft can
 * be owned through the same `player_vessel` path a ship uses:
 *
 *   - ids start at AIRCRAFT_ID_BASE and run in file order, clear of the 201 vessel ids.
 *     The seed generator (scripts/generate-vessel-port-seed.js) assigns the same ids, so
 *     `player_vessel.vessel_id` has a row to point at. Keep the two in step.
 *   - `gt` (the field the UI renders) is the aircraft's cargo payload in tonnes, taken from
 *     its ICAO class. It is deliberately tiny next to a ship's gross tonnage: an aircraft
 *     moves far less per trip, which is what makes an air delivery pay less.
 *
 * Airports are normalised into the same field names ships' ports use (PORT_NAME, COUNTRY,
 * LATITUDE, LONGITUDE) so the map's voyage overlay, the cargo lookup and the distance
 * maths all work unchanged — only the route differs. A flight has no sea to go around, so
 * it follows the great circle port to port, straight over the land in between.
 */

import aircraft from './assets/aircraft-database-complete-2025-08.json';
import airports from './assets/airports.json';
import { greatCirclePoints, portDistanceKm } from './geo';
import { aircraftPrice } from './voyage';

/**
 * First catalog id handed to an aircraft. Well above the vessel ids (1..201) so the two
 * catalogs never collide, and mirrored in the seed generator.
 */
export const AIRCRAFT_ID_BASE = 10000;

/** Only real airports are flyable: heliports and closed fields are not in the trimmed set. */
const AIRPORT_TYPES = new Set(['large_airport', 'medium_airport']);

/**
 * Payload (tonnes) by ICAO aircraft class, which is the only size signal the catalog
 * carries. The labels feed the UI so a class code never has to be shown raw.
 */
const CLASS_PROFILES = {
  L6J: { payloadTonnes: 250, label: 'Super-heavy freighter' },
  L4J: { payloadTonnes: 100, label: 'Heavy freighter' },
  L4T: { payloadTonnes: 100, label: 'Heavy turboprop' },
  L3J: { payloadTonnes: 80, label: 'Large freighter' },
  L2J: { payloadTonnes: 45, label: 'Narrow-body freighter' },
  L2T: { payloadTonnes: 16, label: 'Regional turboprop' },
  L1T: { payloadTonnes: 8, label: 'Light utility aircraft' },
};

const DEFAULT_PROFILE = { payloadTonnes: 30, label: 'Freighter' };

/** The profile for an aircraft's ICAO class, falling back for the unrated rows. */
export function aircraftProfile(plane) {
  return CLASS_PROFILES[plane?.aircraftClass] ?? DEFAULT_PROFILE;
}

/** The aircraft's cargo payload in tonnes. */
export function aircraftPayload(plane) {
  return aircraftProfile(plane).payloadTonnes;
}

/**
 * The aircraft catalog, shaped like a vessel row so the ownership, fleet and dispatch code
 * can hold hulls and aircraft in the same list and tell them apart by `kind`.
 */
export const AIRCRAFT_CATALOG = aircraft.map((plane, index) => {
  const profile = aircraftProfile(plane);
  const payloadTonnes = profile.payloadTonnes;

  return {
    ...plane,
    id_vessel: AIRCRAFT_ID_BASE + index,
    kind: 'aircraft',
    // Vessel-shaped aliases, so a shared list can fall back on the same field names.
    Company_Name: plane.model,
    ship_name: profile.label,
    gt: payloadTonnes,
    payloadTonnes,
    classLabel: profile.label,
    price: aircraftPrice(payloadTonnes),
  };
});

const AIRCRAFT_BY_ID = new Map(AIRCRAFT_CATALOG.map((plane) => [plane.id_vessel, plane]));

/** A catalog aircraft by its id, or null. */
export function aircraftById(id) {
  return AIRCRAFT_BY_ID.get(id) ?? null;
}

/**
 * Every flyable airport, with the field names the voyage code already expects. Airports
 * are public infrastructure: unlike a port, nobody owns one, so a flight can start
 * anywhere you can afford to send the aircraft from.
 */
export const AIRPORTS = airports
  .filter((airport) => AIRPORT_TYPES.has(airport.type))
  .map((airport) => {
    const latitude = Number(airport.latitude_deg);
    const longitude = Number(airport.longitude_deg);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      ...airport,
      kind: 'airport',
      // The voyage overlay keys its route line off id_port, so airports get one too.
      id_port: `airport-${airport.id}`,
      PORT_NAME: airport.name,
      COUNTRY: String(airport.iso_country || '').toUpperCase(),
      LATITUDE: latitude,
      LONGITUDE: longitude,
    };
  })
  .filter(Boolean);

const AIRPORT_BY_ID = new Map(AIRPORTS.map((airport) => [airport.id, airport]));

/** A flyable airport by its OurAirports id, or null. */
export function airportById(id) {
  return AIRPORT_BY_ID.get(id) ?? null;
}

/**
 * The great-circle route for a flight: port to port in a straight line over whatever lies
 * between. There is no water search, so a flight crosses continents where a ship detours
 * around them — which is exactly why the same pair of cities is a much shorter trip by air.
 */
export function airRoute(fromAirport, toAirport) {
  const points = greatCirclePoints(fromAirport, toAirport);

  if (points.length < 2) {
    return { distanceKm: 0, ok: false, points: [] };
  }

  return { distanceKm: portDistanceKm(fromAirport, toAirport), ok: true, points };
}

/** The direct distance between two airports, in kilometres. */
export function airDistanceKm(fromAirport, toAirport) {
  return portDistanceKm(fromAirport, toAirport);
}
