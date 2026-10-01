import ports from './assets/ports.json';
import { clearSeaRouteCache, isLandAt, seaDistanceKm, seaDistanceField, seaRoute, SEA_GRID } from './seaRoute';
import { haversineKm, portDistanceKm, splitAtAntimeridian, toLatLng } from './geo';

/**
 * Real ports, by id, so the assertions below are about the world rather than about
 * whatever happens to be in the file first.
 */
const PORT_IDS = {
  aden: 2029,
  anacortes: 3058,
  auckland: 1543,
  balboa: 1043,
  basrah: 2026,
  buenosAires: 3324,
  burSaid: 2939,
  chicago: 51,
  cristobal: 290,
  detroit: 1080,
  duluth: 1047,
  genova: 2294,
  honolulu: 1532,
  jiddah: 23,
  manaus: 1057,
  mumbai: 1564,
  odesa: 1558,
  puntaArenas: 2412,
  rotterdam: 882,
  santos: 1070,
  seattle: 3482,
  tokyo: 3285,
  toronto: 1504,
  ushuaia: 2214,
  valparaiso: 1603,
  vancouver: 3068,
};

const port = (key) => {
  const found = ports.find((entry) => entry.id_port === PORT_IDS[key]);
  expect(found).toBeDefined();
  return found;
};

/**
 * Walks every leg of a route and reports the points that fall on land, ignoring the first and
 * last stretch.
 *
 * That stretch is the hop between a port and the nearest navigable cell, and it is allowed to
 * cross a coast by design: a port is often a river port, and at half a degree of resolution
 * the water in front of it is whichever cell rasterised as sea — Hamburg's nearest is the Kiel
 * bight, ninety kilometres north east of it, because the Elbe estuary is narrower than a cell.
 * Everything between two water cells has to be water, which is what this checks.
 */
function landCrossings(points, toleranceDegrees = 2.25) {
  const offenders = [];
  const start = points[0];
  const end = points[points.length - 1];

  for (let index = 1; index < points.length; index += 1) {
    const [fromLat, fromLng] = points[index - 1];
    const [toLat, toLng] = points[index];
    let dLng = toLng - fromLng;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;

    const distance = haversineKm(fromLat, fromLng, toLat, fromLng + dLng);
    const steps = Math.max(1, Math.round(distance / 15));

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const latitude = fromLat + (toLat - fromLat) * ratio;
      const longitude = fromLng + dLng * ratio;

      const nearStart =
        index === 1 && Math.hypot(latitude - start[0], longitude - start[1]) <= toleranceDegrees;
      const nearEnd =
        index === points.length - 1 &&
        Math.hypot(latitude - end[0], longitude - end[1]) <= toleranceDegrees;
      if (nearStart || nearEnd) continue;

      if (isLandAt(latitude, longitude)) {
        offenders.push([latitude.toFixed(3), longitude.toFixed(3)]);
      }
    }
  }

  return offenders;
}

beforeEach(() => {
  clearSeaRouteCache();
});

