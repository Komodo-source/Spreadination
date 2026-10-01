/**
 * Basemaps for the world map.
 *
 * The map used to render bare Natural Earth polygons on a flat sea: no landmarks,
 * no relief, nothing to navigate by. These are Esri's keyless ArcGIS Online tile
 * services — a different tile family from OpenStreetMap — so the ports, routes and
 * city markers now sit on top of real bathymetry, imagery and relief.
 *
 * All of them are plain raster `{z}/{x}/{y}` services (ArcGIS serves the row before
 * the column, hence `{z}/{y}/{x}`), which is exactly what Leaflet already knows how
 * to pan, zoom and cache, so the map keeps the OSM-style interaction for free.
 */

/** Hard ceiling for the map. Tiles past `maxNativeZoom` are upscaled by Leaflet. */
export const MAX_MAP_ZOOM = 18;

export const BASEMAPS = [
  {
    id: 'nautical',
    label: 'Nautical',
    // Bathymetry plus shaded relief: the obvious default for a shipping game.
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 13,
    attribution:
      'Tiles © Esri — GEBCO, NOAA, National Geographic, Garmin, HERE, Geonames.org and other contributors',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 19,
    attribution: 'Tiles © Esri — Maxar, Earthstar Geographics and the GIS User Community',
  },
  {
    id: 'terrain',
    label: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 13,
    attribution: 'Tiles © Esri — USGS, TANA, DeLorme, NPS',
  },
  {
    id: 'topographic',
    label: 'Topographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 16,
    attribution: 'Tiles © Esri — National Geographic, GEBCO, NOAA, iPC and the GIS User Community',
  },
];

// The sea is drawn before the tiles arrive; keeping it blue avoids a white flash.
export const DEFAULT_BASEMAP_ID = 'nautical';

export function findBasemap(id) {
  return BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0];
}
