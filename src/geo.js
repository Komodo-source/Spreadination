/**
 * Pure map/game maths shared by the world map and the UI.
 *
 * Nothing here touches Leaflet or React, so it stays unit-testable.
 */

// How long one navigation step takes. The map glides the vessel across each step, so
// the UI and the animation have to agree on this number.
export const NAVIGATION_TICK_MS = 500;

// How a voyage's length is turned into its animated duration.
//
// Distance is still visible in the crossing — a coastal hop is plainly shorter than an
// ocean haul — but a straight km-to-milliseconds rate has two bad ends: everything
// under a few thousand km clamps to the same floor and flashes past, and a 20,000 km
// run sits on the ceiling. `voyageDurationMs` therefore maps distance through a square
// root instead, which spreads the short and middle routes apart and flattens the long
// ones, so the whole game lands in one unhurried band: half a minute for the shortest
// hop, just under a minute in the middle of the curve, and the longest haul on the
// ceiling at 1:15.
//
// These two are the whole speed dial, and they are deliberately slow — a crossing is
// meant to be watched rather than blinked through, and a hull should still be at sea
// after the player has looked away and come back. Halve both to double the fleet's
// speed; `voyageDurationMs` and every readout that quotes it follow automatically.
export const VOYAGE_MIN_DURATION_MS = 30000;
export const VOYAGE_MAX_DURATION_MS = 75000;

/**
 * Air crossings follow the same curve as a voyage but compress it, and they are allowed to
 * drop below the sea floor: a flight is meant to feel obviously quicker than a ship, not
 * to be clamped to the shortest ocean hop. Five times the speed of a hull, with a floor of
 * a few seconds so a short air hop is still watchable rather than instant.
 */
export const AIR_DURATION_MULTIPLIER = 0.2;
export const AIR_MIN_DURATION_MS = 8000;

/** Distance at which the curve reaches its ceiling: the longest realistic haul. */
export const VOYAGE_FULL_DISTANCE_KM = 12000;

/** How many points a route is sampled into before it is drawn. */
export const GREAT_CIRCLE_STEPS = 96;

/**
 * How far ahead of the vessel its heading is measured, as a percentage of the route.
 * Small enough to follow the curve of a great circle, large enough that rounding in the
 * sampled positions cannot flip the triangle around.
 */
export const HEADING_LOOKAHEAD_PERCENT = 0.6;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Ports in assets/ports.json store coordinates as strings using European decimal
 * notation ("43,866667") for 3567 of the 3630 entries. `Number("43,866667")` and
 * therefore `L.latLng("43,866667", ...)` both give NaN, and `"43,866667" + 0.5`
 * silently concatenates into "43,8666670.5", so every consumer must normalise first.
 */
export function parseCoordinate(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== 'string') {
    return NaN;
  }

  return Number.parseFloat(value.trim().replace(',', '.'));
}

/**
 * Returns a point's [latitude, longitude] as numbers.
 *
 * Ports (LATITUDE/LONGITUDE) are the default; airports (latitude_deg/longitude_deg) must be
 * asked for by name. Callers that omit the type are all passing ports, so defaulting here
 * keeps `toLatLng(port)` numeric instead of returning undefined.
 */
export function toLatLng(port, type = 'port') {
  switch (type) {
    case 'airport':
      return [parseCoordinate(port?.latitude_deg), parseCoordinate(port?.longitude_deg)];
    case 'port':
    default:
      return [parseCoordinate(port?.LATITUDE), parseCoordinate(port?.LONGITUDE)];
  }
}

/**
 * Position of a vessel `progress` percent of the way along a route, as the crow flies.
 * Kept strictly numeric so Leaflet never receives a string.
 *
 * This is the fallback for the great-circle version below: straight lat/lng interpolation
 * across an ocean would run over land, but it is exactly right for a route that has no
 * length to speak of (the two ports are the same point, or antipodal, where the great
 * circle is degenerate anyway).
 */
export function interpolatePosition(fromPort, toPort, progress) {
  const [fromLat, fromLng] = toLatLng(fromPort);
  const [toLat, toLng] = toLatLng(toPort);
  const ratio = Math.min(Math.max(progress, 0), 100) / 100;

  return [fromLat + (toLat - fromLat) * ratio, fromLng + (toLng - fromLng) * ratio];
}

// ---------------------------------------------------------------------------
// Great-circle routing
//
// A straight line in lat/lng is not a ship's course: Rotterdam to Tokyo drawn that way
// runs across Europe and Central Asia. Sampling the great circle instead puts the route
// where a vessel would actually sail — but it has to be split where it crosses the
// +/-180 seam, because Leaflet cannot draw a path that wraps.
// ---------------------------------------------------------------------------

function toVector(latitude, longitude) {
  const phi = toRadians(latitude);
  const lambda = toRadians(longitude);
  const cosPhi = Math.cos(phi);

  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
}

