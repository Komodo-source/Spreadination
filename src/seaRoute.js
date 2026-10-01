/**
 * Sea routing: how a vessel gets from A to B over water, instead of a straight line that
 * cuts across continents.
 *
 * A great circle is the shortest course *over the globe*, not over the ocean: Rotterdam to
 * Tokyo drawn as one crosses Europe and Central Asia, and every route in the game had the
 * same problem. So instead of a formula, this searches. The world is an ocean grid built
 * from the map's own country outlines (see `scripts/build-sea-grid.js`), land is blocked,
 * and a cheapest-first search spreads out from a departure until nothing is left to reach.
 *
 * What the grid guarantees, because it is water-only:
 *
 *   - no canals. Suez, Panama, Kiel and Corinth are blocked, so the Mediterranean is not a
 *     shortcut to the Red Sea and the Atlantic is not one to the Pacific.
 *   - the natural straits stay open, and a strait is a way *through*. The grid is coarse
 *     enough that a passage like the Bosporus or Bab-el-Mandeb would otherwise read as a
 *     wall; the builder clears a box around each real strait, so the Black Sea, the Baltic,
 *     the Persian Gulf and the Red Sea all remain reachable. Where a strait is a long
 *     corridor rather than a doorway — Magellan, the Salish Sea — the build also checks that
 *     a hull can get from one mouth to the other without leaving it, because a strait
 *     blocked in the middle still looks connected the long way round Cape Horn.
 *   - the Great Lakes are a waterway of their own. The country outlines run straight across
 *     them at this scale, so the builder carves the five lakes back out and threads the St.
 *     Lawrence, the Welland, the Detroit and St. Marys rivers and the Straits of Mackinac.
 *     Detroit, Chicago, Duluth and Thunder Bay are sailed to, not joined by a straight line.
 *   - the polar pack ice is not navigable either, so no course runs over the top of the
 *     world, and none threads the straits that cross the central Arctic.
 *
 * The cost of a step is the great-circle distance between the two cells it joins, not one
 * unit per step, so a diagonal is not free and the result is a real shortest course rather
 * than a shortest list of moves. Diagonal steps are only allowed when the two cells sharing
 * that corner are water as well: without that rule the search slides through the
 * single-cell corner where an isthmus would otherwise stop it, which is exactly how a ship
 * ends up crossing Panama.
 *
 * Cell centres make an ugly staircase, so a raw path is straightened afterwards: from each
 * corner, the farthest later point still in plain sight is kept, and everything skipped was
 * reachable without a turn.
 *
 * The search produces a distance *field*, not a route: one run from a departure knows the
 * real sea distance to every cell, and therefore to every port. That is the shape the game
 * needs — the navigation panel prices sixty destinations and quotes the crossing from the
 * same numbers, and a voyage draws the same line it is paid for — where sixty independent
 * searches would cost minutes. Fields are cached a few deep; a departure that falls out is
 * simply recomputed.
 */

import grid from './assets/sea-grid.json';
import { greatCirclePoints, haversineKm, portDistanceKm, toLatLng } from './geo';

const { cellDegrees: CELL_DEGREES, columns: COLUMNS, latStart: LAT_START, lonStart: LON_START, rows: ROWS } =
  grid;

const CELL_COUNT = ROWS * COLUMNS;

/**
 * How far a port may be from open ocean before routing gives up, in cells.
 *
 * Two degrees, and the value is load-bearing. Measured over all 3,630 ports, 46% sit in a
 * cell of water, 93% have ocean water within one cell and 97% within two: a coastal berth, a
 * berth on the far side of a harbour mouth narrower than a cell, or a river port a little way
 * up its estuary. The tail is a different kind of place altogether — the deep river ports
 * (Manaus, Asunción, Hankow) and the high Arctic (Longyearbyen) have no water anywhere near
 * them at this resolution — and allowing a big snap does not find those a route, it invents
 * one: the drawn course would open with a several-hundred-kilometre straight line across a
 * continent to reach the sea, which is the same fiction as a route crossing a continent, only
 * told in one leg. Past this limit the port honestly has no sea route, and the caller is told
 * so (see `directRoute`).
 */
