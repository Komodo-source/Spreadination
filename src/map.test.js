/**
 * Regression guard for the map's stylesheet.
 *
 * The map looked broken for a while because Leaflet's own stylesheet had no import
 * anywhere in the app: the panes lost their absolute positioning and z-order, and
 * tiles, markers and tooltips were laid out in normal document flow. Nothing catches
 * a missing CSS import — the build compiles, the lint passes, the tests pass — so the
 * import is asserted here.
 *
 * Mounting the real map is not possible in this setup: react-leaflet is ESM-only
 * (`"type": "module"`), which create-react-app's jest runner cannot load.
 */

import { readFileSync } from 'fs';
import path from 'path';

const mapSource = readFileSync(path.join(__dirname, 'map.js'), 'utf8');

describe('map stylesheets', () => {
  it("imports Leaflet's stylesheet from a path that exists", () => {
    expect(() => require.resolve('leaflet/dist/leaflet.css')).not.toThrow();
    expect(mapSource).toContain("import 'leaflet/dist/leaflet.css'");
  });

  it('loads it before map.css, so the map overrides still win', () => {
    const leafletCss = mapSource.indexOf("import 'leaflet/dist/leaflet.css'");
    const mapCss = mapSource.indexOf("import './map.css'");

    expect(leafletCss).toBeGreaterThanOrEqual(0);
    expect(mapCss).toBeGreaterThan(leafletCss);
  });
});

describe('map wrapping', () => {
  it('lets the world repeat instead of stopping at the antimeridian', () => {
    // The map used to stop dead at 180 E. Three options did it, and they have to agree:
    // `worldCopyJump` carries the view onto the wrapped copy of the world, the tile
    // layer has to be allowed to fetch that copy, and there must be no `maxBounds` to
    // snap the view back to ±180 — which is what made the two fight, so panning stuck
    // and jittered at the edge instead of sailing on.
    expect(mapSource).toMatch(/^\s*worldCopyJump\s*$/m);
    expect(mapSource).not.toMatch(/\bmaxBounds\s*=/);
    expect(mapSource).not.toMatch(/\bnoWrap\b\s*[\n=]/);
  });
});