describe('sea routing', () => {
  test('routes are water the whole way, not just between the ports', () => {
    const pairs = [
      ['rotterdam', 'tokyo'],
      ['rotterdam', 'santos'],
      ['genova', 'odesa'],
      ['basrah', 'mumbai'],
      ['jiddah', 'rotterdam'],
      ['balboa', 'cristobal'],
      ['aden', 'genova'],
      ['ushuaia', 'rotterdam'],
    ];

    for (const [from, to] of pairs) {
      const route = seaRoute(port(from), port(to));

      expect(route.ok).toBe(true);
      expect(landCrossings(route.points)).toEqual([]);
    }
  });

  test('a crossing of the antimeridian is cut into legs Leaflet can draw', () => {
    const route = seaRoute(port('auckland'), port('honolulu'));

    expect(route.ok).toBe(true);

    const legs = splitAtAntimeridian(route.points);
    expect(legs.length).toBeGreaterThan(1);

    // Every leg is a path Leaflet can paint without running back across the whole map, and
    // the legs still join up end to end.
    for (let index = 1; index < legs.length; index += 1) {
      expect(Math.abs(legs[index][0][1] - legs[index - 1][legs[index - 1].length - 1][1])).toBeGreaterThan(
        180
      );
    }
  });

  test('the route starts at the port and ends at the port', () => {
    const from = port('rotterdam');
    const to = port('tokyo');
    const route = seaRoute(from, to);

    expect(route.points[0][0]).toBeCloseTo(51.9, 3);
    expect(route.points[0][1]).toBeCloseTo(4.483333, 3);
    expect(route.points[route.points.length - 1][0]).toBeCloseTo(35.666667, 3);
    expect(route.points[route.points.length - 1][1]).toBeCloseTo(139.75, 3);
  });

  test('a voyage is longer than the straight line when it has to go around something', () => {
    const rotterdam = port('rotterdam');
    const tokyo = port('tokyo');

    const straight = portDistanceKm(rotterdam, tokyo);
    const sailed = seaDistanceKm(rotterdam, tokyo);

    // The great circle cuts across Europe and Asia.
    expect(sailed).toBeGreaterThan(straight * 1.3);
  });

  test('the Northwest Passage is the fastest water route, not the polar ice', () => {
    const route = seaRoute(port('rotterdam'), port('tokyo'));
    const latitudes = route.points.map((point) => point[0]);

    // Through the Canadian Arctic: the northernmost point is around 75 N (Parry Channel and
    // the Beaufort Sea), and it never enters the frozen central basin.
    expect(Math.max(...latitudes)).toBeGreaterThan(70);
    expect(Math.max(...latitudes)).toBeLessThanOrEqual(75);

    // Round the Cape of Good Hope is 21,000 km, so this is plainly the Arctic transit.
    expect(route.distanceKm).toBeLessThan(17000);
  });

  test('no route is drawn across the polar ice', () => {
    const pairs = [
      ['rotterdam', 'tokyo'],
      ['rotterdam', 'ushuaia'],
      ['genova', 'jiddah'],
    ];

    for (const [from, to] of pairs) {
      const route = seaRoute(port(from), port(to));

      for (const [latitude, longitude] of route.points) {
        expect(Math.abs(latitude)).toBeLessThanOrEqual(75);
      }

      // The ports themselves can sit just inside a coast the grid calls land, so the interior
      // of the drawn course is what has to be water.
      for (const [latitude, longitude] of route.points.slice(1, -1)) {
        expect(isLandAt(latitude, longitude)).toBe(false);
      }
    }
  });

  test('an open ocean crossing stays close to the straight line', () => {
    const straight = portDistanceKm(port('rotterdam'), port('santos'));
    const sailed = seaDistanceKm(port('rotterdam'), port('santos'));

    expect(sailed).toBeGreaterThan(straight);
    expect(sailed).toBeLessThan(straight * 1.2);
  });

  test('a distance field prices every destination from one search', () => {
    const field = seaDistanceField(port('rotterdam'));

    expect(field).not.toBeNull();
    expect(field.distanceKmTo(port('tokyo'))).toBeCloseTo(seaDistanceKm(port('rotterdam'), port('tokyo')), 3);
    expect(field.distanceKmTo(port('santos'))).toBeCloseTo(seaDistanceKm(port('rotterdam'), port('santos')), 3);

    // Nowhere near water: the field cannot price it, and says so rather than guessing.
    expect(field.distanceKmTo({ LATITUDE: 15, LONGITUDE: 20, id_port: 'inland' })).toBeNull();
  });

  test('distance is the same both ways', () => {
    const there = seaDistanceKm(port('rotterdam'), port('mumbai'));
    const back = seaDistanceKm(port('mumbai'), port('rotterdam'));

    expect(Math.abs(there - back) / there).toBeLessThan(0.02);
  });
});

describe('no canals', () => {
  test('the Panama canal is not a shortcut', () => {
    const straight = portDistanceKm(port('balboa'), port('cristobal'));
    const sailed = seaDistanceKm(port('balboa'), port('cristobal'));

    // Balboa and Cristobal are 40 km apart across the isthmus, and the only way between
    // them is round Cape Horn.
    expect(straight).toBeLessThan(150);
    expect(sailed).toBeGreaterThan(9000);
  });

  test('the Suez canal is not a shortcut', () => {
    const straight = portDistanceKm(port('burSaid'), port('jiddah'));
    const sailed = seaDistanceKm(port('burSaid'), port('jiddah'));

    // Port Said is the Mediterranean end of Suez and Jiddah is down the Red Sea: with the
    // canal closed the only route is Gibraltar, round Africa and up Bab-el-Mandeb.
    expect(straight).toBeLessThan(1500);
    expect(sailed).toBeGreaterThan(14000);
  });
});

describe('a strait is a corridor, not just a doorway', () => {
  test('Chile is reached through the Strait of Magellan, not round Cape Horn', () => {
    const valparaiso = port('valparaiso');
    const buenosAires = port('buenosAires');
    const route = seaRoute(valparaiso, buenosAires);

    expect(route.ok).toBe(true);
    expect(landCrossings(route.points)).toEqual([]);

    // The strait is a dogleg that stays north of 54 degrees. Carved at both ends but blocked
    // across the middle, the same voyage rounds the Horn and dips to 56 — 600 km further.
    const southernmost = Math.min(...route.points.map((point) => point[0]));
    expect(southernmost).toBeGreaterThan(-55);
    expect(route.distanceKm).toBeLessThan(5400);
  });

  test('the strait shortens a run that would otherwise round the Horn', () => {
    const puntaArenas = port('puntaArenas');
    const route = seaRoute(puntaArenas, port('buenosAires'));

    expect(route.ok).toBe(true);
    expect(route.distanceKm).toBeGreaterThan(portDistanceKm(puntaArenas, port('buenosAires')));
    // Up the Atlantic: 2,564 km. Out into the Pacific and round the Horn instead is 3,580.
    expect(route.distanceKm).toBeLessThan(3000);
  });
});

