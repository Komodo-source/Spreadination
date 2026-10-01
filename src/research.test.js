import {
  EMPTY_RESEARCH,
  MAX_TECH_LEVEL,
  PORT_TECHNOLOGIES,
  berthClass,
  canBerth,
  investedPoints,
  lossRiskPercent,
  nextLevelCost,
  researchPointsForVoyage,
  rewardMultiplier,
  techLevel,
  vesselClass,
  voyageDurationMultiplier,
} from './Research';
import {
  CARGO_BONUS_CAP,
  FREIGHT_PER_KM,
  LONG_HAUL_BONUS_SHARE,
  LONG_HAUL_FULL_DISTANCE_KM,
  MIN_HULL_PRICE,
  REAL_TRADE_BONUS_SHARE,
  cargoBonus,
  hullPrice,
  longHaulMultiplier,
  resolveVoyage,
} from './voyage';
import { VOYAGE_FULL_DISTANCE_KM } from './geo';
import ports from './assets/ports.json';
import vessels from './assets/vessels.json';

// Lengths from assets/vessels.json, which only ever ships hulls of 152 m and up.
const LARGE_HULL = 489;
const COASTAL_HULL = 80;

describe('research levels', () => {
  it('starts every technology at zero', () => {
    for (const technology of PORT_TECHNOLOGIES) {
      expect(techLevel(EMPTY_RESEARCH, technology.id)).toBe(0);
    }
  });

  it('clamps stored levels into range, including junk values', () => {
    expect(techLevel({ cranes: 99 }, 'cranes')).toBe(MAX_TECH_LEVEL);
    expect(techLevel({ cranes: -4 }, 'cranes')).toBe(0);
    expect(techLevel({ cranes: 'two' }, 'cranes')).toBe(0);
    expect(techLevel(undefined, 'cranes')).toBe(0);
    expect(techLevel({ cranes: 1.9 }, 'cranes')).toBe(1);
  });

  it('prices the next level from the technology table and stops at the cap', () => {
    const dredging = PORT_TECHNOLOGIES.find((entry) => entry.id === 'dredging');

    expect(nextLevelCost(EMPTY_RESEARCH, 'dredging')).toBe(dredging.costs[0]);
    expect(nextLevelCost({ dredging: 1 }, 'dredging')).toBe(dredging.costs[1]);
    expect(nextLevelCost({ dredging: 2 }, 'dredging')).toBe(dredging.costs[2]);
    expect(nextLevelCost({ dredging: MAX_TECH_LEVEL }, 'dredging')).toBeNull();
    expect(nextLevelCost(EMPTY_RESEARCH, 'sorcery')).toBeNull();
  });

  it('sums what has already been spent', () => {
    expect(investedPoints(EMPTY_RESEARCH)).toBe(0);
    expect(investedPoints({ cranes: 2 })).toBe(PORT_TECHNOLOGIES.find((t) => t.id === 'cranes').costs[0] + PORT_TECHNOLOGIES.find((t) => t.id === 'cranes').costs[1]);
  });
});

