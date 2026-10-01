#!/usr/bin/env node
/**
 * Trims the two raw aviation dumps in src/assets down to what the game needs.
 *
 * Run with: node scripts/trim-aviation-data.js
 *
 * Pass --dry-run to report what would be kept without backing up or writing.
 *
 * Both inputs are wholesale public dumps and are far larger than the game ever
 * uses. This script rewrites them in place (keeping a .backup of each original,
 * the same convention as ports.json.backup) so src/map.js keeps importing
 * `airports.json` unchanged.
 *
 *   airports.json
 *     The full OurAirports dump (86,151 rows). The map only ever wanted the fields
 *     that move goods and people, so only `large_airport` rows are kept (1,175).
 *
 *   aircraft-database-complete-2025-08.json
 *     A 609,368-row airframe registry exported from OpenSky, delivered UTF-16 LE
 *     with two defects:
 *       1. every key and string value is wrapped in literal single quotes, e.g.
 *          {"'icao24'":"'000000'"}, so parsing yields "'000000'" instead of "000000";
 *       2. it is not UTF-8, so it cannot be imported by the bundler as-is.
 *     Both are fixed here, and the registry is collapsed from one row per airframe
 *     to one row per cargo type designator: the dump carries no cargo flag, so
 *     "used in goods transportation" is matched on the ICAO type designator (the
 *     747, 767, 777, A300/A330, MD-11, Il-76, An-124, C-130 families ...).
 *
 *     Several designators use the ICAO code rather than the manufacturer's name:
 *     the Dash 8 is DH8A-DH8D (not DHC8) and the An-124/An-225 are A124/A225.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

// `--dry-run` reports the result without touching either file, which is how the
// cargo-type list below is checked against the full registry before a write.
const DRY_RUN = process.argv.includes('--dry-run');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'src', 'assets');
const AIRPORTS = path.join(ASSETS, 'airports.json');
const AIRCRAFT = path.join(ASSETS, 'aircraft-database-complete-2025-08.json');

// Only the major fields carry scheduled goods and passenger traffic. Medium and
// small fields, heliports, seaplane bases and closed rows are dropped.
const AIRPORT_TYPES = new Set(['large_airport']);

/**
 * ICAO type designators of aircraft that carry freight.
 *
 * The registry stores the *base* type (a 747-400F is plain "B744"), so dedicated
 * freighters cannot be told apart from the passenger variant by a suffix. Every
 * designator below therefore names a type that is flown as a freighter or is a
 * military airlifter — the widebody fleets that move the bulk of air cargo, the
 * narrowbody/regional types that fly as conversions, and the Soviet-era and
 * turboprop transports.
 *
 * Aircraft whose designator is not on this list (Cessna 172, A320, gliders and so
 * on) are dropped even though a handful of them have cargo variants: including the
 * whole type would put thousands of private airframes into a cargo catalog.
 */
const CARGO_TYPES = new Set([
  // Widebody freighters and combis.
  'B741', 'B742', 'B743', 'B744', 'B748',
  'B762', 'B763',
  'B772', 'B773', 'B77L', 'B77W',
  'A306', 'A30B', 'A310',
  'A332', 'A333',
  'MD11', 'DC10', 'DC86', 'DC87',
  'IL96',
  // Narrowbody freighters and the standard passenger-to-freighter conversions
  // (737-800BCF, 757PF, A321P2F, BAe 146QT ...).
  'B721', 'B722',
  'B732', 'B733', 'B734', 'B735', 'B736', 'B738', 'B739',
  'B752', 'B753',
  'A320', 'A321',
  'B461', 'B462', 'B463',
  // Regional and turboprop freighters.
  'AT72', 'AT75', 'AT76',
  'DH8A', 'DH8B', 'DH8C', 'DH8D', 'DHC6', 'DHC7',
  'SF34', 'SH36', 'SC7',
  'L410', 'CN35', 'C212', 'M28',
  'F27', 'F50', 'C208', 'T204',
  // Military airlift.
  'C130', 'C17', 'C5', 'C5M', 'A400', 'IL76', 'IL78',
  'AN12', 'AN22', 'AN24', 'AN26', 'AN30', 'AN32', 'AN72', 'AN74',
  'A124', 'A225',
]);

