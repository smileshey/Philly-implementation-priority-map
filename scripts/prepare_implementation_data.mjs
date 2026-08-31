#!/usr/bin/env node

/**
 * Download the three public implementation-context sources and attach their
 * signals to the trimmed SoP segments. All spatial work happens here so the
 * browser only renders, reweights, and filters precomputed values.
 *
 * Requires Node 20+ (native fetch): npm run prepare:data
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(ROOT, 'public/data');
const SOP_PATH = resolve(DATA_DIR, 'sop_segments.geojson');

const HIN_URL =
  'https://hub.arcgis.com/api/v3/datasets/7e416319784a463fa0d8b528d7ccf511_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1';

const CAPITAL_URL =
  'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/26/query?' +
  new URLSearchParams({
    where: '1=1',
    geometry: '-75.30,39.85,-74.95,40.15',
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PROJECT_ID,PROJECT_TI,PROJECT_IM,PUBLIC_NAR,EST_CONSTR,CURRENT_CO,UNDER_CONS,FUTURE_DEV,IN_DEVELOP,STREET_NAM',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson'
  }).toString();

const EPA_BASE = 'https://geopub.epa.gov/ArcGIS/rest/services/EMEF/efpoints/MapServer';
const epaUrl = (layer) => `${EPA_BASE}/${layer}/query?` + new URLSearchParams({
  where: "city_name='PHILADELPHIA' AND state_code='PA'",
  outFields: 'registry_id,primary_name,location_address,city_name,state_code,postal_code,latitude,longitude,facility_url',
  returnGeometry: 'true',
  outSR: '4326',
  f: 'geojson'
}).toString();

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LON = 85_300;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

async function fetchGeoJSON(label, url) {
  process.stdout.write(`Downloading ${label}... `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  if (data.error) throw new Error(`${label}: ${JSON.stringify(data.error)}`);
  console.log(`${data.features?.length ?? 0} features`);
  return data;
}

function bbox(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      minX = Math.min(minX, value[0]); minY = Math.min(minY, value[1]);
      maxX = Math.max(maxX, value[0]); maxY = Math.max(maxY, value[1]);
    } else value.forEach(visit);
  };
  visit(feature.geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

function expand(box, meters) {
  return [box[0] - meters / METERS_PER_DEG_LON, box[1] - meters / METERS_PER_DEG_LAT,
    box[2] + meters / METERS_PER_DEG_LON, box[3] + meters / METERS_PER_DEG_LAT];
}

function overlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

class GridIndex {
  constructor(features, cellSize = 0.01) {
    this.cellSize = cellSize;
    this.cells = new Map();
    for (const feature of features) {
      const item = { feature, bbox: bbox(feature) };
      const range = this.range(item.bbox);
      for (let x = range[0]; x <= range[2]; x += 1) for (let y = range[1]; y <= range[3]; y += 1) {
        const key = `${x}:${y}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(item);
      }
    }
  }
  range(box) {
    return box.map((value) => Math.floor(value / this.cellSize));
  }
  search(box) {
    const range = this.range(box);
    const results = new Set();
    for (let x = range[0]; x <= range[2]; x += 1) for (let y = range[1]; y <= range[3]; y += 1) {
      for (const item of this.cells.get(`${x}:${y}`) ?? []) if (overlaps(item.bbox, box)) results.add(item);
    }
    return [...results];
  }
}

const meters = ([x, y]) => [x * METERS_PER_DEG_LON, y * METERS_PER_DEG_LAT];

function pointSegmentDistance(point, a, b) {
  const [px, py] = meters(point), [ax, ay] = meters(a), [bx, by] = meters(b);
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const vv = vx * vx + vy * vy;
  const t = vv === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a, b, c, d) {
  const e = 1e-12, o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  const on = (p, q, r) => r[0] >= Math.min(p[0], q[0]) - e && r[0] <= Math.max(p[0], q[0]) + e &&
    r[1] >= Math.min(p[1], q[1]) - e && r[1] <= Math.max(p[1], q[1]) + e;
  if (((o1 > e && o2 < -e) || (o1 < -e && o2 > e)) && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e))) return true;
  return (Math.abs(o1) <= e && on(a, b, c)) || (Math.abs(o2) <= e && on(a, b, d)) ||
    (Math.abs(o3) <= e && on(c, d, a)) || (Math.abs(o4) <= e && on(c, d, b));
}

function pairDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function lineDistance(a, b, stopAt) {
  const parts = b.type === 'LineString' ? [b.coordinates] : b.coordinates;
  let best = Infinity;
  for (const part of parts) for (let i = 0; i < a.coordinates.length - 1; i += 1) {
    for (let j = 0; j < part.length - 1; j += 1) {
      best = Math.min(best, pairDistance(a.coordinates[i], a.coordinates[i + 1], part[j], part[j + 1]));
      if (best <= stopAt) return best;
    }
  }
  return best;
}

function pointLineDistance(point, line) {
  let best = Infinity;
  for (let i = 0; i < line.coordinates.length - 1; i += 1) {
    best = Math.min(best, pointSegmentDistance(point.coordinates, line.coordinates[i], line.coordinates[i + 1]));
  }
  return best;
}

function nearestLine(segment, index, threshold) {
  let nearest = Infinity, match = null;
  for (const item of index.search(expand(bbox(segment), threshold))) {
    const distance = lineDistance(segment.geometry, item.feature.geometry, threshold);
    if (distance < nearest) { nearest = distance; match = item.feature; }
  }
  return { signal: nearest <= threshold ? 1 : 0, distance: Number.isFinite(nearest) ? Math.round(nearest) : null, match };
}

function nearestSite(segment, index, maxDistance) {
  let nearest = Infinity, match = null;
  for (const item of index.search(expand(bbox(segment), maxDistance))) {
    const distance = pointLineDistance(item.feature.geometry, segment.geometry);
    if (distance < nearest) { nearest = distance; match = item.feature; }
  }
  return {
    signal: nearest <= maxDistance ? clamp01(1 - nearest / maxDistance) : 0,
    distance: Number.isFinite(nearest) ? Math.round(nearest) : null,
    match
  };
}

function compact(collection) {
  return JSON.stringify(collection);
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const sop = JSON.parse(await readFile(SOP_PATH, 'utf8'));
  const [hin, capital, brownfields, superfund] = await Promise.all([
    fetchGeoJSON('Vision Zero HIN', HIN_URL),
    fetchGeoJSON('capital projects', CAPITAL_URL),
    fetchGeoJSON('EPA Brownfields', epaUrl(5)),
    fetchGeoJSON('EPA Superfund', epaUrl(0))
  ]);
  const environmental = { type: 'FeatureCollection', features: [
    ...brownfields.features.map((feature) => ({ ...feature, properties: { ...feature.properties, site_type: 'Brownfield' } })),
    ...superfund.features.map((feature) => ({ ...feature, properties: { ...feature.properties, site_type: 'Superfund' } }))
  ] };
  const hinIndex = new GridIndex(hin.features);
  const capitalIndex = new GridIndex(capital.features);
  const environmentalIndex = new GridIndex(environmental.features);

  console.log(`Enriching ${sop.features.length} SoP segments...`);
  const features = sop.features.map((feature) => {
    const hinMatch = nearestLine(feature, hinIndex, 25);
    const capitalMatch = nearestLine(feature, capitalIndex, 50);
    const environmentalMatch = nearestSite(feature, environmentalIndex, 500);
    const capitalProps = capitalMatch.match?.properties ?? {};
    const siteProps = environmentalMatch.match?.properties ?? {};
    return {
      ...feature,
      properties: {
        ...feature.properties,
        need_score: clamp01(1 - Number(feature.properties.SoPIndex8Norm ?? 0) / 100),
        hin_signal: hinMatch.signal,
        hin_distance_m: hinMatch.distance,
        capital_signal: capitalMatch.signal,
        capital_distance_m: capitalMatch.distance,
        capital_project_name: capitalProps.PROJECT_TI ?? capitalProps.STREET_NAM ?? null,
        environmental_signal: environmentalMatch.signal,
        environmental_distance_m: environmentalMatch.distance,
        environmental_site_name: siteProps.primary_name ?? null,
        environmental_site_type: siteProps.site_type ?? null
      }
    };
  });

  await Promise.all([
    writeFile(resolve(DATA_DIR, 'implementation_segments.geojson'), compact({ type: 'FeatureCollection', features })),
    writeFile(resolve(DATA_DIR, 'vision_zero.geojson'), compact(hin)),
    writeFile(resolve(DATA_DIR, 'capital_projects.geojson'), compact(capital)),
    writeFile(resolve(DATA_DIR, 'environmental_sites.geojson'), compact(environmental))
  ]);
  console.log('Wrote browser-ready data to public/data/.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
