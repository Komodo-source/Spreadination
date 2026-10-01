#!/usr/bin/env node
/**
 * Builds the ocean mask that A* routes ships over, from the country outlines the map
 * already ships.
 *
 * The map draws great circles today, which is a straight line on a globe and therefore
 * a course that runs straight across continents. Routing has to know where the water is,
 * and the cheapest place to find out is the same Natural Earth polygons the map is
 * already drawn from: `public/countries-low.geojson` is rasterised into a latitude /
 * longitude grid, land becomes a blocked cell, and everything else is navigable.
 *
 * Water only, and every passage a hull really takes: Suez, Panama, Kiel and Corinth are
 * carved too (see CANALS), so the Mediterranean is a shortcut to the Red Sea and the
 * Atlantic is one to the Pacific. What stays blocked is what nothing can sail — the polar
 * pack ice below.
 *
 * That leaves the natural straits. A grid cell at this resolution is about 55 km across,
 * so a passage narrower than one cell, or one the 1:110m outlines simplified shut, would
 * read as a wall — the Bosporus alone would maroon the Black Sea. STRAITS lists the real
 * narrow waterways and clears a box around each so they stay open. Each entry is a
 * genuine strait (or the approach to one), named so it can be checked by eye.
 *
 * The Great Lakes need the opposite treatment. Natural Earth keeps lakes in a layer of
 * their own, so the country outlines run *straight across* them: the raster sees one solid
 * continent from Duluth to the Gulf of St. Lawrence, and every Great Lakes port — Detroit,
 * Chicago, Cleveland, Toronto, Duluth, Thunder Bay — ends up with no sea route at all. So
 * the five lakes are carved back out as water from `public/lakes.geojson` (the same
 * Natural Earth lakes layer, emitted by `npm run build:borders`), and
 * GREAT_LAKES_CHANNELS threads the rivers that join them to each other and to the
 * Atlantic: the St. Lawrence out of Lake Ontario, the Niagara / Welland neck into Lake
 * Erie, the Detroit and St. Clair rivers, the Straits of Mackinac, and the St. Marys river
 * up to Lake Superior. The Welland and the seaway locks are engineered water, which is the
 * one exception to the rule above — a hull really does take them, and without them the
 * lakes are unreachable.
 *
 * What survives that is decided by the water itself: every lake that is *not* reachable
 * from the open sea is blocked again by `keepOpenOcean`, so carving Lake Nicaragua with
 * one of these polygons cannot quietly open a passage across Central America.
 *
 * Sea ice is blocked as well. Every cell north of ICE_LATITUDE is closed, which is the
 * central Arctic basin and the straits that cross it — Vilkitsky is at 78 N, so a hull
 * cannot get round the Taymyr peninsula, and a route from Europe to Japan goes round the
 * Cape of Good Hope rather than over the top of the world. Without this, the polar ocean
 * is open water on a grid with no seasons, and A* happily sails over the pole: a cell up
 * at 89 N is a hundred metres wide, so it is nearly free to cross, and the shortest path
 * between two northern ports went through 89.8 N. An ice edge is not a coastline and this
 * game has no icebreakers, so the honest thing is to say the pack ice is impassable.
 *
 * Run with: npm run build:sea-grid
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'countries-low.geojson');
const LAKES_SOURCE = path.join(ROOT, 'public', 'lakes.geojson');
const OUT = path.join(ROOT, 'src', 'assets', 'sea-grid.json');

/**
 * Cell size in degrees, and the grid it implies. 0.5 is the balance: a crossing of the
 * Pacific is ~600 cells of A* (a few milliseconds), while the mask is 32 kB of bits.
 * Anything finer starts to cost real time on every route the panel previews.
 */
const CELL_DEGREES = 0.5;
const LAT_START = -90;
const LON_START = -180;
const ROWS = Math.round(180 / CELL_DEGREES);
const COLUMNS = Math.round(360 / CELL_DEGREES);

/**
 * Everything north of this is pack ice. 75 N keeps every port in the world on the far side
 * of it (Longyearbyen, at 78.2 N, is the northernmost, and it is reached over open water
 * from the south) while closing the Arctic crossings, whose narrowest points — Vilkitsky
 * at 77.9 N, McClure at 74.5 N — are the only ways past the mainland.
 */
const ICE_LATITUDE = 75;

/**
 * Natural straits narrow enough that the 1:110m outlines or the cell size would close
 * them. `latRadius` / `lonRadius` are half-extents in degrees of the box cleared to sea
 * around each centre.
 */
