import {
  DETAIL_ZOOM,
  GREAT_CIRCLE_STEPS,
  formatDuration,
  greatCirclePoints,
  haversineKm,
  interpolatePosition,
  interpolateRoutePosition,
  mapHeadingDegrees,
  NAVIGATION_TICK_MS,
  parseCoordinate,
  portDistanceKm,
  shouldShowDetailedBorders,
  splitAtAntimeridian,
  toLatLng,
  VOYAGE_MAX_DURATION_MS,
  VOYAGE_MIN_DURATION_MS,
  voyageDurationMs,
} from './geo';

// Real entry from assets/ports.json: 3567 of 3630 ports look like this.
const shakotan = { LATITUDE: '43,866667', LONGITUDE: '146,833333' };
const rotterdam = { LATITUDE: '51.95', LONGITUDE: '4.15' };

describe('parseCoordinate', () => {
  it('reads European decimal strings', () => {
    expect(parseCoordinate('43,866667')).toBeCloseTo(43.866667, 6);
    expect(parseCoordinate('-12,5')).toBeCloseTo(-12.5, 6);
  });

  it('passes through numbers and trims strings', () => {
    expect(parseCoordinate(43.866667)).toBeCloseTo(43.866667, 6);
    expect(parseCoordinate('  43.866667 ')).toBeCloseTo(43.866667, 6);
  });

  it('returns NaN for missing or unparseable values', () => {
    expect(parseCoordinate(undefined)).toBeNaN();
    expect(parseCoordinate(null)).toBeNaN();
    expect(parseCoordinate('')).toBeNaN();
    expect(parseCoordinate('north')).toBeNaN();
    expect(parseCoordinate(NaN)).toBeNaN();
  });
});

describe('toLatLng', () => {
  it('returns numeric latitude and longitude', () => {
    expect(toLatLng(shakotan)).toEqual([43.866667, 146.833333]);
  });
});

describe('interpolatePosition', () => {
  it('hits the endpoints and the midpoint', () => {
    expect(interpolatePosition(rotterdam, shakotan, 0)).toEqual([51.95, 4.15]);

    const midpoint = interpolatePosition(rotterdam, shakotan, 50);
    expect(midpoint[0]).toBeCloseTo((51.95 + 43.866667) / 2, 6);
    expect(midpoint[1]).toBeCloseTo((4.15 + 146.833333) / 2, 6);

    expect(interpolatePosition(rotterdam, shakotan, 100)).toEqual([43.866667, 146.833333]);
  });

  it('stays numeric for ports stored with comma decimals', () => {
    // Regression: "43,866667" + 0.5 used to produce the string "43,8666670.5".
    const position = interpolatePosition(shakotan, rotterdam, 50);

    for (const value of position) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('clamps progress outside 0-100', () => {
    expect(interpolatePosition(rotterdam, shakotan, -20)).toEqual([51.95, 4.15]);
    expect(interpolatePosition(rotterdam, shakotan, 250)).toEqual([43.866667, 146.833333]);
  });
});

describe('navigation timing', () => {
  it('exposes a tick the map animation can match', () => {
    expect(NAVIGATION_TICK_MS).toBeGreaterThan(0);
  });
});

describe('distance', () => {
  it('measures a known route', () => {
    // London to New York is roughly 5570 km.
    expect(haversineKm(51.5074, -0.1278, 40.7128, -74.006)).toBeGreaterThan(5500);
    expect(haversineKm(51.5074, -0.1278, 40.7128, -74.006)).toBeLessThan(5650);
  });

  it('reports a real haul between two ports without NaN', () => {
    const distance = portDistanceKm(rotterdam, shakotan);

    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(8000);
  });

  it('is zero for the same point', () => {
    expect(haversineKm(10, 20, 10, 20)).toBe(0);
  });
});

describe('great-circle routing', () => {
  // Tokyo to Los Angeles: the real route arcs north over the Pacific and crosses the
  // antimeridian. A straight line in lat/lng would run west across Asia and Europe.
  const tokyo = { LATITUDE: '35,68', LONGITUDE: '139,69' };
  const losAngeles = { LATITUDE: '33.74', LONGITUDE: '-118.24' };

  it('samples a route into steps with the endpoints intact', () => {
    const points = greatCirclePoints(tokyo, losAngeles, 24);

    expect(points).toHaveLength(25);
    expect(points[0]).toEqual([35.68, 139.69]);
    expect(points[24]).toEqual([33.74, -118.24]);
  });

  it('sails the arc instead of the straight line', () => {
    // The middle sample of a two-step route is the midpoint of the arc.
    const [, midpoint] = greatCirclePoints(tokyo, losAngeles, 2);

    expect(midpoint[0]).toBeCloseTo(47.76, 1);
    expect(midpoint[1]).toBeCloseTo(-168.44, 1);

    // The naive midpoint sits over Kazakhstan at 34.7 N.
    expect(midpoint[0]).toBeGreaterThan(45);
  });

  it('falls back to a straight line when the route has no length', () => {
    const samePort = { LATITUDE: '51.95', LONGITUDE: '4.15' };
    const points = greatCirclePoints(samePort, samePort, 2);

    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point[0]).toBeCloseTo(51.95, 6);
      expect(point[1]).toBeCloseTo(4.15, 6);
    }
  });

  it('splits a route at the antimeridian so Leaflet never paints across the map', () => {
    const segments = splitAtAntimeridian(greatCirclePoints(tokyo, losAngeles));

    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.length).toBeGreaterThan(1);
      for (let index = 1; index < segment.length; index += 1) {
        expect(Math.abs(segment[index][1] - segment[index - 1][1])).toBeLessThanOrEqual(180);
      }
    }
    expect(segments[0][segments[0].length - 1][1]).toBeGreaterThan(178);
    expect(segments[1][0][1]).toBeLessThan(-178);
  });

  it('leaves a route that stays on one side of the world alone', () => {
    const segments = splitAtAntimeridian(greatCirclePoints(rotterdam, shakotan));

    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(GREAT_CIRCLE_STEPS + 1);
  });

  it('returns nothing to draw for an unreadable port', () => {
    expect(greatCirclePoints({ LATITUDE: 'north', LONGITUDE: '4.15' }, shakotan)).toEqual([]);
    expect(splitAtAntimeridian([])).toEqual([]);
  });
});

