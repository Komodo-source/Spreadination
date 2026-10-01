#!/usr/bin/env node
/**
 * Builds the country outlines that the world map draws behind the ports.
 *
 * The map has no tile layer, so these polygons *are* the world. Two copies are
 * emitted so the map can trade detail for speed as the player zooms:
 *
 *   public/countries-low.geojson   1:110m Natural Earth, ~10k vertices  (zoom 1-4)
 *   public/countries-high.geojson   1:50m Natural Earth, ~100k vertices (zoom 5+)
 *   public/lakes.geojson            1:110m Natural Earth, 24 features
 *
 * All three are served from `public/`, so a host can gzip them and the browser caches
 * them with the rest of the bundle. Coordinates are rounded to the fewest decimals
 * that cannot be seen at the zoom level each file is used for, and Natural Earth's
 * ~90 per-feature columns are dropped, because Leaflet only reads the geometry.
 *
 * The lakes are not a map layer — the basemap tiles draw them — but they are a *build
 * input*: the country outlines run straight across the Great Lakes, so
 * `npm run build:sea-grid` needs the lake polygons to carve them back out as water. See
 * `scripts/build-sea-grid.js`.
 *
 * Run with: npm run build:borders
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'natural-earth');

const NATURAL_EARTH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

const SOURCES = [
  {
    file: 'countries-low.geojson',
    url: `${NATURAL_EARTH}/ne_110m_admin_0_countries.geojson`,
    // 1 px covers 0.044 deg at zoom 5, where this file stops being used, so four
    // decimals (about 11 m) is already far below one pixel.
    precision: 4,
  },
  {
    file: 'countries-high.geojson',
    url: `${NATURAL_EARTH}/ne_50m_admin_0_countries.geojson`,
    // This one is drawn up to zoom 18, where 1 px is 0.0000054 deg. Five decimals
    // (about 1 m) stays under 2 px even there, while still cutting the payload a lot.
    precision: 5,
  },
  {
    file: 'lakes.geojson',
    url: `${NATURAL_EARTH}/ne_110m_lakes.geojson`,
    // Never drawn, only rasterised by the sea grid, whose cells are 0.5 deg across. Four
    // decimals is the same output as the coarse borders, and far finer than a cell.
    precision: 4,
  },
];

function download(url, destination) {
  if (fs.existsSync(destination)) {
    return Promise.resolve(fs.readFileSync(destination));
  }

  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'sea-builder-border-build' } }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${url} returned HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, body);
          resolve(body);
        });
      })
      .on('error', reject);
  });
}

function isPosition(node) {
  return Array.isArray(node) && typeof node[0] === 'number';
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Rounds every coordinate and drops the points that rounding collapsed together. */
function cleanRing(ring, precision) {
  const cleaned = [];

  for (const position of ring) {
    const longitude = round(position[0], precision);
    const latitude = round(position[1], precision);
    const previous = cleaned[cleaned.length - 1];

    if (previous && previous[0] === longitude && previous[1] === latitude) {
      continue;
    }

    cleaned.push([longitude, latitude]);
  }

  // A ring must keep its closing point, and fewer than four points cannot enclose anything.
  if (cleaned.length < 4) {
    return null;
  }

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    cleaned.push([first[0], first[1]]);
  }

  return cleaned.length >= 4 ? cleaned : null;
}

/** Walks the Polygon/MultiPolygon nesting and returns only the rings that survive. */
function cleanCoordinates(node, precision) {
  if (isPosition(node[0])) {
    return cleanRing(node, precision);
  }

  const children = [];
  for (const child of node) {
    const cleaned = cleanCoordinates(child, precision);
    if (cleaned && cleaned.length > 0) {
      children.push(cleaned);
    }
  }

  return children.length > 0 ? children : null;
}

function countPositions(node) {
  if (isPosition(node)) {
    return 1;
  }

  let total = 0;
  for (const child of node) {
    total += countPositions(child);
  }
  return total;
}

function buildFeatureCollection(source, geoJSON) {
  const features = [];

  for (const feature of geoJSON.features) {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      continue;
    }

    const coordinates = cleanCoordinates(geometry.coordinates, source.precision);
    if (!coordinates) {
      continue;
    }

    features.push({
      type: 'Feature',
      // Countries carry NAME / ADMIN, the lakes layer carries a lowercase `name`.
      properties: {
        name: feature.properties?.NAME || feature.properties?.name || feature.properties?.ADMIN || '',
      },
      geometry: { type: geometry.type, coordinates },
    });
  }

  return { type: 'FeatureCollection', features };
}

async function buildSource(source) {
  const cachePath = path.join(CACHE_DIR, path.basename(source.url));
  const raw = await download(source.url, cachePath);
  const geoJSON = JSON.parse(raw.toString('utf8'));

  const before = geoJSON.features.reduce(
    (total, feature) => (feature.geometry ? total + countPositions(feature.geometry.coordinates) : total),
    0
  );

  const output = buildFeatureCollection(source, geoJSON);
  const after = output.features.reduce(
    (total, feature) => total + countPositions(feature.geometry.coordinates),
    0
  );

  const json = JSON.stringify(output);
  const outPath = path.join(OUT_DIR, source.file);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, json);

  console.log(
    `${source.file}: ${output.features.length} features, ${before} -> ${after} vertices, ` +
      `${(raw.length / 1048576).toFixed(2)} MB -> ${(json.length / 1048576).toFixed(2)} MB`
  );
}

async function main() {
  for (const source of SOURCES) {
    await buildSource(source);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