describe('the Salish Sea is reached through the Strait of Juan de Fuca', () => {
  test('Seattle to Vancouver stays inside, off the open Pacific', () => {
    const route = seaRoute(port('seattle'), port('vancouver'));

    expect(route.ok).toBe(true);
    expect(landCrossings(route.points)).toEqual([]);

    // Puget Sound and the Strait of Georgia are narrower than a cell, so before they were
    // carved the only way between the two cities was 464 km out to sea round the Olympic
    // Peninsula. Inside, past the San Juan islands, it is 243.
    expect(route.distanceKm).toBeLessThan(300);
    // Never out to the ocean: the outside passage reaches 124.8 W, this one 123.3 W.
    expect(Math.min(...route.points.map((point) => point[1]))).toBeGreaterThan(-124);
  });

  test('two ports a few kilometres apart are not a voyage round a peninsula', () => {
    const route = seaRoute(port('anacortes'), ports.find((entry) => entry.id_port === 3059));

    expect(route.ok).toBe(true);
    expect(route.distanceKm).toBeLessThan(200);
  });
});

describe('the natural straits stay open', () => {
  test('the Bosporus connects the Black Sea', () => {
    const straight = portDistanceKm(port('odesa'), port('rotterdam'));
    const sailed = seaDistanceKm(port('odesa'), port('rotterdam'));

    expect(sailed).toBeGreaterThan(3500);
    expect(sailed).toBeLessThan(straight * 3.5);
  });

  test('the strait of Messina connects the western and eastern Mediterranean', () => {
    const straight = portDistanceKm(port('genova'), port('odesa'));
    const sailed = seaDistanceKm(port('genova'), port('odesa'));

    // Not a great-circle hop over Italy, and not the long way round either: through
    // Messina (or south of Sicily), the Aegean, the Dardanelles and the Bosporus.
    expect(sailed).toBeGreaterThan(straight * 1.1);
    expect(sailed).toBeLessThan(straight * 2.2);
  });

  test('the strait of Hormuz connects the Persian Gulf', () => {
    const straight = portDistanceKm(port('basrah'), port('mumbai'));
    const sailed = seaDistanceKm(port('basrah'), port('mumbai'));

    expect(sailed).toBeGreaterThan(straight * 1.05);
    expect(sailed).toBeLessThan(straight * 2);
  });

  test('Bab-el-Mandeb connects the Red Sea', () => {
    const straight = portDistanceKm(port('aden'), port('genova'));
    const sailed = seaDistanceKm(port('aden'), port('genova'));

    // Out through Bab-el-Mandeb, up the Red Sea's southern entrance, then Gibraltar.
    expect(sailed).toBeGreaterThan(straight * 1.3);
  });
});

describe('the Great Lakes are a waterway', () => {
  test('a Great Lakes port is routed up the St. Lawrence, not across Ontario', () => {
    const rotterdam = port('rotterdam');
    const detroit = port('detroit');
    const route = seaRoute(rotterdam, detroit);

    expect(route.ok).toBe(true);
    expect(landCrossings(route.points)).toEqual([]);

    // The straight line cuts across Ontario and Lake Erie; the course actually sailed goes
    // down the Channel, across the Atlantic, up the St. Lawrence, through the Welland and
    // west along Erie. Longer than the great circle, and nothing like the Cape of Good Hope.
    expect(route.distanceKm).toBeGreaterThan(portDistanceKm(rotterdam, detroit));
    expect(route.distanceKm).toBeGreaterThan(7000);
    expect(route.distanceKm).toBeLessThan(9000);
  });

  test('every lake is reachable, from Toronto to Thunder Bay', () => {
    const field = seaDistanceField(port('rotterdam'));

    // Toronto is the first lake up the St. Lawrence, Chicago and Duluth are the far ends of
    // Michigan and Superior: each is a real crossing now rather than a straight line.
    for (const [key, minimum, maximum] of [
      ['toronto', 6000, 7500],
      ['detroit', 7000, 8000],
      ['chicago', 8000, 9000],
      ['duluth', 8000, 9000],
    ]) {
      const distance = field.distanceKmTo(port(key));

      expect(distance).not.toBeNull();
      expect(distance).toBeGreaterThan(minimum);
      expect(distance).toBeLessThan(maximum);
    }
  });

  test('the lakes are one waterway: Chicago to Detroit stays on the lakes', () => {
    const chicago = port('chicago');
    const detroit = port('detroit');
    const route = seaRoute(chicago, detroit);

    expect(route.ok).toBe(true);
    expect(landCrossings(route.points)).toEqual([]);

    // Round Lake Michigan and down through the Straits of Mackinac, Huron, St. Clair and
    // Erie, instead of the 380 km straight line over the state of Michigan.
    expect(portDistanceKm(chicago, detroit)).toBeLessThan(400);
    expect(route.distanceKm).toBeGreaterThan(900);
    expect(route.distanceKm).toBeLessThan(1200);
  });
});

