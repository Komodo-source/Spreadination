import React from 'react';

/**
 * Port research: the four port technologies, what they cost and what they do.
 *
 * Pure data and maths — the Research screen is only presentation, and the voyage
 * economy in voyage.js reads the multipliers from here so the rules live in one
 * place. `research` arguments are the plain `{ technologyId: level }` object that
 * UI.js keeps in state (and in local storage), so every reader normalises levels
 * through `techLevel` instead of trusting what was saved.
 */

/** Levels per technology. Each one has exactly three levels of improvement. */
export const MAX_TECH_LEVEL = 3;

/** A fresh game: every technology at level 0. */
export const EMPTY_RESEARCH = {
  cranes: 0,
  dredging: 0,
  security: 0,
  warehouses: 0,
};

/**
 * The technology table. `costs` are the research-point prices of levels 1..3 in
 * order, and `effectText` describes what the technology does at a given level.
 */
export const PORT_TECHNOLOGIES = [
  {
    id: 'cranes',
    name: 'Automated Cranes',
    summary: 'Robotic loading crews turn vessels around faster, shortening every voyage.',
    costs: [60, 140, 280],
    effectText: (level) =>
      level === 0
        ? 'Not installed — every voyage runs at full length.'
        : `Voyages complete ${10 * level}% faster.`,
  },
  {
    id: 'warehouses',
    name: 'Warehouse Expansion',
    summary: 'Bigger storage lets every port take fuller consignments and charge for them.',
    costs: [50, 110, 220],
    effectText: (level) =>
      level === 0
        ? 'Not installed — freight pays base rates.'
        : `Freight pays ${12 * level}% more on every delivery.`,
  },
  {
    id: 'security',
    name: 'Security Systems',
    summary: 'Seals, guards and trackers keep cargo from disappearing in transit.',
    costs: [40, 90, 180],
    effectText: (level) => {
      if (level === 0) return 'No protection — 15% of runs lose a quarter of the cargo.';
      if (lossRiskPercent({ security: level }) === 0) return 'Cargo losses are impossible.';
      return `Loss risk down to ${lossRiskPercent({ security: level })}%.`;
    },
  },
  {
    id: 'dredging',
    name: 'Deepwater Dredging',
    summary: 'Deeper channels let every port you own take hulls a class larger.',
    costs: [80, 180, 360],
    effectText: (level) =>
      level === 0
        ? 'Not dredged — berths handle their rated hull class only.'
        : `Every berth handles hulls ${level} class${level > 1 ? 'es' : ''} larger.`,
  },
];

/** The technology's level, floored and clamped into 0..MAX_TECH_LEVEL. */
export function techLevel(research, id) {
  const raw = Number(research?.[id]);

  if (!Number.isFinite(raw)) return 0;

  return Math.min(MAX_TECH_LEVEL, Math.max(0, Math.floor(raw)));
}

/**
 * The price of the next level of a technology, or null when it is fully
 * researched — or when the id is not a technology at all.
 */
export function nextLevelCost(research, id) {
  const technology = PORT_TECHNOLOGIES.find((entry) => entry.id === id);

  if (!technology) return null;

  const level = techLevel(research, id);

  return level < MAX_TECH_LEVEL ? technology.costs[level] : null;
}