function fromVector([x, y, z]) {
  const length = Math.hypot(x, y, z) || 1;

  return [toDegrees(Math.asin(clamp(z / length, -1, 1))), toDegrees(Math.atan2(y / length, x / length))];
}

/**
 * Spherical linear interpolation between two unit vectors. Returns null when the two
 * points coincide or are antipodal, where the interpolated path is undefined.
 */
function slerpVector(from, to, ratio) {
  const dot = clamp(from[0] * to[0] + from[1] * to[1] + from[2] * to[2], -1, 1);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (!Number.isFinite(omega) || Math.abs(sinOmega) < 1e-9) {
    return null;
  }

  const fromWeight = Math.sin((1 - ratio) * omega) / sinOmega;
  const toWeight = Math.sin(ratio * omega) / sinOmega;

  return [
    from[0] * fromWeight + to[0] * toWeight,
    from[1] * fromWeight + to[1] * toWeight,
    from[2] * fromWeight + to[2] * toWeight,
  ];
}

function finitePort(port) {
  const [latitude, longitude] = toLatLng(port);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

/**
 * Position of a vessel `progress` percent of the way along a route, measured by distance
 * rather than by point count, so a long leg takes longer to cross than a short one.
 *
 * Sea routes are polylines (see seaRoute.js), and their vertices are not evenly spaced, so
 * stepping through them by index would make the vessel crawl through corners and sprint
 * along the straights. Returns null for an empty path, which callers treat as "no route".
 *
 * Longitude is unwrapped inside a leg before interpolating and normalised again afterwards: a
 * leg that crosses the antimeridian runs from 179 E to 179 W, and averaging the two would put
 * the vessel in the middle of the Atlantic.
 */
export function interpolateRoutePosition(points, progress) {
  if (!Array.isArray(points) || points.length === 0) return null;

  const first = points[0];

  if (points.length === 1) {
    return [Number(first[0]), Number(first[1])];
  }

  const ratio = clamp(Number.isFinite(progress) ? progress : 0, 0, 100) / 100;
  const lastPoint = points[points.length - 1];

  // The ends are returned exactly, so a voyage starts on the departure port and lands on the
  // arrival port rather than a rounding error offshore.
  if (ratio <= 0) return [Number(first[0]), Number(first[1])];
  if (ratio >= 1) return [Number(lastPoint[0]), Number(lastPoint[1])];

  const legs = [];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const [fromLat, fromLng] = points[index - 1];
    const [toLat, toLng] = points[index];
    const length = haversineKm(Number(fromLat), Number(fromLng), Number(toLat), Number(toLng));

    legs.push(length);
    total += length;
  }

  if (!(total > 0)) {
    return [Number(first[0]), Number(first[1])];
  }

  let remaining = total * ratio;

  for (let index = 0; index < legs.length; index += 1) {
    const last = index === legs.length - 1;

    if (remaining > legs[index] && !last) {
      remaining -= legs[index];
      continue;
    }

    const [fromLat, fromLng] = points[index];
    const [toLat, toLng] = points[index + 1];
    const along = legs[index] > 0 ? clamp(remaining / legs[index], 0, 1) : 0;
    let deltaLng = Number(toLng) - Number(fromLng);

    if (deltaLng > 180) deltaLng -= 360;
    if (deltaLng < -180) deltaLng += 360;

    const longitude = Number(fromLng) + deltaLng * along;

    return [
      Number(fromLat) + (Number(toLat) - Number(fromLat)) * along,
      // Only a longitude that actually ran off the end of the world is wrapped: the modular
      // arithmetic costs precision, and a vessel that jumps from 4.15 to 4.1499999 looks like
      // a rounding bug wherever the value is shown.
      longitude > 180 || longitude < -180
        ? (((longitude + 540) % 360) + 360) % 360 - 180
        : longitude,
    ];
  }

  return [Number(lastPoint[0]), Number(lastPoint[1])];
}

/** Web Mercator y for a latitude, the axis Leaflet actually draws, in radians. */
function mercatorY(latitude) {
  return Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2));
}

/**
 * The direction of a course as it is drawn on the map, in degrees clockwise from north.
 *
 * Leaflet projects with Web Mercator, so a constant *true* bearing still bends on screen
 * away from the equator; measuring the angle in Mercator space is what makes the vessel
 * triangle lie along the route line at every latitude. Returns null when there is no
 * direction to speak of (the same point twice), which callers treat as "keep the last
 * heading".
 */
export function mapHeadingDegrees(fromPoint, toPoint) {
  const from = Array.isArray(fromPoint) ? fromPoint : [NaN, NaN];
  const to = Array.isArray(toPoint) ? toPoint : [NaN, NaN];
  const [fromLat, fromLng] = from.map(Number);
  const [toLat, toLng] = to.map(Number);

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return null;
  }

  const deltaY = mercatorY(toLat) - mercatorY(fromLat);
  // Longitude has to be in the same unit as the Mercator y above - radians, since
  // Leaflet's x is R * lambda while y is R * ln(tan(...)) - or a north-east course comes
  // out nearly due east.
  //
  // It also wraps at the antimeridian: a course from 179 E to 179 W runs 2 degrees east,
  // not 358 west.
  let deltaX = toRadians(toLng) - toRadians(fromLng);
  if (deltaX > Math.PI) deltaX -= 2 * Math.PI;
  if (deltaX < -Math.PI) deltaX += 2 * Math.PI;

  if (Math.abs(deltaX) < 1e-12 && Math.abs(deltaY) < 1e-12) {
    return null;
  }

  return toDegrees(Math.atan2(deltaX, deltaY));
}

