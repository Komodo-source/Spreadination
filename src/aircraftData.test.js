import {
  AIRCRAFT_CATALOG,
  AIRCRAFT_ID_BASE,
  AIRPORTS,
  airRoute,
  aircraftById,
} from './aircraftData';
import { EMPTY_RESEARCH } from './Research';
import { vesselById } from './vesselData';
import { MIN_AIRCRAFT_PRICE, hullPrice, resolveVoyage } from './voyage';

describe('aircraft catalog', () => {
  it('gives every aircraft a unique offset id the ownership path can carry', () => {
    const ids = AIRCRAFT_CATALOG.map((plane) => plane.id_vessel);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toBeGreaterThanOrEqual(AIRCRAFT_ID_BASE));

    // The fleet catalog resolves both hulls and aircraft, so an owned aircraft joined from
    // the backend lands on the same record the planner offers.
    AIRCRAFT_CATALOG.forEach((plane) => expect(vesselById(plane.id_vessel)).toBe(plane));
  });

  it('resolves an unknown aircraft id to null', () => {
    expect(aircraftById(999999)).toBeNull();
    expect(aircraftById(undefined)).toBeNull();
  });

  it('prices aircraft well above the dearest hull', () => {
    const dearestHull = hullPrice(499167);

    AIRCRAFT_CATALOG.forEach((plane) => {
      expect(plane.price).toBeGreaterThanOrEqual(MIN_AIRCRAFT_PRICE);
      // Roughly an order of magnitude more than a comparable ship, per the design brief.
      expect(plane.price).toBeGreaterThan(dearestHull * 2);
    });
  });

  it('normalises airports onto the port field names routing already uses', () => {
    expect(AIRPORTS.length).toBeGreaterThan(0);

    const airport = AIRPORTS[0];
    expect(Number.isFinite(airport.LATITUDE)).toBe(true);
    expect(Number.isFinite(airport.LONGITUDE)).toBe(true);
    expect(typeof airport.PORT_NAME).toBe('string');
    expect(airport.COUNTRY).toBe(airport.COUNTRY.toUpperCase());
    expect(airport.kind).toBe('airport');
  });

  it('flies a direct great circle', () => {
    const route = airRoute(AIRPORTS[0], AIRPORTS[1]);

    expect(route.ok).toBe(true);
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.points.length).toBeGreaterThan(1);
  });
});

describe('air voyaging', () => {
  it('is faster and pays less than the same distance by sea', () => {
    const args = { cargoValueK: 0, distanceKm: 5000, research: EMPTY_RESEARCH, lossRoll: 99 };
    const sea = resolveVoyage(args);
    const air = resolveVoyage({ ...args, air: true });

    expect(air.air).toBe(true);
    expect(sea.air).toBe(false);
    expect(air.durationMs).toBeLessThan(sea.durationMs);
    expect(air.reward).toBeLessThan(sea.reward);
  });

  it('never pays the ocean long-haul premium in the air', () => {
    const far = { cargoValueK: 0, distanceKm: 20000, research: EMPTY_RESEARCH, lossRoll: 99 };

    expect(resolveVoyage(far).longHaul).toBeGreaterThan(1);
    expect(resolveVoyage({ ...far, air: true }).longHaul).toBe(1);
  });
});