const MAX_SNAP_CELLS = 4;

/** How far one straightening jump may reach, in cells. Bounded so smoothing stays cheap. */
const MAX_PULL_STEP = 48;

/** How many departures' distance fields to keep. Each holds two 260k-cell arrays. */
const FIELD_CACHE_LIMIT = 3;

/** How many port-to-port routes to remember on top of the fields. */
const ROUTE_CACHE_LIMIT = 256;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The land mask, decoded from the packed bitfield the builder emits.
 *
 * Base64 is decoded here rather than through `atob`, which is not reliably present in every
 * environment this module runs in (Node tests included), and the table is only consulted
 * once.
 */
const BASE64_VALUES = (() => {
  const values = new Int8Array(128).fill(-1);

  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    values[BASE64_ALPHABET.charCodeAt(index)] = index;
  }

  return values;
})();

function decodeLand(packed) {
  const land = new Uint8Array(CELL_COUNT);

  let bit = 0;
  let accumulator = 0;
  let bitsInAccumulator = 0;

  for (let index = 0; index < packed.length; index += 1) {
    const value = BASE64_VALUES[packed.charCodeAt(index)];
    if (value < 0) continue;

    accumulator = (accumulator << 6) | value;
    bitsInAccumulator += 6;

    while (bitsInAccumulator >= 8 && bit < CELL_COUNT) {
      bitsInAccumulator -= 8;
      const byte = (accumulator >> bitsInAccumulator) & 0xff;

      for (let offset = 0; offset < 8 && bit < CELL_COUNT; offset += 1) {
        land[bit] = (byte >> (7 - offset)) & 1;
        bit += 1;
      }
    }
  }

  return land;
}

const clampRow = (row) => Math.min(ROWS - 1, Math.max(0, row));
const wrapColumn = (column) => ((column % COLUMNS) + COLUMNS) % COLUMNS;

const rowOf = (latitude) => clampRow(Math.floor((latitude - LAT_START) / CELL_DEGREES));
const columnOf = (longitude) => wrapColumn(Math.floor((longitude - LON_START) / CELL_DEGREES));

/** The centre of a cell, as [latitude, longitude]. */
function cellLatLng(cell) {
  return [
    LAT_START + (Math.floor(cell / COLUMNS) + 0.5) * CELL_DEGREES,
    LON_START + ((cell % COLUMNS) + 0.5) * CELL_DEGREES,
  ];
}

/** The eight steps a route may take, as row / column offsets. */
const D_ROW = new Int8Array([0, 0, 1, -1, 1, 1, -1, -1]);
const D_COLUMN = new Int8Array([1, -1, 0, 0, 1, -1, 1, -1]);

let world = null;

/**
 * The decoded mask plus the per-row step costs, built once on first use, so importing this
 * module costs nothing (the panel may never open, and the tests import it constantly).
 *
 * The great-circle distance between two cells joined by a fixed offset depends only on the
 * row, never on which column the pair sits in — distance is invariant under rotating
 * longitude — so the eight step costs collapse to three numbers per row.
 */