describe('berths and hulls', () => {
  it('classes hulls by length, the way the port dictionary does', () => {
    expect(vesselClass(COASTAL_HULL)).toBe('S');
    expect(vesselClass(120)).toBe('M');
    expect(vesselClass(152)).toBe('L');
    expect(vesselClass(LARGE_HULL)).toBe('L');
    expect(vesselClass(undefined)).toBeNull();
  });

  it("reads capacity from the port's own max-vessel size, not just the harbor band", () => {
    // A port banded V by harbor size that really takes large cargo must berth the fleet —
    // the band is a label, MAX_VESSEL is what the harbor actually handles.
    expect(canBerth({ HARBORSIZE: 'V', MAX_VESSEL: 'L' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(true);
    expect(canBerth({ HARBORSIZE: 'V', MAX_VESSEL: 'S' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(false);
    // A blank MAX_VESSEL falls back to the band.
    expect(canBerth({ HARBORSIZE: 'M', MAX_VESSEL: '' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(true);
    expect(canBerth({ HARBORSIZE: 'V', MAX_VESSEL: '' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(false);
    // A port with no capacity recorded at all takes nothing.
    expect(canBerth({ HARBORSIZE: '' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(false);
  });

  it('lets a large port take large hulls before any research', () => {
    expect(canBerth({ HARBORSIZE: 'L' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(true);
    expect(canBerth({ HARBORSIZE: 'M' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(true);
    expect(canBerth({ HARBORSIZE: 'S' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(false);
    expect(canBerth({ HARBORSIZE: 'V' }, LARGE_HULL, EMPTY_RESEARCH)).toBe(false);
  });

  it('takes coastal freight at every berth', () => {
    for (const HARBORSIZE of ['V', 'S', 'M', 'L']) {
      expect(canBerth({ HARBORSIZE }, COASTAL_HULL, EMPTY_RESEARCH)).toBe(true);
    }
  });

  it('promotes berths one class per dredging level', () => {
    expect(berthClass({ HARBORSIZE: 'S' }, EMPTY_RESEARCH)).toBe('S');
    expect(berthClass({ HARBORSIZE: 'S' }, { dredging: 1 })).toBe('M');
    expect(berthClass({ HARBORSIZE: 'S' }, { dredging: 2 })).toBe('L');
    expect(berthClass({ HARBORSIZE: 'V' }, { dredging: 3 })).toBe('L');
    expect(berthClass({ HARBORSIZE: 'L' }, { dredging: 3 })).toBe('L');
    expect(berthClass({ HARBORSIZE: '' }, EMPTY_RESEARCH)).toBeNull();
  });

  it('lets a dredged small port berth the fleet', () => {
    // One class of leniency is built in, so an S-class berth takes a 489 m hull after a
    // single level of dredging, while the smallest berths need two.
    expect(canBerth({ HARBORSIZE: 'S' }, LARGE_HULL, { dredging: 1 })).toBe(true);
    expect(canBerth({ HARBORSIZE: 'V' }, LARGE_HULL, { dredging: 1 })).toBe(false);
    expect(canBerth({ HARBORSIZE: 'V' }, LARGE_HULL, { dredging: 2 })).toBe(true);
  });

  it('ships a cheap coastal test boat that can sail almost anywhere', () => {
    // The catalog is otherwise all large hulls; this is the simple starter that makes
    // travel work from the first port, so both halves of that have to stay true.
    const boat = vessels.find((vessel) => vesselClass(vessel.length) === 'S');

    expect(boat).toBeDefined();
    expect(hullPrice(boat.gt)).toBe(MIN_HULL_PRICE);
    expect(ports.filter((port) => canBerth(port, boat.length, EMPTY_RESEARCH)).length).toBeGreaterThan(3000);
  });

  it('puts most of the real map within reach of the all-large fleet', () => {
    // The old harbor-band rule reached 522 of these ports; the normalised one reaches
    // thousands, and dredging still unlocks the smallest harbors on top.
    const base = ports.filter((port) => canBerth(port, LARGE_HULL, EMPTY_RESEARCH)).length;

    expect(base).toBeGreaterThan(2000);
    expect(base).toBeLessThan(ports.length);
    expect(ports.filter((port) => canBerth(port, LARGE_HULL, { dredging: 3 })).length).toBeGreaterThan(base);
  });
});

describe('technology effects', () => {
  it('shortens voyages with Automated Cranes', () => {
    expect(voyageDurationMultiplier(EMPTY_RESEARCH)).toBe(1);
    expect(voyageDurationMultiplier({ cranes: 3 })).toBeCloseTo(0.7, 6);
  });

  it('raises revenue with Warehouse Expansion', () => {
    expect(rewardMultiplier(EMPTY_RESEARCH)).toBe(1);
    expect(rewardMultiplier({ warehouses: 3 })).toBeCloseTo(1.36, 6);
  });

  it('cuts cargo loss risk with Security Systems, down to none', () => {
    expect(lossRiskPercent(EMPTY_RESEARCH)).toBe(15);
    expect(lossRiskPercent({ security: 1 })).toBe(10);
    expect(lossRiskPercent({ security: MAX_TECH_LEVEL })).toBe(0);
    expect(lossRiskPercent({ security: MAX_TECH_LEVEL + 1 })).toBe(0);
  });
});

describe('research points', () => {
  it('pays by distance, floored and capped', () => {
    expect(researchPointsForVoyage(0)).toBe(0);
    expect(researchPointsForVoyage(500)).toBe(4);
    expect(researchPointsForVoyage(2500)).toBe(10);
    expect(researchPointsForVoyage(20000)).toBe(30);
  });
});

describe('voyage economy', () => {
  it('prices a hull against the money the rest of the game uses', () => {
    expect(hullPrice(90000)).toBe(900);
    expect(hullPrice(499167)).toBe(4992);
    expect(hullPrice(0)).toBe(250);
  });

  it('caps the cargo bonus so the biggest exporter is not a money printer', () => {
    expect(cargoBonus(179313004)).toBe(CARGO_BONUS_CAP);
    expect(cargoBonus(400)).toBe(20);
    expect(cargoBonus(0)).toBe(0);
  });

  it('pays freight by distance plus a capped cargo bonus', () => {
    const outcome = resolveVoyage({ cargoValueK: 100000, distanceKm: 5000, research: EMPTY_RESEARCH, lossRoll: 99 });

    expect(outcome.lost).toBe(false);
    expect(outcome.reward).toBe(3000 + 316); // round(5000 * 0.6) + min(400, round(sqrt(100000)))
    expect(outcome.durationMs).toBe(59047); // the curve's middle, not a linear rate
    expect(outcome.points).toBe(20);
  });

  it('pays a premium for the longest ocean legs', () => {
    const mid = resolveVoyage({ cargoValueK: 0, distanceKm: VOYAGE_FULL_DISTANCE_KM, research: EMPTY_RESEARCH, lossRoll: 99 });
    const far = resolveVoyage({ cargoValueK: 0, distanceKm: LONG_HAUL_FULL_DISTANCE_KM, research: EMPTY_RESEARCH, lossRoll: 99 });

    expect(longHaulMultiplier(VOYAGE_FULL_DISTANCE_KM)).toBe(1);
    expect(mid.longHaul).toBe(1);
    expect(far.longHaul).toBeCloseTo(1 + LONG_HAUL_BONUS_SHARE, 6);
    // The freight is the base per-km rate scaled by the premium, so the far port pays
    // proportionally more than the same distance at the mid rate.
    expect(far.freight).toBe(Math.round(LONG_HAUL_FULL_DISTANCE_KM * FREIGHT_PER_KM * (1 + LONG_HAUL_BONUS_SHARE)));
    expect(far.freight).toBeGreaterThan(Math.round(LONG_HAUL_FULL_DISTANCE_KM * FREIGHT_PER_KM));
  });

  it('pays the reality bonus only for a load the two countries really trade', () => {
    const plain = resolveVoyage({ cargoValueK: 0, distanceKm: 5000, research: EMPTY_RESEARCH, lossRoll: 99 });
    const real = resolveVoyage({
      cargoValueK: 0,
      distanceKm: 5000,
      research: EMPTY_RESEARCH,
      lossRoll: 99,
      realTrade: true,
    });

    expect(plain.realTrade).toBe(false);
    expect(plain.bonus).toBe(0);
    expect(real.realTrade).toBe(true);
    expect(real.bonus).toBe(Math.round(real.freight * REAL_TRADE_BONUS_SHARE));
    expect(real.reward).toBeGreaterThan(plain.reward);
    expect(real.reward - plain.reward).toBe(real.bonus);
  });

  it('keeps the delivery above the old millions-per-hop payout', () => {
    const outcome = resolveVoyage({ cargoValueK: 179313004, distanceKm: 3000, research: EMPTY_RESEARCH, lossRoll: 99 });

    expect(outcome.reward).toBeLessThan(3000);
    expect(outcome.reward).toBeGreaterThan(2000);
  });

  it('shortens the trip and raises the pay with research', () => {
    const base = resolveVoyage({ cargoValueK: 0, distanceKm: 10000, research: EMPTY_RESEARCH, lossRoll: 99 });
    const researched = resolveVoyage({ cargoValueK: 0, distanceKm: 10000, research: { cranes: 3, warehouses: 3 }, lossRoll: 99 });

    expect(researched.durationMs).toBe(49755);
    expect(researched.durationMs).toBeLessThan(base.durationMs);
    expect(researched.reward).toBeCloseTo(base.reward * 1.36, 0);
  });

  it('loses a quarter of the delivery when the cargo is hit', () => {
    const safe = resolveVoyage({ cargoValueK: 0, distanceKm: 5000, research: EMPTY_RESEARCH, lossRoll: 99 });
    const hit = resolveVoyage({ cargoValueK: 0, distanceKm: 5000, research: EMPTY_RESEARCH, lossRoll: 5 });

    expect(hit.lost).toBe(true);
    expect(hit.lostAmount).toBe(Math.round(safe.gross * 0.25));
    expect(hit.reward).toBe(safe.gross - hit.lostAmount);
  });

  it('makes a hit impossible once Security Systems is maxed', () => {
    const outcome = resolveVoyage({ cargoValueK: 0, distanceKm: 5000, research: { security: 3 }, lossRoll: 0 });

    expect(outcome.lost).toBe(false);
    expect(outcome.lostAmount).toBe(0);
  });
});