/**
 * Country of origin of each catalog manufacturer, written to the catalog's `nation`
 * field. Keyed on the lower-cased name so the registry's own casing (`Bae`,
 * `Mcdonnell Douglas`) does not matter. Joint ventures are credited to the country
 * they are headquartered in.
 */
const NATION_BY_MANUFACTURER = new Map([
  ['boeing', { nation: 'United States', code: 'US' }],
  ['cessna', { nation: 'United States', code: 'US' }],
  ['lockheed', { nation: 'United States', code: 'US' }],
  ['mcdonnell douglas', { nation: 'United States', code: 'US' }],
  ['douglas', { nation: 'United States', code: 'US' }],
  ['airbus', { nation: 'France', code: 'FR' }],
  ['airbus military', { nation: 'Spain', code: 'ES' }],
  ['avions de transport regional', { nation: 'France', code: 'FR' }],
  ['bombardier', { nation: 'Canada', code: 'CA' }],
  ['de havilland canada', { nation: 'Canada', code: 'CA' }],
  ['ilyushin', { nation: 'Russia', code: 'RU' }],
  ['tupolev', { nation: 'Russia', code: 'RU' }],
  ['saab', { nation: 'Sweden', code: 'SE' }],
  ['let', { nation: 'Czech Republic', code: 'CZ' }],
  ['antonov', { nation: 'Ukraine', code: 'UA' }],
  ['casa', { nation: 'Spain', code: 'ES' }],
  ['construcciones aeronauticas sa', { nation: 'Spain', code: 'ES' }],
  ['fokker', { nation: 'Netherlands', code: 'NL' }],
  ['short bros', { nation: 'United Kingdom', code: 'GB' }],
  ['short bros. & harland', { nation: 'United Kingdom', code: 'GB' }],
  ['bae', { nation: 'United Kingdom', code: 'GB' }],
  ['pzl', { nation: 'Poland', code: 'PL' }],
]);

/** Strips the stray single quote the export wraps around every string. */
function unquote(value) {
  if (typeof value !== 'string') {
    return value;
  }
  let text = value;
  if (text.startsWith("'")) text = text.slice(1);
  if (text.endsWith("'")) text = text.slice(0, -1);
  return text;
}

/** `"'icao24'"` -> `"icao24"`. */
function unquoteKey(key) {
  return unquote(key);
}

/**
 * The text columns carry HTML from the registry's own web forms (`&amp;`, `<br>`,
 * `&nbsp;`), which has no business in a JSON catalog.
 */
function cleanText(value) {
  if (!value) {
    return '';
  }
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Copies the original out of the way once, then leaves an existing backup alone. */
function ensureBackup(file) {
  const backup = `${file}.backup`;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup);
  }
  return backup;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function trimAirports() {
  const rows = JSON.parse(fs.readFileSync(AIRPORTS, 'utf8'));
  const kept = rows.filter((row) => AIRPORT_TYPES.has(row.type));

  // Guard: a rerun on an already-trimmed file must not wipe the catalog because
  // the type field it filters on has drifted.
  if (kept.length === 0 || kept.length === rows.length) {
    throw new Error(`airports.json: filter kept ${kept.length} of ${rows.length} rows, refusing to write`);
  }

  if (!DRY_RUN) {
    const backup = ensureBackup(AIRPORTS);
    writeJson(AIRPORTS, kept);
    console.log(`airports.json: ${rows.length} rows -> ${kept.length} large airports (backup: ${path.basename(backup)})`);
  } else {
    console.log(`airports.json: ${rows.length} rows -> ${kept.length} large airports [dry run]`);
  }
}