function getWorld() {
  if (world) return world;

  const land = decodeLand(grid.land);
  const costEast = new Float64Array(ROWS);
  const costNorth = new Float64Array(ROWS);
  const costNorthEast = new Float64Array(ROWS);

  for (let row = 0; row < ROWS; row += 1) {
    const latitude = LAT_START + (row + 0.5) * CELL_DEGREES;
    const nextLatitude = Math.min(90, LAT_START + (row + 1.5) * CELL_DEGREES);

    costEast[row] = haversineKm(latitude, 0, latitude, CELL_DEGREES);
    costNorth[row] = haversineKm(latitude, 0, nextLatitude, 0);
    costNorthEast[row] = haversineKm(latitude, 0, nextLatitude, CELL_DEGREES);
  }

  world = {
    costEast,
    costNorth,
    costNorthEast,
    land,
    // Reused between searches. The two arrays a field keeps (`gScore`, `cameFrom`) are
    // allocated per run instead, because a cached field holds them for as long as it lives.
    scratch: {
      closed: new Uint8Array(CELL_COUNT),
      heapNode: new Int32Array(1 << 16),
      heapScore: new Float64Array(1 << 16),
      size: 0,
    },
    snapped: new Map(),
  };

  return world;
}

// ---------------------------------------------------------------------------
// A minimum-heap of (cell, distance). Parallel typed arrays rather than objects, since a
// field pushes and pops one entry per edge it relaxes.
// ---------------------------------------------------------------------------

function heapPush(scratch, node, score) {
  if (scratch.size === scratch.heapNode.length) {
    const nodes = new Int32Array(scratch.heapNode.length * 2);
    const scores = new Float64Array(scratch.heapScore.length * 2);
    nodes.set(scratch.heapNode);
    scores.set(scratch.heapScore);
    scratch.heapNode = nodes;
    scratch.heapScore = scores;
  }

  let child = scratch.size;
  scratch.heapNode[child] = node;
  scratch.heapScore[child] = score;
  scratch.size += 1;

  while (child > 0) {
    const parent = (child - 1) >> 1;
    if (scratch.heapScore[parent] <= scratch.heapScore[child]) break;

    const nodeSwap = scratch.heapNode[parent];
    const scoreSwap = scratch.heapScore[parent];
    scratch.heapNode[parent] = scratch.heapNode[child];
    scratch.heapScore[parent] = scratch.heapScore[child];
    scratch.heapNode[child] = nodeSwap;
    scratch.heapScore[child] = scoreSwap;
    child = parent;
  }
}

function heapPop(scratch) {
  const top = scratch.heapNode[0];
  scratch.size -= 1;

  if (scratch.size > 0) {
    scratch.heapNode[0] = scratch.heapNode[scratch.size];
    scratch.heapScore[0] = scratch.heapScore[scratch.size];

    let parent = 0;
    for (;;) {
      const left = parent * 2 + 1;
      if (left >= scratch.size) break;

      const right = left + 1;
      const smallest =
        right < scratch.size && scratch.heapScore[right] < scratch.heapScore[left] ? right : left;

      if (scratch.heapScore[parent] <= scratch.heapScore[smallest]) break;

      const nodeSwap = scratch.heapNode[parent];
      const scoreSwap = scratch.heapScore[parent];
      scratch.heapNode[parent] = scratch.heapNode[smallest];
      scratch.heapScore[parent] = scratch.heapScore[smallest];
      scratch.heapNode[smallest] = nodeSwap;
      scratch.heapScore[smallest] = scoreSwap;
      parent = smallest;
    }
  }

  return top;
}

/**
 * The nearest water cell to a point, searching outward in rings and preferring the one
 * nearest the point when a ring offers several.
 *
 * Ports sit on coastlines, and a coastline at this resolution is a cell boundary — plenty of
 * ports land squarely in a cell that rasterised as land, especially river ports like Hamburg
 * or Antwerp. Returns null when there is no water within `MAX_SNAP_CELLS`.
 */