describe('ports with no sea route', () => {
  test('a deep river port is reported as unreachable, not routed across the continent', () => {
    // Manaus is 1,500 km up the Amazon, with no water within two degrees of it on this grid:
    // the only honest answer is that it has no sea route.
    const manaus = port('manaus');
    const field = seaDistanceField(port('rotterdam'));

    expect(field.distanceKmTo(manaus)).toBeNull();

    const route = seaRoute(port('rotterdam'), manaus);
    expect(route.ok).toBe(false);
    // The straight line is the fallback, and it is never claimed to be a sea route.
    expect(route.distanceKm).toBeCloseTo(portDistanceKm(port('rotterdam'), manaus), 3);
  });

  test('a port that is only a little way up an estuary is still routed', () => {
    // Antwerp is 80 km up the Scheldt and Hamburg 100 km up the Elbe: both are real sea
    // ports, and both must have a sea route rather than a straight line.
    const antwerp = ports.find((entry) => entry.PORT_NAME === 'ANTWERPEN');
    const hamburg = ports.find((entry) => entry.PORT_NAME === 'HAMBURG' && entry.COUNTRY === 'DE');

    for (const [from, to] of [[antwerp, hamburg], [hamburg, port('tokyo')]]) {
      const route = seaRoute(from, to);
      expect(route.ok).toBe(true);
      expect(route.distanceKm).toBeGreaterThan(portDistanceKm(from, to));
      expect(landCrossings(route.points)).toEqual([]);
    }
  });

  test('the Gulf of Suez and the Gulf of Aqaba are reachable seas', () => {
    const field = seaDistanceField(port('rotterdam'));

    for (const name of ['AS SUWAYS', 'ELAT']) {
      const entry = ports.find((one) => one.PORT_NAME === name);
      expect(entry).toBeDefined();
      expect(field.distanceKmTo(entry)).toBeGreaterThan(1000);
    }
  });
});

describe('robustness', () => {
  test('a port the sea cannot reach falls back to the straight line', () => {
    // Nowhere near water: the Sahara is more than eight degrees from any coast.
    const sahara = { LATITUDE: 15, LONGITUDE: 20, id_port: 'inland' };
    const route = seaRoute(sahara, port('rotterdam'));

    expect(route.ok).toBe(false);
    expect(route.points.length).toBeGreaterThan(2);
    expect(route.distanceKm).toBeCloseTo(portDistanceKm(sahara, port('rotterdam')), 3);
  });

  test('a port with no usable coordinates cannot be routed at all', () => {
    const route = seaRoute({ LATITUDE: 'north', LONGITUDE: '4,15', id_port: 'broken' }, port('rotterdam'));

    expect(route.ok).toBe(false);
    expect(route.points).toEqual([]);
    expect(route.distanceKm).toBe(0);
  });

  test('the same port twice is a zero-length route', () => {
    const route = seaRoute(port('rotterdam'), port('rotterdam'));

    expect(route.ok).toBe(true);
    expect(route.distanceKm).toBe(0);
  });

  test('the grid covers the world at a usable resolution', () => {
    expect(SEA_GRID.cellDegrees).toBe(0.5);
    expect(SEA_GRID.columns * SEA_GRID.rows).toBe(720 * 360);

    // Land and water both exist, or the mask decoded wrong.
    expect(isLandAt(46.5, 10.0)).toBe(true);
    expect(isLandAt(0, -140)).toBe(false);
  });

  test('the panel can price a whole list of destinations quickly', () => {
    const from = port('rotterdam');
    const candidates = ports.filter((entry) => toLatLng(entry).every(Number.isFinite)).slice(0, 60);

    const started = Date.now();
    const field = seaDistanceField(from);
    const distances = candidates.map((entry) => field.distanceKmTo(entry));
    const elapsed = Date.now() - started;

    const reachable = distances.filter((distance) => distance !== null);

    // The first sixty ports in the file are Scottish and Lake Michigan harbours, and all of
    // them resolve: the lakes were the last run in the list that used to report null.
    expect(reachable.length).toBe(60);
    expect(reachable.every((distance) => distance > 0)).toBe(true);
    // One search for the departure, then a lookup per port. The panel recomputes the field
    // only when the departure changes, and even that is cached.
    expect(elapsed).toBeLessThan(2000);
  });
});