describe('voyage duration', () => {
  it('grows with distance, inside one watchable band', () => {
    const hop = voyageDurationMs(300);
    const coastal = voyageDurationMs(3000);
    const ocean = voyageDurationMs(15000);

    // A crossing is meant to be watched, not blinked through, and the whole game fits
    // between the floor and the ceiling with a short hop only a little above the floor.
    expect(VOYAGE_MIN_DURATION_MS).toBeGreaterThanOrEqual(30000);
    expect(hop).toBeGreaterThanOrEqual(VOYAGE_MIN_DURATION_MS);
    expect(hop).toBeLessThan(VOYAGE_MIN_DURATION_MS * 1.3);
    expect(coastal).toBeGreaterThan(hop);
    expect(ocean).toBeGreaterThan(coastal);
    expect(ocean).toBe(VOYAGE_MAX_DURATION_MS);
  });

  it('spreads the middle of the range out instead of clamping to the floor', () => {
    // The old straight 2 ms/km rate made every route under 4,000 km the same 8 s blur.
    // A square-root curve already puts 1,000 km a third of the way up the band.
    const short = voyageDurationMs(1000);
    const middle = voyageDurationMs(5000);

    expect(short).toBe(42990);
    expect(short).toBeLessThan(middle);
    expect(middle).toBe(59047);
    expect(middle).toBeLessThan(VOYAGE_MAX_DURATION_MS);
  });

  it('lets Automated Cranes shorten the crossing', () => {
    expect(voyageDurationMs(10000, 0.7)).toBe(49755);
    expect(voyageDurationMs(10000, 0.7)).toBeLessThan(voyageDurationMs(10000));
  });

  it('survives a missing distance or multiplier', () => {
    expect(voyageDurationMs(undefined)).toBe(VOYAGE_MIN_DURATION_MS);
    expect(voyageDurationMs(10000, 0)).toBe(71079);
  });
});

describe('vessel heading', () => {
  it('measures the course clockwise from north', () => {
    expect(mapHeadingDegrees([0, 0], [1, 0])).toBeCloseTo(0, 5); // due north
    expect(mapHeadingDegrees([0, 0], [0, 1])).toBeCloseTo(90, 5); // due east
    expect(mapHeadingDegrees([0, 0], [-1, 0])).toBeCloseTo(180, 5); // due south
    expect(mapHeadingDegrees([0, 0], [0, -1])).toBeCloseTo(-90, 5); // due west
  });

  it('crosses the antimeridian the short way', () => {
    // 179 E to 179 W is two degrees east, not 358 degrees west.
    expect(mapHeadingDegrees([0, 179], [0, -179])).toBeCloseTo(90, 5);
  });

  it('measures the angle the map draws, not the true bearing', () => {
    // Web Mercator stretches latitude, so a north-east course looks steeper on screen
    // than the 45 degrees its coordinates suggest. The triangle has to follow the line
    // that is actually drawn.
    expect(mapHeadingDegrees([60, 0], [60.5, 0.5])).toBeCloseTo(26.4, 1);
  });

  it('has no heading to report for a point that did not move', () => {
    expect(mapHeadingDegrees([10, 20], [10, 20])).toBeNull();
    expect(mapHeadingDegrees([10, 20], null)).toBeNull();
    expect(mapHeadingDegrees(['north', 20], [10, 20])).toBeNull();
  });
});