function snapToWater(target, land) {
  const [latitude, longitude] = target;
  const row = rowOf(latitude);
  const column = columnOf(longitude);

  if (!land[row * COLUMNS + column]) return row * COLUMNS + column;

  let best = null;
  let bestDistance = Infinity;

  for (let radius = 1; radius <= MAX_SNAP_CELLS; radius += 1) {
    for (let dRow = -radius; dRow <= radius; dRow += 1) {
      const nextRow = row + dRow;
      if (nextRow < 0 || nextRow >= ROWS) continue;

      // Only the ring's edge: its interior was searched on earlier passes.
      const edge = Math.abs(dRow) === radius;

      for (let dColumn = -radius; dColumn <= radius; dColumn += 1) {
        if (!edge && Math.abs(dColumn) !== radius) continue;

        const cell = nextRow * COLUMNS + wrapColumn(column + dColumn);
        if (land[cell]) continue;

        const [cellLat, cellLng] = cellLatLng(cell);
        const distance = haversineKm(latitude, longitude, cellLat, cellLng);

        if (distance < bestDistance) {
          bestDistance = distance;
          best = cell;
        }
      }
    }

    if (best !== null) return best;
  }

  return null;
}

/** Cached snapping, since a port's nearest water cell never changes. */
function waterCellFor(port, key) {
  const { land, snapped } = getWorld();

  if (snapped.has(key)) return snapped.get(key);

  const cell = snapToWater(toLatLng(port), land);
  snapped.set(key, cell);

  return cell;
}

/**
 * Cheapest-first (Dijkstra) flood from one water cell, filling a distance for every cell the
 * sea can reach and the cell each one was reached from.
 *
 * There is no target and no heuristic: the whole navigable ocean is settled once, which is
 * what makes every later question free. The two arrays are allocated here and handed to the
 * caller, so a cached field's numbers cannot be scribbled on by the next departure.
 */
function floodFrom(start) {
  const { land, costEast, costNorth, costNorthEast, scratch } = getWorld();
  const gScore = new Float32Array(CELL_COUNT).fill(Infinity);
  const cameFrom = new Int32Array(CELL_COUNT).fill(-1);
  const closed = scratch.closed;

  closed.fill(0);
  scratch.size = 0;

  gScore[start] = 0;
  heapPush(scratch, start, 0);

  while (scratch.size > 0) {
    const node = heapPop(scratch);
    if (closed[node]) continue;
    closed[node] = 1;

    const row = (node / COLUMNS) | 0;
    const column = node - row * COLUMNS;
    const base = gScore[node];

    // The eight neighbours, unrolled through constant offset tables: this is the inner loop
    // of every route in the game.
    for (let side = 0; side < 8; side += 1) {
      const dRow = D_ROW[side];
      const nextRow = row + dRow;
      if (nextRow < 0 || nextRow >= ROWS) continue;

      const dColumn = D_COLUMN[side];
      const shifted = column + dColumn;
      const nextColumn = shifted < 0 ? COLUMNS - 1 : shifted >= COLUMNS ? 0 : shifted;
      const next = nextRow * COLUMNS + nextColumn;

      if (land[next] || closed[next]) continue;

      let cost;

      if (dRow === 0) {
        cost = base + costEast[row];
      } else if (dColumn === 0) {
        cost = base + costNorth[dRow > 0 ? row : row - 1];
      } else {
        // No corner cutting: a diagonal is only navigable when both cells sharing that
        // corner are navigable. This is what keeps an isthmus one cell thick sealed.
        if (land[row * COLUMNS + nextColumn] || land[nextRow * COLUMNS + column]) continue;
        cost = base + costNorthEast[dRow > 0 ? row : row - 1];
      }

      if (cost >= gScore[next]) continue;

      gScore[next] = cost;
      cameFrom[next] = node;
      heapPush(scratch, next, cost);
    }
  }

  return { cameFrom, gScore };
}