/** One line-oriented pass; the file is a JSON array of objects, one per line. */
function readAircraftCargoTypes() {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(AIRCRAFT, { encoding: 'utf16le' });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const types = new Map();
    let rows = 0;
    let kept = 0;

    lines.on('line', (line) => {
      let text = line.trim();
      // The array's own brackets, and the comma that sits on its own line between
      // two objects.
      if (!text || text === '[' || text === ']') {
        return;
      }
      if (text.endsWith(',')) {
        text = text.slice(0, -1);
      }
      if (!text) {
        return;
      }

      let raw;
      try {
        raw = JSON.parse(text);
      } catch (error) {
        return;
      }

      const record = {};
      for (const [key, value] of Object.entries(raw)) {
        record[unquoteKey(key)] = unquote(value);
      }

      rows += 1;

      const typecode = record.typecode;
      if (!typecode || !CARGO_TYPES.has(typecode)) {
        return;
      }
      kept += 1;

      let entry = types.get(typecode);
      if (!entry) {
        entry = {
          typecode,
          models: new Map(),
          manufacturers: new Map(),
          engines: '',
          aircraftClass: '',
          airframes: 0,
        };
        types.set(typecode, entry);
      }

      entry.airframes += 1;
      const model = cleanText(record.model);
      const manufacturer = cleanText(record.manufacturerName);
      const engines = cleanText(record.engines);
      if (model) {
        entry.models.set(model, (entry.models.get(model) || 0) + 1);
      }
      if (manufacturer) {
        entry.manufacturers.set(manufacturer, (entry.manufacturers.get(manufacturer) || 0) + 1);
      }
      // The first populated value wins; the columns are sparse and mostly empty.
      if (!entry.engines && engines) entry.engines = engines;
      if (!entry.aircraftClass && record.icaoAircraftClass) entry.aircraftClass = record.icaoAircraftClass;
    });

    lines.on('close', () => resolve({ types, rows, kept }));
    lines.on('error', reject);
    stream.on('error', reject);
  });
}

/** Most frequent value in a count map, so the catalog shows the typical model. */
function topValue(map) {
  let best = '';
  let bestCount = 0;
  for (const [value, count] of map) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

async function trimAircraft() {
  const { types, rows, kept } = await readAircraftCargoTypes();

  const catalog = [...types.values()]
    .map((entry) => {
      const manufacturer = topValue(entry.manufacturers);
      const origin = NATION_BY_MANUFACTURER.get(manufacturer.toLowerCase());
      const row = {
        typecode: entry.typecode,
        model: topValue(entry.models),
        manufacturer,
      };
      if (origin) {
        row.nation = origin.nation;
        row.nation_code = origin.code;
      }
      if (entry.engines) row.engines = entry.engines;
      if (entry.aircraftClass) row.aircraftClass = entry.aircraftClass;
      row.airframes = entry.airframes;
      return row;
    })
    .sort((a, b) => b.airframes - a.airframes || a.typecode.localeCompare(b.typecode));

  const missing = [...CARGO_TYPES].filter((typecode) => !types.has(typecode));

  if (DRY_RUN) {
    console.log(`aircraft: ${rows} airframes -> ${catalog.length} cargo types (${kept} airframes matched) [dry run]`);
    console.log(JSON.stringify(catalog, null, 2));
  } else {
    const backup = ensureBackup(AIRCRAFT);
    writeJson(AIRCRAFT, catalog);
    console.log(
      `aircraft: ${rows} airframes -> ${catalog.length} cargo types ` +
        `(${kept} airframes matched; backup: ${path.basename(backup)})`
    );
  }
  if (missing.length) {
    console.log(`  designators not present in the dump: ${missing.join(', ')}`);
  }
}

async function main() {
  trimAirports();
  await trimAircraft();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