describe('interpolateRoutePosition', () => {
  // A route with unequal legs, the shape a sea route has: a short hop out of port and a long
  // ocean crossing. Stepping by point index would sprint the short leg and crawl the long one.
  const route = [
    [51.95, 4.15], // Rotterdam
    [52.0, 4.5], // just offshore, ~25 km
    [48.0, -30.0], // North Atlantic
    [40.7, -74.02], // New York
  ];

  it('returns the ends exactly', () => {
    expect(interpolateRoutePosition(route, 0)).toEqual([51.95, 4.15]);
    expect(interpolateRoutePosition(route, 100)).toEqual([40.7, -74.02]);
  });

  it('is measured by distance, not by vertex', () => {
    const quarter = interpolateRoutePosition(route, 25);

    // A quarter of the way by distance is well past the short first leg, not between the
    // first two vertices.
    expect(quarter[1]).toBeLessThan(4.5);
    expect(quarter[1]).toBeGreaterThan(-30);
  });

  it('moves monotonically along the route', () => {
    const longitudes = [0, 10, 25, 50, 75, 90, 100].map(
      (progress) => interpolateRoutePosition(route, progress)[1]
    );

    for (let index = 1; index < longitudes.length; index += 1) {
      expect(longitudes[index]).toBeLessThan(longitudes[index - 1]);
    }
  });

  it('crosses the antimeridian without jumping to the other side of the map', () => {
    const pacific = [
      [35.0, 179.0],
      [36.0, -179.0],
    ];
    const middle = interpolateRoutePosition(pacific, 50);

    // Halfway between 179 E and 179 W is around 180, not 0.
    expect(Math.abs(middle[1])).toBeGreaterThan(179);
    expect(middle[0]).toBeCloseTo(35.5, 3);
  });

  it('degrades safely', () => {
    expect(interpolateRoutePosition([], 50)).toBeNull();
    expect(interpolateRoutePosition(null, 50)).toBeNull();
    expect(interpolateRoutePosition([[10, 20]], 50)).toEqual([10, 20]);
    // A route with no length at all stays at its first point rather than dividing by zero.
    expect(interpolateRoutePosition([[10, 20], [10, 20]], 50)).toEqual([10, 20]);
  });
});

describe('duration readout', () => {
  it('formats a crossing as mm:ss', () => {
    expect(formatDuration(19682)).toBe('0:20');
    expect(formatDuration(65000)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('never shows a negative or broken clock', () => {
    expect(formatDuration(-500)).toBe('0:00');
    expect(formatDuration(undefined)).toBe('0:00');
  });
});

describe('shouldShowDetailedBorders', () => {
  it('switches to the detailed outlines at the zoom-in threshold', () => {
    expect(shouldShowDetailedBorders(false, DETAIL_ZOOM.in)).toBe(true);
    expect(shouldShowDetailedBorders(false, DETAIL_ZOOM.in - 1)).toBe(false);
  });

  it('stays detailed until the zoom-out threshold is crossed', () => {
    expect(shouldShowDetailedBorders(true, DETAIL_ZOOM.in)).toBe(true);
    expect(shouldShowDetailedBorders(true, DETAIL_ZOOM.out + 1)).toBe(true);
    expect(shouldShowDetailedBorders(true, DETAIL_ZOOM.out)).toBe(false);
  });

  it('does not flicker between the two levels near the threshold', () => {
    let detailed = false;
    for (const zoom of [1, 2, 3, 4, 5, 4, 3, 4, 5, 6, 5, 4]) {
      detailed = shouldShowDetailedBorders(detailed, zoom);
      if (zoom >= DETAIL_ZOOM.in) {
        expect(detailed).toBe(true);
      }
      if (zoom <= DETAIL_ZOOM.out) {
        expect(detailed).toBe(false);
      }
    }
  });
});