/** Whether the straight segment between two cells crosses land, corners included. */
function lineIsClear(from, to) {
  const { land } = getWorld();

  const fromRow = (from / COLUMNS) | 0;
  const fromColumn = from - fromRow * COLUMNS;
  let dRow = ((to / COLUMNS) | 0) - fromRow;
  let dColumn = (to % COLUMNS) - fromColumn;

  // Columns wrap, so the short way round is the one to test.
  if (dColumn > COLUMNS / 2) dColumn -= COLUMNS;
  if (dColumn < -COLUMNS / 2) dColumn += COLUMNS;

  const steps = 4 * Math.max(Math.abs(dRow), Math.abs(dColumn)) + 1;
  let previousRow = null;
  let previousColumn = null;

  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const row = Math.round(fromRow + dRow * ratio);
    const column = wrapColumn(Math.round(fromColumn + dColumn * ratio));

    if (row < 0 || row >= ROWS || land[row * COLUMNS + column]) return false;

    if (previousRow !== null && previousRow !== row && previousColumn !== column) {
      if (land[previousRow * COLUMNS + column] || land[row * COLUMNS + previousColumn]) return false;
    }

    previousRow = row;
    previousColumn = column;
  }

  return true;
}

/**
 * Replaces a staircase of cells with the corners a helmsman would actually steer: from each
 * kept point, take the farthest later point still in plain sight. `limit` bounds how far one
 * jump may reach, which keeps the quadratic scan affordable on a 600-cell ocean crossing;
 * running it twice — coarse, then unlimited — straightens a whole leg.
 */
function pullStraight(cells, limit) {
  if (cells.length <= 2) return cells;

  const pulled = [cells[0]];
  let anchor = 0;

  while (anchor < cells.length - 1) {
    let next = anchor + 1;
    const reach = Math.min(cells.length - 1, anchor + limit);

    for (let probe = reach; probe > anchor + 1; probe -= 1) {
      if (lineIsClear(cells[anchor], cells[probe])) {
        next = probe;
        break;
      }
    }

    pulled.push(cells[next]);
    anchor = next;
  }

  return pulled;
}

/** Total great-circle length of a route in kilometres. */
export function routeDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    total += haversineKm(previous[0], previous[1], point[0], point[1]);
  }

  return total;
}

/**
 * Whether a latitude / longitude falls on land (or polar ice) according to the grid. Exported
 * for tests and debugging: it is the same mask every route is drawn and measured against.
 */
export function isLandAt(latitude, longitude) {
  const { land } = getWorld();
  return land[rowOf(latitude) * COLUMNS + columnOf(longitude)] === 1;
}

/** The grid's shape and origin, so tests can reason about resolution without importing the asset. */
export const SEA_GRID = {
  cellDegrees: CELL_DEGREES,
  columns: COLUMNS,
  latStart: LAT_START,
  lonStart: LON_START,
  rows: ROWS,
};