/** Everything already spent across all technologies. */
export function investedPoints(research) {
  return PORT_TECHNOLOGIES.reduce((total, technology) => {
    const level = techLevel(research, technology.id);

    return total + technology.costs.slice(0, level).reduce((sum, cost) => sum + cost, 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// Technology effects
// ---------------------------------------------------------------------------

/** Automated Cranes: voyages take 10% less time per level. */
export function voyageDurationMultiplier(research) {
  return 1 - 0.1 * techLevel(research, 'cranes');
}

/** Warehouse Expansion: freight pays 12% more per level. */
export function rewardMultiplier(research) {
  return 1 + 0.12 * techLevel(research, 'warehouses');
}

/** Security Systems: 15% base loss risk, minus 5 points per level, floored at 0. */
export function lossRiskPercent(research) {
  return Math.max(0, 15 - 5 * techLevel(research, 'security'));
}

/** Research points earned for a voyage of the given length, floored and capped. */
export const RESEARCH_POINTS_CAP = 30;

export function researchPointsForVoyage(distanceKm) {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? Math.floor(distanceKm) : 0;

  if (km <= 0) return 0;

  // Whichever pays more: a square-root scale, so a short hop still earns a few
  // points, or a flat rate per 250 km for the long haul. The cap stops the
  // longest crossings from trivialising the technology table.
  const bySquareRoot = Math.floor(Math.sqrt(km / 25));
  const byDistance = Math.round(km / 250);

  return Math.min(RESEARCH_POINTS_CAP, Math.max(bySquareRoot, byDistance));
}

// ---------------------------------------------------------------------------
// Berths and hulls
//
// A berth's capacity used to be read from the harbor-size band alone, which is a coarse
// label: 2,125 of the 3,630 ports are banded V, and every hull in the fleet is over
// 152 m, so the whole game was fenced into the 522 ports banded M or L. The port record
// carries the real answer — MAX_VESSEL, the largest hull that harbor actually takes — so
// capacity is read from that field and only falls back to the band when it is blank.
//
// Reach is normalised rather than simply loosened: a hull may still call at a berth one
// class below its own, which puts 2,935 of 3,630 ports in reach from a standing start
// (up from 522). Deepwater Dredging then promotes a berth one class per level, so the
// technology still opens the smallest harbors rather than becoming a flat no-op.
// ---------------------------------------------------------------------------

/** Hull classes by length, matching the port dictionary's size bands. */
const VESSEL_CLASS_LIMITS = [
  { className: 'S', maxLength: 91 },
  { className: 'M', maxLength: 152 },
  { className: 'L', maxLength: Infinity },
];

/** The class a hull of the given length belongs to, or null for unknown lengths. */
export function vesselClass(length) {
  const metres = Number(length);

  if (!Number.isFinite(metres) || metres <= 0) return null;

  return VESSEL_CLASS_LIMITS.find((limit) => metres < limit.maxLength)?.className ?? null;
}

/**
 * Berth capacity, shallowest to deepest, on one scale. MAX_VESSEL only ever uses S/M/L;
 * the harbor-size band adds V for the ports too small to be rated for a cargo hull.
 */
const CAPACITY_CLASSES = ['V', 'S', 'M', 'L'];

/**
 * What a berth can take: the port's own max-vessel size when it is recorded, otherwise
 * its harbor-size band. Null for a port with neither, which nothing can berth at.
 */
function portCapacityClass(port) {
  if (!port) return null;

  if (CAPACITY_CLASSES.includes(port.MAX_VESSEL)) return port.MAX_VESSEL;

  return CAPACITY_CLASSES.includes(port.HARBORSIZE) ? port.HARBORSIZE : null;
}

/**
 * The class of hull a berth can take once Deepwater Dredging is factored in: each level
 * promotes the berth one class, capped at L. Null for a port with no recorded capacity.
 */
export function berthClass(port, research) {
  const base = portCapacityClass(port);

  if (!base) return null;

  const rank = Math.min(
    CAPACITY_CLASSES.length,
    CAPACITY_CLASSES.indexOf(base) + 1 + techLevel(research, 'dredging')
  );

  return CAPACITY_CLASSES[rank - 1];
}

/** How many classes below its own a hull may still be berthed at. */
export const BERTH_LENIENCY_CLASSES = 1;

/**
 * Whether a berth can take a hull of the given length. A hull may use a berth one class
 * smaller than itself, so the fleet is not locked out of every medium harbor. Unknown
 * hulls always fit; a port with no recorded capacity takes nothing.
 */
export function canBerth(port, length, research) {
  const hull = vesselClass(length);

  if (hull === null) return true;

  const berth = berthClass(port, research);

  if (!berth) return false;

  return CAPACITY_CLASSES.indexOf(berth) >= CAPACITY_CLASSES.indexOf(hull) - BERTH_LENIENCY_CLASSES;
}

// ---------------------------------------------------------------------------
// Research Component
// ---------------------------------------------------------------------------

/**
 * Research screen component for purchasing port technology upgrades.
 */
export default function Research({ onBuy, points, research }) {
  return (
    <div className="research">
      <h3>Research</h3>
      <p>
        You have <strong>{points}</strong> research points to spend on
        port technologies.
      </p>

      {PORT_TECHNOLOGIES.map((tech) => {
        const level = techLevel(research, tech.id);
        const cost = nextLevelCost(research, tech.id);
        const isMaxed = level >= MAX_TECH_LEVEL;

        return (
          <div key={tech.id} className="research-tech">
            <h4>{tech.name}</h4>
            <p>{tech.summary}</p>
            <p className="research-effect">{tech.effectText(level)}</p>

            {isMaxed ? (
              <p className="research-maxed">Maximum level reached</p>
            ) : (
              <>
                <p className="research-cost">
                  Cost: <strong>{cost}</strong> points
                </p>
                {points >= cost ? (
                  <button
                    className="research-btn"
                    onClick={() => onBuy(tech.id)}
                    disabled={points < cost}
                  >
                    Upgrade to Level {level + 1}
                  </button>
                ) : (
                  <button className="research-btn" disabled>
                    Not enough points
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