const STRAITS = [
  // --- Atlantic into the Mediterranean ------------------------------------------
  { name: 'Strait of Gibraltar', lat: 35.95, lng: -5.6, latRadius: 0.75, lonRadius: 1.0 },

  // --- Atlantic into the North Sea and the Baltic ------------------------------
  { name: 'English Channel / Dover', lat: 50.8, lng: 1.0, latRadius: 1.0, lonRadius: 2.0 },
  { name: 'Thames estuary', lat: 51.5, lng: 1.0, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'St Georges Channel', lat: 51.8, lng: -5.4, latRadius: 0.75, lonRadius: 0.75 },
  { name: 'North Channel', lat: 55.2, lng: -5.7, latRadius: 0.75, lonRadius: 0.75 },
  { name: 'Kattegat / Skagerrak', lat: 57.4, lng: 10.6, latRadius: 0.75, lonRadius: 0.75 },
  { name: 'Danish straits (Great Belt)', lat: 55.6, lng: 10.9, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'Gulf of Finland', lat: 59.7, lng: 24.0, latRadius: 0.6, lonRadius: 0.75 },
  { name: 'Kvarken (Gulf of Bothnia)', lat: 63.5, lng: 21.0, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Gorlo strait (White Sea)', lat: 66.5, lng: 40.0, latRadius: 0.6, lonRadius: 0.75 },
  { name: 'Gulf of Finland (east)', lat: 59.9, lng: 27.0, latRadius: 0.6, lonRadius: 0.75 },
  { name: 'Gulf of Riga (Irbe strait)', lat: 57.75, lng: 22.4, latRadius: 0.5, lonRadius: 0.6 },

  // --- Mediterranean into the Black Sea ----------------------------------------
  { name: 'Dardanelles', lat: 40.1, lng: 26.4, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Sea of Marmara / Bosporus', lat: 40.8, lng: 28.4, latRadius: 0.6, lonRadius: 1.4 },
  { name: 'Strait of Kerch (Sea of Azov)', lat: 45.35, lng: 36.6, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'Strait of Messina', lat: 38.2, lng: 15.6, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'Thermaic Gulf (Thessaloniki)', lat: 40.3, lng: 22.9, latRadius: 0.6, lonRadius: 0.6 },

  // --- Indian Ocean into the Gulf and the Red Sea ------------------------------
  { name: 'Strait of Hormuz', lat: 26.5, lng: 56.4, latRadius: 0.5, lonRadius: 0.75 },
  { name: 'Bab-el-Mandeb', lat: 12.9, lng: 43.3, latRadius: 0.75, lonRadius: 1.0 },
  { name: 'Palk Strait', lat: 9.5, lng: 79.5, latRadius: 0.6, lonRadius: 0.6 },

  // The two gulfs off the northern Red Sea are 30 km wide at their mouths, so at this cell
  // size they would otherwise come out as water nobody can reach — and every port inside them
  // (Suez, Aqaba, Elat) would fall back to a straight line over the desert.
  { name: 'Gulf of Suez (head)', lat: 29.9, lng: 32.55, latRadius: 0.45, lonRadius: 0.5 },
  { name: 'Gulf of Suez (middle)', lat: 29.1, lng: 32.95, latRadius: 0.45, lonRadius: 0.5 },
  { name: 'Gulf of Suez (Ras Gharib)', lat: 28.4, lng: 33.2, latRadius: 0.45, lonRadius: 0.5 },
  { name: 'Gulf of Suez (Jubal)', lat: 27.8, lng: 33.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Tiran', lat: 27.9, lng: 34.4, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Gulf of Aqaba (middle)', lat: 28.6, lng: 34.7, latRadius: 0.45, lonRadius: 0.5 },
  { name: 'Gulf of Aqaba (head)', lat: 29.4, lng: 34.95, latRadius: 0.5, lonRadius: 0.5 },

  // --- Indian Ocean into the Pacific via the Indonesian seas -------------------
  { name: 'Malacca Strait (north)', lat: 6.0, lng: 97.5, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Malacca Strait (centre)', lat: 4.0, lng: 99.5, latRadius: 0.5, lonRadius: 0.75 },
  { name: 'Malacca Strait (south)', lat: 2.2, lng: 101.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Singapore Strait', lat: 1.2, lng: 104.0, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Sunda Strait', lat: -6.0, lng: 105.5, latRadius: 0.4, lonRadius: 0.5 },
  { name: 'Lombok Strait', lat: -8.5, lng: 115.8, latRadius: 0.4, lonRadius: 0.5 },
  { name: 'Alor Strait', lat: -8.3, lng: 124.5, latRadius: 0.4, lonRadius: 0.5 },
  { name: 'Torres Strait', lat: -10.0, lng: 142.3, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Bass Strait', lat: -40.0, lng: 145.5, latRadius: 0.75, lonRadius: 1.0 },

  // --- Pacific crossings and the western rim -----------------------------------
  { name: 'Taiwan Strait', lat: 24.5, lng: 119.5, latRadius: 0.75, lonRadius: 1.0 },
  { name: 'Korea Strait', lat: 34.3, lng: 129.2, latRadius: 0.75, lonRadius: 1.0 },
  { name: 'Tsugaru Strait', lat: 41.5, lng: 140.8, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Seto Inland Sea', lat: 34.5, lng: 134.4, latRadius: 0.6, lonRadius: 0.75 },
  { name: 'Kanmon Strait', lat: 34.0, lng: 131.0, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'La Perouse Strait', lat: 45.7, lng: 142.0, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Tartary', lat: 52.0, lng: 141.5, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Surigao Strait', lat: 10.0, lng: 125.3, latRadius: 0.4, lonRadius: 0.5 },
  { name: 'San Bernardino Strait', lat: 12.5, lng: 124.0, latRadius: 0.4, lonRadius: 0.5 },
  { name: 'Bering Strait', lat: 65.8, lng: -169.0, latRadius: 0.75, lonRadius: 1.0 },
  { name: 'Cook Strait', lat: -41.5, lng: 174.5, latRadius: 0.6, lonRadius: 0.5 },
  { name: 'Foveaux Strait', lat: -46.7, lng: 168.3, latRadius: 0.4, lonRadius: 0.5 },

  // The Chilean channels: Magellan and Beagle are sailed constantly, and both are one cell
  // wide on this grid, so without this the whole southern fjord coast is unreachable.
  //
  // The three western entries are load-bearing. Magellan is a dogleg: it opens from the
  // Atlantic, runs west past Punta Arenas, and then turns north west between the islands to
  // reach the Pacific at Cape Pilar. Carving only as far as Isla Santa Ines left the western
  // half of the strait as a dead-end pocket that nothing could reach, so an Argentine port
  // reached a Chilean one by rounding Cape Horn — 1,100 km and two days further than the
  // strait it is named after.
  { name: 'Strait of Magellan (east)', lat: -52.4, lng: -68.8, latRadius: 0.4, lonRadius: 0.6 },
  { name: 'Strait of Magellan (Segunda Angostura)', lat: -52.9, lng: -69.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Magellan (Punta Arenas)', lat: -53.3, lng: -70.4, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Magellan (middle)', lat: -53.0, lng: -70.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Magellan (west)', lat: -53.4, lng: -71.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Magellan (Isla Santa Ines)', lat: -53.2, lng: -72.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Magellan (Pacific mouth)', lat: -52.9, lng: -73.6, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Strait of Magellan (Cape Pilar)', lat: -52.8, lng: -74.6, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'Beagle Channel', lat: -54.9, lng: -68.3, latRadius: 0.4, lonRadius: 0.6 },

  // --- The Americas ------------------------------------------------------------
  { name: 'Florida Straits', lat: 24.5, lng: -81.0, latRadius: 0.75, lonRadius: 1.0 },
  { name: 'Windward Passage', lat: 19.8, lng: -73.5, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Yucatan Channel', lat: 21.5, lng: -85.0, latRadius: 0.5, lonRadius: 0.75 },
  { name: 'Cabot Strait', lat: 47.5, lng: -59.5, latRadius: 0.75, lonRadius: 0.75 },

  // The Salish Sea, reached through the Strait of Juan de Fuca. Puget Sound and the Strait
  // of Georgia are a few kilometres wide, so the 1:110m outline draws them as solid
  // continent and every port inside — Seattle, Tacoma, Victoria, Vancouver, Bellingham —
  // berths on the open Pacific instead, three cells and a hundred kilometres away. Seattle
  // to Vancouver came out as a 460 km run out to sea and back, round the Olympic Peninsula,
  // for a passage of 200 km through the San Juan islands.
  { name: 'Strait of Juan de Fuca (Pacific)', lat: 48.3, lng: -124.6, latRadius: 0.4, lonRadius: 0.5 },
  { name: 'Strait of Juan de Fuca', lat: 48.25, lng: -123.9, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'Admiralty Inlet', lat: 48.1, lng: -122.9, latRadius: 0.35, lonRadius: 0.4 },
  { name: 'Puget Sound (Seattle)', lat: 47.7, lng: -122.5, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'Puget Sound (Tacoma)', lat: 47.2, lng: -122.6, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'Haro Strait', lat: 48.6, lng: -123.2, latRadius: 0.4, lonRadius: 0.4 },
  { name: 'Strait of Georgia (Vancouver)', lat: 49.2, lng: -123.3, latRadius: 0.5, lonRadius: 0.5 },
];

/**
 * The Great Lakes, by the names Natural Earth's lakes layer gives them. The layer holds
 * two dozen lakes; only these five are carved, because only these join the ocean. Leaving
 * the rest as land — Lake Nicaragua, Lake Okeechobee, the Caspian — is what stops a
 * half-degree cell from inventing a shortcut across an isthmus.
 */
const GREAT_LAKES = ['Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario'];

/**
 * The channels that make the lakes one navigable waterway and join it to the Atlantic.
 *
 * Each is a box cleared to water, and the entries are ordered so they read as a route:
 * out of Lake Ontario down the St. Lawrence, then back west up the lakes to Superior.
 * `latRadius` / `lonRadius` are half-extents in degrees, sized to overlap their
 * neighbours — the corridor only has to be one cell wide, but consecutive boxes have to
 * touch, or the search finds a gap where a river should be.
 */
const GREAT_LAKES_CHANNELS = [
  // --- Lake Ontario out to the sea: the St. Lawrence --------------------------
  { name: 'St. Lawrence (Kingston)', lat: 44.25, lng: -76.4, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Brockville)', lat: 44.6, lng: -75.75, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Cornwall)', lat: 45.0, lng: -75.0, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Montreal)', lat: 45.4, lng: -74.1, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Trois-Rivieres)', lat: 46.1, lng: -72.9, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Portneuf)', lat: 46.45, lng: -72.1, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Quebec)', lat: 46.8, lng: -71.3, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Lawrence (Riviere-du-Loup)', lat: 47.5, lng: -70.2, latRadius: 0.6, lonRadius: 0.6 },
  // The last box reaches the water the outline already gives the estuary at 48 N, so the
  // river and the Gulf of St. Lawrence meet here.
  { name: 'St. Lawrence (Tadoussac)', lat: 48.2, lng: -69.3, latRadius: 0.6, lonRadius: 0.6 },

  // --- Lake Ontario into Lake Erie, round the Niagara peninsula ----------------
  { name: 'Niagara / Welland (Lake Ontario)', lat: 43.25, lng: -79.15, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Niagara / Welland (Lake Erie)', lat: 42.9, lng: -79.05, latRadius: 0.5, lonRadius: 0.5 },

  // --- Lake Erie up the Detroit river into Lake Huron ------------------------
  { name: 'Detroit river (Lake Erie)', lat: 42.05, lng: -83.15, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Lake St. Clair', lat: 42.45, lng: -82.75, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'St. Clair river (Lake Huron)', lat: 42.85, lng: -82.45, latRadius: 0.5, lonRadius: 0.5 },

  // --- Huron to Michigan, and Huron up to Superior ---------------------------
  { name: 'Straits of Mackinac', lat: 45.75, lng: -84.75, latRadius: 0.6, lonRadius: 0.6 },
  { name: 'St. Marys river (North Channel)', lat: 46.05, lng: -83.8, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'St. Marys river (Sault Ste. Marie)', lat: 46.35, lng: -84.2, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'St. Marys river (Whitefish Bay)', lat: 46.5, lng: -84.6, latRadius: 0.5, lonRadius: 0.5 },
];

/**
 * The man-made canals, carved on purpose.
 *
 * These were deliberately left shut until now, on the argument that a canal is not a sea:
 * Suez and Panama turn an ocean voyage into a ferry crossing. The game has decided it wants
 * the shortcuts — a hull really does take them, and a shipping company that cannot use Suez
 * is not playing the same trade as one that can. Every route the world's ports actually
 * sail is now available, except those no hull can sail at all (the polar ice, see above).
 *
 * Same treatment as a strait: a box half a degree either side of the cut, threaded end to
 * end so the passage is continuous rather than a pair of harbours with an isthmus between
 * them.
 */
const CANALS = [
  // Port Said to Suez: the Mediterranean into the Red Sea.
  { name: 'Suez canal (Port Said)', lat: 31.4, lng: 32.3, latRadius: 0.5, lonRadius: 0.6 },
  { name: 'Suez canal (Lake Timsah)', lat: 30.6, lng: 32.3, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Suez canal (Bitter Lakes)', lat: 30.1, lng: 32.45, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Suez canal (Suez)', lat: 29.95, lng: 32.5, latRadius: 0.5, lonRadius: 0.5 },

  // Colon to Balboa: the Caribbean into the Pacific, across the isthmus.
  { name: 'Panama canal (Colon)', lat: 9.4, lng: -79.9, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Panama canal (Gatun)', lat: 9.25, lng: -79.7, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Panama canal (Balboa)', lat: 8.9, lng: -79.6, latRadius: 0.5, lonRadius: 0.5 },

  // Brunsbuttel to Kiel: the North Sea into the Baltic, the short way across Holstein.
  { name: 'Kiel canal (Brunsbuttel)', lat: 53.9, lng: 8.9, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Kiel canal (Rendsburg)', lat: 54.0, lng: 9.5, latRadius: 0.5, lonRadius: 0.5 },
  { name: 'Kiel canal (Holtenau)', lat: 54.3, lng: 9.9, latRadius: 0.5, lonRadius: 0.5 },

  // The Saronic gulf into the gulf of Corinth: 6 km of cut, which is a fraction of a cell.
  { name: 'Corinth canal', lat: 37.95, lng: 22.95, latRadius: 0.4, lonRadius: 0.4 },
];

/** Every box cleared to water: straits, canals, then the Great Lakes channels. */
const WATERWAYS = [...STRAITS, ...CANALS, ...GREAT_LAKES_CHANNELS];

const OFF_ROW = new Int8Array([0, 0, 1, -1, 1, 1, -1, -1]);
const OFF_COLUMN = new Int8Array([1, -1, 0, 0, 1, -1, 1, -1]);

const index = (row, column) => row * COLUMNS + column;
const rowLatitude = (row) => LAT_START + (row + 0.5) * CELL_DEGREES;
const columnLongitude = (column) => LON_START + (column + 0.5) * CELL_DEGREES;

/** Every ring of a Polygon / MultiPolygon, flattened, with the closing point dropped. */
function ringsOf(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const rings = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (ring.length < 4) continue;

      const points = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring.slice();

      if (points.length >= 3) rings.push(points);
    }
  }

  return rings;
}

/**
 * Fills the land mask by scanline: for one row of cells, every ring edge that crosses
 * that row's latitude contributes a longitude, and sorting them lets even-odd pairing
 * paint the water *outside* the polygon. Rings are pooled across all countries rather
 * than filled one at a time, which paints lake-sized islands as land (they are) and
 * handles the polygons' holes without special-casing winding order.
 */
function rasterise(features, rowShift = 0, columnShift = 0) {
  const land = new Uint8Array(ROWS * COLUMNS);
  const crossings = [];

  for (let row = 0; row < ROWS; row += 1) {
    // The shifts move the sample point inside the cell, so calling this four times with a
    // quarter-cell offset in each direction samples every quadrant of every cell. The lake
    // carve uses that to ask "does this cell hold any water at all", where one sample at the
    // centre would leave a thin lake a diagonal that the router's corner rule then refuses.
    const latitude = rowLatitude(row) + rowShift * CELL_DEGREES;
    crossings.length = 0;

    for (const feature of features) {
      for (const ring of ringsOf(feature.geometry)) {
        for (let point = 0; point < ring.length; point += 1) {
          const [lonA, latA] = ring[point];
          const [lonB, latB] = ring[(point + 1) % ring.length];

          // Half-open test: a vertex shared by two edges must be counted once.
          if ((latA <= latitude && latB > latitude) || (latB <= latitude && latA > latitude)) {
            crossings.push(lonA + ((latitude - latA) / (latB - latA)) * (lonB - lonA));
          }
        }
      }
    }

    crossings.sort((a, b) => a - b);

    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const first = Math.ceil((crossings[pair] - LON_START) / CELL_DEGREES - 0.5 - columnShift);
      const last = Math.floor((crossings[pair + 1] - LON_START) / CELL_DEGREES - 0.5 - columnShift);

      for (let column = Math.max(0, first); column <= Math.min(COLUMNS - 1, last); column += 1) {
        land[index(row, column)] = 1;
      }
    }
  }

  return land;
}

/** Closes the polar sea ice, so no route can cross the top of the world. */
function freezePolarSeas(land) {
  let frozen = 0;

  for (let row = 0; row < ROWS; row += 1) {
    if (rowLatitude(row) <= ICE_LATITUDE) continue;

    for (let column = 0; column < COLUMNS; column += 1) {
      if (!land[row * COLUMNS + column]) frozen += 1;
      land[row * COLUMNS + column] = 1;
    }
  }

  return frozen;
}

/** Clears a box around every waterway to open water, so narrow passages survive rasterising. */
function carveWaterways(land, waterways) {
  let cleared = 0;

  for (const waterway of waterways) {
    const firstRow = Math.max(0, Math.floor((waterway.lat - waterway.latRadius - LAT_START) / CELL_DEGREES));
    const lastRow = Math.min(ROWS - 1, Math.floor((waterway.lat + waterway.latRadius - LAT_START) / CELL_DEGREES));

    for (let row = firstRow; row <= lastRow; row += 1) {
      if (Math.abs(rowLatitude(row) - waterway.lat) > waterway.latRadius) continue;

      const firstColumn = Math.floor((waterway.lng - waterway.lonRadius - LON_START) / CELL_DEGREES);
      const lastColumn = Math.floor((waterway.lng + waterway.lonRadius - LON_START) / CELL_DEGREES);

      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const wrapped = ((column % COLUMNS) + COLUMNS) % COLUMNS;

        if (Math.abs(columnLongitude(wrapped) - waterway.lng) > waterway.lonRadius) continue;
        if (land[index(row, wrapped)]) cleared += 1;

        land[index(row, wrapped)] = 0;
      }
    }
  }

  return cleared;
}

/**
 * Clears the Great Lakes to water, from the same polygons the builder carved for the
 * coastlines' sake: the country outlines have no lake in them at all (see the header).
 *
 * A cell is lake if *any* part of it is, which is what the four quarter-cell samples below
 * are for. Natural Earth's 1:110m lake outlines carry only ~30 points per Great Lake, so a
 * centre-only test leaves holes where the shore cuts the cell, and what is left is a
 * one-cell diagonal that the corner rule rejects — Lake Erie came out in two pieces that
 * way, with Buffalo joined to the Atlantic and Toledo to Superior. Widening a lake by half
 * a cell is the honest reading of a 55 km cell that is more than a quarter water.
 *
 * Only cells that rasterised as land are counted, so the number printed is how much
 * continent this turns back into water rather than how big the lakes are.
 */
function carveLakes(land, features) {
  const lake = new Uint8Array(land.length);

  for (const rowShift of [-0.25, 0.25]) {
    for (const columnShift of [-0.25, 0.25]) {
      const sample = rasterise(features, rowShift, columnShift);
      for (let cell = 0; cell < lake.length; cell += 1) {
        if (sample[cell]) lake[cell] = 1;
      }
    }
  }

  let cleared = 0;

  for (let cell = 0; cell < land.length; cell += 1) {
    if (!lake[cell] || !land[cell]) continue;

    land[cell] = 0;
    cleared += 1;
  }

  return cleared;
}

/**
 * Blocks every stretch of water that is not part of the open ocean.
 *
 * Once the straits and the lakes are carved, the world's seas are one connected body of
 * water, and everything else — the Caspian, Lake Winnipeg, a lagoon behind a spit — is a
 * closed basin no hull can enter. That matters for ports, because a port is routed from its
 * *nearest* water: land the nearest cell inside a closed basin and the port looks unreachable
 * even though the open sea is two cells away, which is what happened to Punta Arenas, sitting
 * on the Strait of Magellan, and to Thessaloniki. Labelling each body of water and keeping
 * only the largest leaves every closed basin as land, so a port snaps to water it can sail to.
 *
 * It is also what keeps the lake carve honest: a lake that did not join the seaway would be
 * set back to land here, rather than left as water nothing can reach.
 */
function keepOpenOcean(land) {
  const label = new Int32Array(land.length);
  const queue = new Int32Array(land.length);
  let components = 0;
  let best = 0;
  let bestSize = 0;

  for (let seed = 0; seed < land.length; seed += 1) {
    if (land[seed] || label[seed]) continue;

    components += 1;
    let head = 0;
    let tail = 0;
    queue[tail] = seed;
    tail += 1;
    label[seed] = components;

    while (head < tail) {
      const cell = queue[head];
      head += 1;

      const row = Math.floor(cell / COLUMNS);
      const column = cell % COLUMNS;

      for (let side = 0; side < 8; side += 1) {
        const dRow = OFF_ROW[side];
        const nextRow = row + dRow;
        if (nextRow < 0 || nextRow >= ROWS) continue;

        const dColumn = OFF_COLUMN[side];
        const shifted = column + dColumn;
        const nextColumn = shifted < 0 ? COLUMNS - 1 : shifted >= COLUMNS ? 0 : shifted;
        const next = index(nextRow, nextColumn);

        if (land[next] || label[next]) continue;

        // The same corner rule the router uses, so "connected" means connected by water a
        // hull can cross.
        if (dRow !== 0 && dColumn !== 0) {
          if (land[index(row, nextColumn)] || land[index(nextRow, column)]) continue;
        }

        label[next] = components;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (tail > bestSize) {
      bestSize = tail;
      best = components;
    }
  }

  let blocked = 0;

  for (let cell = 0; cell < land.length; cell += 1) {
    if (!land[cell] && label[cell] !== best) {
      land[cell] = 1;
      blocked += 1;
    }
  }

  return { blocked, components, ocean: bestSize };
}

/**
 * Flood fill from a point, so the build can assert what the mask actually connects.
 * This is the only check that a strait box opened the passage it was aimed at, and that
 * a canal did *not* get opened by accident.
 *
 * It moves under the same rule as the router: a diagonal step is only taken when the two
 * cells sharing that corner are open too. Without it the fill squeezes through corners
 * that no hull could pass — the Panama isthmus, one cell thick at this resolution, leaks
 * exactly there — and the checks below would report passages the game will not sail.
 */
function floodFill(land, seedLat, seedLng, bounds = null) {
  const seen = new Uint8Array(ROWS * COLUMNS);
  const queue = new Int32Array(ROWS * COLUMNS);
  let head = 0;
  let tail = 0;

  const startRow = Math.min(ROWS - 1, Math.max(0, Math.floor((seedLat - LAT_START) / CELL_DEGREES)));
  const startColumn = ((Math.floor((seedLng - LON_START) / CELL_DEGREES) % COLUMNS) + COLUMNS) % COLUMNS;
  const start = index(startRow, startColumn);

  seen[start] = 1;
  queue[tail] = start;
  tail += 1;

  while (head < tail) {
    const current = queue[head];
    head += 1;

    const row = Math.floor(current / COLUMNS);
    const column = current % COLUMNS;

    for (let dRow = -1; dRow <= 1; dRow += 1) {
      const nextRow = row + dRow;
      if (nextRow < 0 || nextRow >= ROWS) continue;

      for (let dColumn = -1; dColumn <= 1; dColumn += 1) {
        if (dRow === 0 && dColumn === 0) continue;

        const nextColumn = (((column + dColumn) % COLUMNS) + COLUMNS) % COLUMNS;

        // A boxed fill is how the canal checks below look for a *local* crossing, so a
        // route that leaves the region is not evidence of one.
        if (bounds) {
          const nextLatitude = rowLatitude(nextRow);
          const nextLongitude = columnLongitude(nextColumn);

          if (nextLatitude < bounds.latMin || nextLatitude > bounds.latMax) continue;
          if (nextLongitude < bounds.lonMin || nextLongitude > bounds.lonMax) continue;
        }

        // No corner cutting: both cells touching the shared corner must be water.
        if (dRow !== 0 && dColumn !== 0) {
          const aroundColumn = (((column + dColumn) % COLUMNS) + COLUMNS) % COLUMNS;
          if (land[index(row, aroundColumn)] || land[index(nextRow, column)]) continue;
        }

        const next = index(nextRow, nextColumn);
        if (seen[next] || land[next]) continue;

        seen[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  return seen;
}

const reaches = (seen, lat, lng) => {
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((lat - LAT_START) / CELL_DEGREES)));
  const column = ((Math.floor((lng - LON_START) / CELL_DEGREES) % COLUMNS) + COLUMNS) % COLUMNS;

  return seen[index(row, column)] === 1;
};

/**
 * Whether a canal is a local shortcut: the two points are only ~50 km apart across an
 * isthmus, so a passage found *inside a box around them* means the land between is not
 * sealed.
 *
 * This cannot be asked globally — every ocean is the same ocean, joined around the Cape —
 * so the run has to be clipped to the neighbourhood of the canal.
 */
function canalIsOpen(land, seedLat, seedLng, targetLat, targetLng, bounds) {
  return reaches(floodFill(land, seedLat, seedLng, bounds), targetLat, targetLng);
}

/** Packs the mask as a base64 bitfield, row major: 32 kB for the whole world. */
function encode(land) {
  const bytes = Buffer.alloc(Math.ceil(land.length / 8));

  for (let cell = 0; cell < land.length; cell += 1) {
    if (land[cell]) bytes[cell >> 3] |= 1 << (7 - (cell % 8));
  }

  return bytes.toString('base64');
}

function main() {
  const geoJSON = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

  if (!fs.existsSync(LAKES_SOURCE)) {
    throw new Error(`${path.relative(ROOT, LAKES_SOURCE)} is missing — run \`npm run build:borders\` first`);
  }

  const lakes = JSON.parse(fs.readFileSync(LAKES_SOURCE, 'utf8')).features.filter((feature) =>
    GREAT_LAKES.includes(feature.properties?.name)
  );

  if (lakes.length !== GREAT_LAKES.length) {
    throw new Error(`${path.relative(ROOT, LAKES_SOURCE)} is missing ${GREAT_LAKES.length - lakes.length} of the Great Lakes`);
  }

  const land = rasterise(geoJSON.features);
  const lakesCleared = carveLakes(land, lakes);
  const cleared = carveWaterways(land, WATERWAYS);
  const frozen = freezePolarSeas(land);
  const closed = keepOpenOcean(land);

  const landCells = land.reduce((total, value) => total + value, 0);

  console.log(
    `${geoJSON.features.length} countries rasterised to ${COLUMNS}x${ROWS} cells ` +
      `(${CELL_DEGREES} deg): ${landCells} land, ${land.length - landCells} sea, ` +
      `${cleared} cells cleared for ${STRAITS.length} straits, ${CANALS.length} canals and ` +
      `${GREAT_LAKES_CHANNELS.length} Great Lakes channels, ${lakesCleared} cells cleared ` +
      `for ${lakes.length} lakes, ${frozen} cells frozen north of ${ICE_LATITUDE} N`
  );

  console.log(
    `  open ocean is ${closed.ocean.toLocaleString()} cells of ${closed.components.toLocaleString()} ` +
      `bodies of water; ${closed.blocked.toLocaleString()} cells of closed basin set to land`
  );

  // What the mask must connect, and the canals it must not.
  const atlantic = floodFill(land, 45, -30);
  const checks = [
    ['Black Sea reachable from the Atlantic', reaches(atlantic, 43, 32), true],
    ['Baltic reachable from the Atlantic', reaches(atlantic, 57, 19), true],
    ['Mediterranean reachable from the Atlantic', reaches(atlantic, 36, -3), true],
    ['Red Sea reachable from the Atlantic', reaches(atlantic, 20, 38), true],
    ['Persian Gulf reachable from the Atlantic', reaches(atlantic, 27, 52), true],
    ['Pacific reachable from the Atlantic', reaches(atlantic, -30, -110), true],
    ['Sea of Azov reachable through the Kerch strait', reaches(atlantic, 46.2, 36.5), true],
    ['Adriatic reachable from the Atlantic', reaches(atlantic, 44, 14), true],
    ['Aegean reachable from the Atlantic', reaches(atlantic, 38, 24), true],
    ['North Sea reachable from the Atlantic', reaches(atlantic, 55, 3), true],
    ['Gulf of Bothnia reachable from the Atlantic', reaches(atlantic, 63, 20), true],

    // The Great Lakes, lake by lake, from the Atlantic up the St. Lawrence.
    ['Lake Ontario reachable up the St. Lawrence', reaches(atlantic, 43.6, -78), true],
    ['Lake Erie reachable through the Welland', reaches(atlantic, 42.5, -80), true],
    ['Lake Huron reachable through the Detroit river', reaches(atlantic, 44.8, -82), true],
    ['Lake Michigan reachable through the Straits of Mackinac', reaches(atlantic, 43.5, -87), true],
    ['Lake Superior reachable through the St. Marys river', reaches(atlantic, 47.5, -87.5), true],
  ];

  // The lakes must not become a back door. Hudson Bay is the same ocean as the Atlantic —
  // it is reached round the north of Quebec — so what has to be false is a *local* passage
  // across the height of land between James Bay and Lake Superior.
  checks.push([
    'Hudson Bay does not reach the Great Lakes across Ontario',
    canalIsOpen(land, 52, -80, 48.5, -85, { latMin: 44, latMax: 56, lonMin: -95, lonMax: -74 }),
    false,
  ]);

  // The two straits that are a corridor rather than a doorway, tested end to end inside
  // their own neighbourhoods.
  //
  // "Reachable from the Atlantic" cannot check these: the Pacific is the same ocean, so a
  // strait with a hole in the middle still passes that test — the way round Cape Horn
  // counts. What has to be true is that a hull can get from one mouth to the other without
  // leaving the strait, which is what a boxed fill measures. Magellan was carved at both
  // ends and blocked across the Segunda Angostura, and every Argentine-Chilean voyage paid
  // for it by rounding the Horn.
  checks.push([
    'the Strait of Magellan is a through passage',
    canalIsOpen(land, -52.4, -68.8, -52.8, -74.6, { latMin: -56, latMax: -49, lonMin: -77, lonMax: -66 }),
    true,
  ]);
  checks.push([
    'the Salish Sea is reached through the Strait of Juan de Fuca',
    canalIsOpen(land, 47.7, -122.5, 48.3, -124.6, { latMin: 46.5, latMax: 50, lonMin: -126, lonMax: -121 }),
    true,
  ]);
  // ... and that widening those corridors did not cut the Olympic Peninsula in half, which
  // would be a 55 km shortcut from Puget Sound straight out to the Pacific. The window stops
  // short of the strait of Juan de Fuca in the north (the legitimate doorway) and of the
  // peninsula's own southern tip, so the only way this can pass is through the land.
  checks.push([
    'the Olympic Peninsula is not cut through',
    canalIsOpen(land, 47.75, -125.25, 47.75, -122.25, { latMin: 46.8, latMax: 48, lonMin: -126, lonMax: -121 }),
    false,
  ]);
  checks.push(['Lake Winnipeg is not a sea route', reaches(atlantic, 52.5, -98), false]);
  checks.push(['Great Salt Lake is not a sea route', reaches(atlantic, 41.2, -112.5), false]);
  checks.push(['Lake Nicaragua is not a sea route', reaches(atlantic, 11.6, -85.4), false]);

  // The polar ice, checked inside the Arctic rather than globally: the Kara and Laptev seas
  // are reachable from the Atlantic by going round Africa and Asia, so what matters is that
  // they are not reachable from each other round the coast.
  const kara = { latMin: 66, latMax: 82, lonMin: 20, lonMax: 110 };
  checks.push([
    'the Kara and Barents seas connect',
    canalIsOpen(land, 72, 60, 72, 35, kara),
    true,
  ]);
  checks.push([
    'Taymyr blocks the Kara sea from the Laptev sea',
    canalIsOpen(land, 72, 60, 74, 118, kara),
    false,
  ]);
  checks.push([
    'the pole cannot be crossed',
    canalIsOpen(land, 80, 0, 80, 179, { latMin: 74, latMax: 90, lonMin: -180, lonMax: 180 }),
    false,
  ]);

  // The canals, each tested the same way: end to end, inside its own neighbourhood, so a
  // route that leaves the region and arrives from the other ocean is not evidence of one.
  checks.push([
    'Suez is a shortcut',
    canalIsOpen(land, 31.9, 32.4, 29.5, 32.7, { latMin: 27, latMax: 33, lonMin: 31, lonMax: 35.5 }),
    true,
  ]);
  checks.push([
    'Panama is a shortcut',
    canalIsOpen(land, 10.5, -79, 7.5, -79.8, { latMin: 6, latMax: 11.5, lonMin: -82, lonMax: -76.5 }),
    true,
  ]);
  checks.push([
    'Kiel is a shortcut',
    canalIsOpen(land, 54.4, 8.3, 54.5, 10.8, { latMin: 52.5, latMax: 56, lonMin: 7.5, lonMax: 12 }),
    true,
  ]);
  checks.push([
    'Corinth is a shortcut',
    canalIsOpen(land, 37.9, 23.4, 38.2, 22.5, { latMin: 37.6, latMax: 39, lonMin: 21.8, lonMax: 24 }),
    true,
  ]);

  let failed = 0;
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  }

  const payload = {
    version: 1,
    cellDegrees: CELL_DEGREES,
    latStart: LAT_START,
    lonStart: LON_START,
    rows: ROWS,
    columns: COLUMNS,
    // Every canal is open (see CANALS) and nothing is icebroken: the polar pack is the only
    // water a hull cannot use.
    canals: CANALS.length,
    greatLakes: GREAT_LAKES.length,
    iceLatitude: ICE_LATITUDE,
    openOceanCells: closed.ocean,
    straits: STRAITS.length,
    land: encode(land),
  };

  const json = JSON.stringify(payload);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);

  console.log(
    `${path.relative(ROOT, OUT)}: ${(json.length / 1024).toFixed(1)} kB ` +
      `(${land.length.toLocaleString()} cells)`
  );

  if (failed > 0) {
    console.error(`${failed} connectivity check(s) failed — the grid is not usable.`);
    process.exitCode = 1;
  }
}

main();