const coordKey = (latitude, longitude) => `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

const keyOf = (port) => {
  const [latitude, longitude] = toLatLng(port);
  return port && port.id_port ? `${port.id_port}` : coordKey(latitude, longitude);
};

/**
 * Straight-line stand-in for water the search cannot reach (a port with no coordinates, one
 * nowhere near a coast, or a stretch of water nothing else connects to). The game stays
 * playable, and `ok` lets the caller say the course is not a sea route rather than pretend it
 * is.
 */
function directRoute(fromPort, toPort) {
  const points = greatCirclePoints(fromPort, toPort);

  if (points.length < 2) {
    return { distanceKm: 0, ok: false, points: [] };
  }

  return { distanceKm: portDistanceKm(fromPort, toPort), ok: false, points };
}

const fieldCache = new Map();
const routeCache = new Map();

/**
 * The real sea distance from a departure to every port, from one search.
 *
 * Use this when many destinations are in play — the panel prices a whole list of them, and
 * quotes the crossing from the same numbers. `distanceKmTo` is a lookup; `routeTo` walks the
 * path back out of the field and straightens it. Returns null when the departure port itself
 * cannot be put on water, in which case only straight lines are possible out of it.
 */
export function seaDistanceField(fromPort) {
  const from = toLatLng(fromPort);
  if (!from.every(Number.isFinite)) return null;

  const key = keyOf(fromPort);

  if (fieldCache.has(key)) {
    const cached = fieldCache.get(key);
    // Refresh the insertion order, so the departure in use is the last one evicted.
    fieldCache.delete(key);
    fieldCache.set(key, cached);
    return cached;
  }

  const startCell = waterCellFor(fromPort, coordKey(from[0], from[1]));
  if (startCell === null) return null;

  const { cameFrom, gScore } = floodFrom(startCell);
  const [startLat, startLng] = cellLatLng(startCell);
  // The port is not the cell centre, so the hop offshore is part of the crossing.
  const startOffsetKm = haversineKm(from[0], from[1], startLat, startLng);

  /** Where a port joins the water, and how much of the crossing is the hop to get there. */
  const berth = (port) => {
    const point = toLatLng(port);
    if (!point.every(Number.isFinite)) return null;

    const cell = waterCellFor(port, coordKey(point[0], point[1]));
    if (cell === null || !Number.isFinite(gScore[cell])) return null;

    const [latitude, longitude] = cellLatLng(cell);

    return { cell, distanceKm: startOffsetKm + gScore[cell] + haversineKm(latitude, longitude, point[0], point[1]), latitude, longitude, point };
  };

  const field = {
    fromPort,

    /** The sea distance to a port, in kilometres, or null when no sea route exists. */
    distanceKmTo(port) {
      const found = berth(port);
      return found ? found.distanceKm : null;
    },

    /** The route to a port: the field's path, straightened, port to port. */
    routeTo(port) {
      const found = berth(port);
      if (!found) return directRoute(fromPort, port);

      const cells = [];
      for (let current = found.cell; current !== -1; current = cameFrom[current]) {
        cells.push(current);
      }
      cells.reverse();

      const corners = pullStraight(pullStraight(cells, MAX_PULL_STEP), cells.length);

      return {
        distanceKm: found.distanceKm,
        ok: true,
        // The departure port itself, not the water cell it berths at: the line has to start
        // where the port is drawn.
        points: [[from[0], from[1]], ...corners.map(cellLatLng), [found.point[0], found.point[1]]],
      };
    },
  };

  if (fieldCache.size >= FIELD_CACHE_LIMIT) {
    fieldCache.delete(fieldCache.keys().next().value);
  }
  fieldCache.set(key, field);

  return field;
}

/** The sea route between two ports: the path to draw, and how far it really is. */
export function seaRoute(fromPort, toPort) {
  const from = toLatLng(fromPort);
  const to = toLatLng(toPort);
  const key = `${keyOf(fromPort)}>${keyOf(toPort)}`;

  if (routeCache.has(key)) return routeCache.get(key);

  let route;

  if (from.every(Number.isFinite) && from[0] === to[0] && from[1] === to[1]) {
    // A voyage that goes nowhere: the panel blocks it, but nothing here should guess.
    route = { distanceKm: 0, ok: true, points: [from, from] };
  } else {
    const field = seaDistanceField(fromPort);
    const distanceKm = field ? field.distanceKmTo(toPort) : null;

    route = field && distanceKm !== null ? field.routeTo(toPort) : directRoute(fromPort, toPort);
  }

  if (routeCache.size >= ROUTE_CACHE_LIMIT) routeCache.clear();
  routeCache.set(key, route);

  return route;
}

/** The points to draw for a voyage, port to port. */
export function seaRoutePoints(fromPort, toPort) {
  return seaRoute(fromPort, toPort).points;
}

/**
 * How far a voyage really has to sail, in kilometres. This is the number freight and crossing
 * time are based on, so a route around a continent costs what it should.
 */
export function seaDistanceKm(fromPort, toPort) {
  return seaRoute(fromPort, toPort).distanceKm;
}

/** Empties the route and field caches. Exported for tests that measure the search itself. */
export function clearSeaRouteCache() {
  fieldCache.clear();
  routeCache.clear();
}