/** The great-circle route between two ports, sampled into `steps` + 1 points. */
export function greatCirclePoints(fromPort, toPort, steps = GREAT_CIRCLE_STEPS) {
  const count = Math.max(2, Math.trunc(steps));
  const from = finitePort(fromPort);
  const to = finitePort(toPort);

  if (!from || !to) {
    return [];
  }

  const points = [];

  for (let index = 0; index <= count; index += 1) {
    const ratio = index / count;
    const point = slerpVector(toVector(from[0], from[1]), toVector(to[0], to[1]), ratio);

    points.push(point ? fromVector(point) : interpolatePosition(fromPort, toPort, ratio * 100));
  }

  points[0] = from;
  points[count] = to;

  return points;
}

/**
 * Breaks a route at the antimeridian. Leaflet draws a polyline from one point to the
 * next directly, so a route that crosses the seam would otherwise be painted as a line
 * straight back across the whole map. Every returned run has at least two points.
 */
export function splitAtAntimeridian(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const segments = [];
  let current = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];

    if (Math.abs(point[1] - previous[1]) > 180) {
      segments.push(current);
      current = [point];
    } else {
      current.push(point);
    }
  }

  segments.push(current);

  return segments.filter((segment) => segment.length > 1);
}

/**
 * How long a voyage from a given distance takes to animate. `multiplier` is where
 * Automated Cranes shorten the trip.
 *
 * The curve is `min + (max - min) * sqrt(distance / full)`: at 1,000 km the crossing is
 * about 43 s, at 5,000 km about 59 s, and from 12,000 km on it sits on the 75 s ceiling.
 * A cranes multiplier scales the curve itself, so it shortens crossings that still have
 * room to shrink rather than being swallowed by the floor.
 */
export function voyageDurationMs(distanceKm, multiplier = 1) {
  const distance = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const factor = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const span = Math.min(1, Math.sqrt(distance / VOYAGE_FULL_DISTANCE_KM));
  const curved = VOYAGE_MIN_DURATION_MS + (VOYAGE_MAX_DURATION_MS - VOYAGE_MIN_DURATION_MS) * span;

  return Math.min(VOYAGE_MAX_DURATION_MS, Math.max(VOYAGE_MIN_DURATION_MS, Math.round(curved * factor)));
}

/**
 * How long a flight takes to animate: the same distance curve as `voyageDurationMs`,
 * compressed by AIR_DURATION_MULTIPLIER and floored at AIR_MIN_DURATION_MS instead of the
 * ship floor, so an air route is always the faster option. `multiplier` is where Automated
 * Cranes shorten the trip, as it does at sea.
 */
export function airVoyageDurationMs(distanceKm, multiplier = 1) {
  const distance = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const factor = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const span = Math.min(1, Math.sqrt(distance / VOYAGE_FULL_DISTANCE_KM));
  const curved = VOYAGE_MIN_DURATION_MS + (VOYAGE_MAX_DURATION_MS - VOYAGE_MIN_DURATION_MS) * span;

  return Math.max(AIR_MIN_DURATION_MS, Math.round(curved * AIR_DURATION_MULTIPLIER * factor));
}

/**
 * A voyage's time as mm:ss. Shared by the planner's crossing estimate and the fleet's
 * live ETA readout so the two never quote different numbers for the same trip.
 */
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Great-circle distance in kilometres. */
export function haversineKm(fromLat, fromLng, toLat, toLng) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const fromLatRad = toRadians(fromLat);
  const toLatRad = toRadians(toLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(fromLatRad) * Math.cos(toLatRad);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Great-circle distance between two ports in kilometres. */
export function portDistanceKm(fromPort, toPort) {
  const [fromLat, fromLng] = toLatLng(fromPort);
  const [toLat, toLng] = toLatLng(toPort);

  return haversineKm(fromLat, fromLng, toLat, toLng);
}

// Zoom levels at which the border detail swaps. The gap between the two keeps a player
// who is hovering on the threshold from thrashing between the two layers.
export const DETAIL_ZOOM = { in: 5, out: 3 };

/**
 * Whether the detailed borders should be shown. Stays detailed all the way down to
 * DETAIL_ZOOM.out once the player has zoomed in, instead of flickering at a single level.
 */
export function shouldShowDetailedBorders(isDetailed, zoom) {
  return isDetailed ? zoom > DETAIL_ZOOM.out : zoom >= DETAIL_ZOOM.in;
}
