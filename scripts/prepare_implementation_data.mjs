#!/usr/bin/env node

/**
 * Download the public implementation-context and zoning sources and attach their
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

const CAPITAL_ENDPOINT =
  'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/26/query';
const CAPITAL_FIELDS =
  'PROJECT_ID,PROJECT_TI,PROJECT_IM,PUBLIC_NAR,EST_CONSTR,CURRENT_CO,UNDER_CONS,FUTURE_DEV,IN_DEVELOP,COMPLETED,LET_DATE_D,NTP_DATE,COMPLETI_1,OPEN_DATE,STREET_NAM';
const CAPITAL_AREA_PARAMS = {
  where: '1=1',
  geometry: '-75.30,39.85,-74.95,40.15',
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects'
};

const EPA_BASE = 'https://geopub.epa.gov/ArcGIS/rest/services/EMEF/efpoints/MapServer';
const epaUrl = (layer) => `${EPA_BASE}/${layer}/query?` + new URLSearchParams({
  where: "city_name='PHILADELPHIA' AND state_code='PA'",
  outFields: 'registry_id,primary_name,location_address,city_name,state_code,postal_code,latitude,longitude,facility_url',
  returnGeometry: 'true',
  outSR: '4326',
  f: 'geojson'
}).toString();

const ZONING_URL =
  'https://hub.arcgis.com/api/v3/datasets/0bdb0b5f13774c03abf8dc2f1aa01693_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1';

const ARCGIS_SOURCES = {
  streets: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/composite/FeatureServer/0/query',
  completeStreets: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/CompleteStreetsTypesStndrds/FeatureServer/0/query',
  permits: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/PERMITS/FeatureServer/0/query',
  pwdGsi: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/GSI_Public_Projects_Street/FeatureServer/0/query',
  pwdConstruction: 'https://services2.arcgis.com/POWz8dBwmjnei8fu/arcgis/rest/services/CIPIT_PROJECTS_OPEN/FeatureServer/0/query',
  septaStops: 'https://services2.arcgis.com/9U43PSoL47wawX5S/arcgis/rest/services/Transit_Stops_(Spring_2025)/FeatureServer/0/query',
  crashes: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/collision_crash_2020_2024/FeatureServer/0/query',
  floodplain: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/fema_floodplain_2023/FeatureServer/0/query',
  bike: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Bike_Network/FeatureServer/0/query',
  vacancy: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Vacant_Block_Percent_Combined/FeatureServer/0/query'
};

const HISTORIC_DISTRICTS_URL =
  'https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20historicdistricts_local&format=geojson';
const SOURCE_LINKS = {
  sop: 'Supplied State of Place practicum GeoJSON',
  streets: 'https://opendataphilly.org/datasets/streets-composite-layer/',
  completeStreets: 'https://opendataphilly.org/datasets/complete-streets/',
  permits: 'https://opendataphilly.org/datasets/licenses-and-inspections-building-and-zoning-permits/',
  pwd: 'https://water.phila.gov/projects/map/',
  septa: 'https://opendataphilly.org/datasets/septa-routes-stops-locations/',
  crashes: 'https://opendataphilly.org/datasets/crashes/',
  floodplain: 'https://opendataphilly.org/datasets/fema-flood-plain/',
  historic: 'https://opendataphilly.org/datasets/philadelphia-registered-historic-districts/',
  bike: 'https://opendataphilly.org/datasets/bike-network/',
  vacancy: 'https://opendataphilly.org/datasets/vacant-property-indicators-percentage-by-block/',
  parcels: 'https://opendataphilly.org/datasets/department-of-records-property-parcels/',
  traffic: 'https://opendataphilly.org/datasets/dvrpc-traffic-count-viewer/'
};

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LON = 85_300;
const FEET_PER_METER = 3.28084;
const HIN_DISTANCE_METERS = 25;
const CAPITAL_DISTANCE_METERS = 50;
const ENVIRONMENTAL_DISTANCE_METERS = 500;
const ZONING_SAMPLE_SPACING_METERS = 30;
const ZONING_ADJACENT_OFFSET_METERS = 20;
const STREET_NAME_DISTANCE_METERS = 40;
const CROSS_STREET_DISTANCE_METERS = 55;
const COMPLETE_STREETS_DISTANCE_METERS = 50;
const DEVELOPMENT_DISTANCE_METERS = 76.2;
const PWD_DISTANCE_METERS = 100;
const TRANSIT_DISTANCE_METERS = 152.4;
const CRASH_DISTANCE_METERS = 50;
const BIKE_DISTANCE_METERS = 50;
const CAPITAL_LIFECYCLE_FLAG_FIELDS = ['COMPLETED', 'UNDER_CONS', 'IN_DEVELOP', 'FUTURE_DEV'];
const ZONING_SPECIAL_REVIEW_CODES = new Set(['I-2', 'I-3', 'I-P', 'SP-AIR']);
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const metersToFeet = (value) => value == null ? null : Math.round(value * FEET_PER_METER);
const presentValue = (value) => typeof value === 'string' && value.trim() === '' ? null : value ?? null;

function normalizeCapitalDate(value) {
  const input = String(presentValue(value) ?? '').trim();
  if (!input) return null;

  let year, month, day;
  const compact = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dashed = input.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (compact) {
    [, year, month, day] = compact.map(Number);
  } else if (iso) {
    [, year, month, day] = iso.map(Number);
  } else if (dashed) {
    month = Number(dashed[1]);
    day = Number(dashed[2]);
    year = Number(dashed[3]);
    if (dashed[3].length === 2) year += year >= 70 ? 1900 : 2000;
  } else return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function fetchGeoJSON(label, url) {
  process.stdout.write(`Downloading ${label}... `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  if (data.error) throw new Error(`${label}: ${JSON.stringify(data.error)}`);
  console.log(`${data.features?.length ?? 0} features`);
  return data;
}

async function fetchArcGIS(label, endpoint, { where = '1=1', outFields = '*' } = {}) {
  process.stdout.write(`Downloading ${label} IDs... `);
  const idResponse = await fetch(`${endpoint}?${new URLSearchParams({ where, returnIdsOnly: 'true', f: 'json' })}`);
  if (!idResponse.ok) throw new Error(`${label} IDs: ${idResponse.status} ${idResponse.statusText}`);
  const idData = await idResponse.json();
  if (idData.error) throw new Error(`${label} IDs: ${JSON.stringify(idData.error)}`);
  const objectIds = [...(idData.objectIds ?? [])].sort((a, b) => a - b);
  console.log(`${objectIds.length} records`);

  const features = [];
  // A conservative page size avoids intermittent ArcGIS 400 responses when
  // object IDs are long or a service has a lower effective POST limit.
  const pageSize = 500;
  for (let start = 0; start < objectIds.length; start += pageSize) {
    const ids = objectIds.slice(start, start + pageSize);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({
        objectIds: ids.join(','),
        outFields,
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson'
      })
    });
    if (!response.ok) throw new Error(`${label} page ${start / pageSize + 1}: ${response.status} ${response.statusText}`);
    const page = await response.json();
    if (page.error) throw new Error(`${label} page ${start / pageSize + 1}: ${JSON.stringify(page.error)}`);
    features.push(...(page.features ?? []));
  }
  if (features.length !== objectIds.length) {
    throw new Error(`${label} pagination incomplete: expected ${objectIds.length}, received ${features.length}`);
  }
  console.log(`Downloaded ${features.length} ${label} features.`);
  return { type: 'FeatureCollection', features };
}

async function optionalSource(label, loader) {
  try {
    return { collection: await loader(), status: 'ready', error: '' };
  } catch (error) {
    console.warn(`Warning: ${label} unavailable; Phase 5 will retain it in provenance without matches.`, error.message);
    return { collection: { type: 'FeatureCollection', features: [] }, status: 'unavailable', error: error.message };
  }
}

const isoDate = (value) => {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

function permitCutoffDate() {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
  return cutoff.toISOString().slice(0, 10);
}

function normalizeZoning(collection) {
  const features = collection.features.flatMap((feature) => {
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) return [];
    const properties = feature.properties ?? {};
    const code = String(properties.long_code ?? properties.LONG_CODE ?? properties.code ?? properties.CODE ?? 'Unknown').trim();
    const group = String(properties.zoninggroup ?? properties.ZONINGGROUP ?? 'Unknown').trim();
    const pending = String(properties.pending ?? properties.PENDING ?? 'No').trim();
    const pendingBill = String(properties.pendingbill ?? properties.PENDINGBILL ?? '').trim();
    return [{
      type: 'Feature',
      properties: {
        code,
        zoning_group: group,
        pending,
        pending_bill: pendingBill === 'N/A' ? '' : pendingBill
      },
      geometry: feature.geometry
    }];
  });
  console.log(`Prepared ${features.length} zoning polygons for segment context sampling.`);
  return { type: 'FeatureCollection', features };
}

async function fetchCapitalProjects() {
  process.stdout.write('Downloading capital-project IDs... ');
  const idUrl = `${CAPITAL_ENDPOINT}?${new URLSearchParams({
    ...CAPITAL_AREA_PARAMS,
    returnIdsOnly: 'true',
    f: 'json'
  })}`;
  const idResponse = await fetch(idUrl);
  if (!idResponse.ok) throw new Error(`Capital project IDs: ${idResponse.status} ${idResponse.statusText}`);
  const idData = await idResponse.json();
  if (idData.error) throw new Error(`Capital project IDs: ${JSON.stringify(idData.error)}`);
  const objectIds = [...(idData.objectIds ?? [])].sort((a, b) => a - b);
  console.log(`${objectIds.length} records`);

  const features = [];
  const pageSize = 500;
  for (let start = 0; start < objectIds.length; start += pageSize) {
    const ids = objectIds.slice(start, start + pageSize);
    const pageParameters = new URLSearchParams({
      objectIds: ids.join(','),
      outFields: CAPITAL_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson'
    });
    const response = await fetch(CAPITAL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: pageParameters
    });
    if (!response.ok) throw new Error(`Capital project page ${start / pageSize + 1}: ${response.status} ${response.statusText}`);
    const page = await response.json();
    if (page.error) throw new Error(`Capital project page ${start / pageSize + 1}: ${JSON.stringify(page.error)}`);
    features.push(...(page.features ?? []));
    process.stdout.write(`  ${Math.min(start + ids.length, objectIds.length)}/${objectIds.length}\r`);
  }
  console.log(`Downloaded ${features.length} capital-project line records.`);
  if (features.length !== objectIds.length) {
    throw new Error(`Capital project pagination incomplete: expected ${objectIds.length}, received ${features.length}`);
  }
  return { type: 'FeatureCollection', features };
}

function isActiveFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['y', 'yes', 'true', '1', 't'].includes(String(value ?? '').trim().toLowerCase());
}

function classifyCapitalLifecycle(properties) {
  if (isActiveFlag(properties.COMPLETED)) {
    return {
      stage: 'completed',
      score: 0,
      basis: 'Completed projects are retained for context but are not considered influenceable coordination opportunities.'
    };
  }
  if (isActiveFlag(properties.UNDER_CONS)) {
    return {
      stage: 'under_construction',
      score: 0,
      basis: 'Projects under construction are retained for context but are not considered influenceable coordination opportunities.'
    };
  }
  if (isActiveFlag(properties.IN_DEVELOP)) {
    return {
      stage: 'in_development',
      score: 0.6,
      basis: 'The PennDOT record identifies the project as in development, indicating a potential but unverified coordination opportunity.'
    };
  }
  if (isActiveFlag(properties.FUTURE_DEV)) {
    return {
      stage: 'future_development',
      score: 0.4,
      basis: 'The PennDOT record identifies the project for future development, indicating an early and unverified coordination opportunity.'
    };
  }
  return {
    stage: 'unverified',
    score: 0.2,
    basis: 'Only geographic proximity is known; project status, timing, funding, and ability to coordinate require verification.'
  };
}

function mergeCapitalProperties(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] == null || target[key] === '') target[key] = value;
  }
  for (const field of CAPITAL_LIFECYCLE_FLAG_FIELDS) {
    if (isActiveFlag(source[field])) target[field] = source[field];
  }
}

function groupCapitalProjects(collection) {
  const projects = new Map();
  for (const feature of collection.features) {
    if (!feature.geometry) continue;
    const properties = feature.properties ?? {};
    const key = String(properties.PROJECT_ID ?? properties.PROJECT_TI ?? feature.id ?? projects.size);
    const parts = feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates
      : feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : [];
    if (!parts.length) continue;
    const existing = projects.get(key);
    if (existing) {
      existing.geometry.coordinates.push(...parts);
      mergeCapitalProperties(existing.properties, properties);
    }
    else projects.set(key, {
      type: 'Feature',
      properties: { ...properties },
      geometry: { type: 'MultiLineString', coordinates: [...parts] }
    });
  }
  let conflictingLifecycleFlags = 0;
  const features = [...projects.values()].map((feature) => {
    const activeFlags = CAPITAL_LIFECYCLE_FLAG_FIELDS.filter((field) => isActiveFlag(feature.properties[field]));
    if (activeFlags.length > 1) conflictingLifecycleFlags += 1;
    const lifecycle = classifyCapitalLifecycle(feature.properties);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        LET_DATE_D: normalizeCapitalDate(feature.properties.LET_DATE_D),
        NTP_DATE: normalizeCapitalDate(feature.properties.NTP_DATE),
        COMPLETI_1: normalizeCapitalDate(feature.properties.COMPLETI_1),
        OPEN_DATE: normalizeCapitalDate(feature.properties.OPEN_DATE),
        capital_project_stage: lifecycle.stage,
        capital_opportunity_signal: lifecycle.score,
        capital_opportunity_basis: lifecycle.basis
      }
    };
  });
  if (conflictingLifecycleFlags > 0) {
    console.warn(`Warning: ${conflictingLifecycleFlags} grouped capital projects have conflicting active lifecycle flags; conservative lifecycle precedence was applied.`);
  } else {
    console.log('Capital lifecycle validation found 0 projects with conflicting active flags.');
  }
  return {
    type: 'FeatureCollection',
    features
  };
}

function validateSop(sop) {
  if (sop.type !== 'FeatureCollection' || !Array.isArray(sop.features) || !sop.features.length) {
    throw new Error('SoP input must be a non-empty GeoJSON FeatureCollection.');
  }
  const ids = new Set();
  for (const [index, feature] of sop.features.entries()) {
    if (feature.geometry?.type !== 'LineString') throw new Error(`SoP feature ${index} is not a LineString.`);
    const properties = feature.properties ?? {};
    const id = String(properties.location_id ?? '');
    if (!id || ids.has(id)) throw new Error(`SoP feature ${index} has a missing or duplicate location_id.`);
    ids.add(id);
    for (const field of ['SoPIndex8Norm', 'PEDS5Norm', 'SAFENorm', 'TRAFFIC6Norm', 'CONN7Norm', 'DENS3Norm']) {
      const value = Number(properties[field]);
      if (!Number.isFinite(value) || value < -1e-8 || value > 100 + 1e-8) {
        throw new Error(`SoP feature ${id} has invalid ${field}: ${properties[field]}`);
      }
    }
  }
  console.log(`Validated ${sop.features.length} unique SoP LineStrings and normalized fields on a 0-100 range.`);
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
      if (!feature?.geometry?.coordinates) continue;
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

function pointAnyLineDistance(point, geometry) {
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  return Math.min(...parts.map((coordinates) => pointLineDistance(point, { type: 'LineString', coordinates })));
}

function lineMidpoint(line) {
  const coordinates = line.coordinates;
  if (!coordinates.length) return [0, 0];
  let total = 0;
  const lengths = [];
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const [ax, ay] = meters(coordinates[index]);
    const [bx, by] = meters(coordinates[index + 1]);
    const length = Math.hypot(bx - ax, by - ay);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return coordinates[0];
  let remaining = total / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const ratio = remaining / lengths[index];
      return [
        coordinates[index][0] + (coordinates[index + 1][0] - coordinates[index][0]) * ratio,
        coordinates[index][1] + (coordinates[index + 1][1] - coordinates[index][1]) * ratio
      ];
    }
    remaining -= lengths[index];
  }
  return coordinates.at(-1);
}

function lineIntersectsRing(line, ring) {
  if (line.coordinates.some((coordinate) => pointInRing(coordinate, ring))) return true;
  for (let index = 0; index < line.coordinates.length - 1; index += 1) {
    for (let ringIndex = 0; ringIndex < ring.length - 1; ringIndex += 1) {
      if (segmentsIntersect(line.coordinates[index], line.coordinates[index + 1], ring[ringIndex], ring[ringIndex + 1])) return true;
    }
  }
  return false;
}

function lineIntersectsPolygonGeometry(line, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => lineIntersectsRing(line, rings[0]));
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoordinates(point, rings) {
  return Boolean(rings?.length) && pointInRing(point, rings[0]) &&
    !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInPolygonGeometry(point, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygonCoordinates(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point, polygon));
  }
  return false;
}

function containingZoning(point, index) {
  const matches = index.search([point[0], point[1], point[0], point[1]])
    .filter((item) => pointInPolygonGeometry(point, item.feature.geometry));
  matches.sort((a, b) => {
    const pendingA = String(a.feature.properties?.pending ?? '').toLowerCase() === 'yes' ? 1 : 0;
    const pendingB = String(b.feature.properties?.pending ?? '').toLowerCase() === 'yes' ? 1 : 0;
    const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
    const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
    return pendingA - pendingB || areaA - areaB;
  });
  return matches[0]?.feature ?? null;
}

function lineSampleLocations(line) {
  const samples = [];
  for (let i = 0; i < line.coordinates.length - 1; i += 1) {
    const a = line.coordinates[i];
    const b = line.coordinates[i + 1];
    const dxMeters = (b[0] - a[0]) * METERS_PER_DEG_LON;
    const dyMeters = (b[1] - a[1]) * METERS_PER_DEG_LAT;
    const length = Math.hypot(dxMeters, dyMeters);
    if (length === 0) continue;
    const count = Math.max(1, Math.ceil(length / ZONING_SAMPLE_SPACING_METERS));
    const normalX = -dyMeters / length;
    const normalY = dxMeters / length;
    for (let step = 0; step < count; step += 1) {
      const t = (step + 0.5) / count;
      samples.push({
        center: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        normalX,
        normalY
      });
    }
  }
  return samples;
}

function readableZoningGroup(rawGroup, code) {
  if (['IRMX', 'ICMX', 'I-1', 'I-2', 'I-3', 'I-P'].includes(code)) return 'Industrial / mixed-use';
  if (rawGroup.includes('Residential')) return 'Residential / mixed-use';
  if (rawGroup.includes('Commercial')) return 'Commercial / mixed-use';
  if (rawGroup.includes('Industrial')) return 'Industrial / mixed-use';
  if (rawGroup.includes('Special')) return 'Special purpose';
  return rawGroup || 'Unknown';
}

function zoningContextScores(group, code) {
  if (group === 'Residential / mixed-use') return { residential: 1, industrial: 0.5 };
  if (group === 'Commercial / mixed-use') return { residential: 0.9, industrial: 0.6 };
  if (group === 'Industrial / mixed-use') {
    const residential = code === 'IRMX' ? 0.65 : code === 'ICMX' ? 0.55 :
      code === 'I-1' ? 0.4 : code === 'I-2' ? 0.3 : 0.2;
    return { residential, industrial: 1 };
  }
  if (group === 'Special purpose') {
    if (['SP-INS', 'SP-CIV', 'SP-PO-A', 'SP-PO-P'].includes(code)) return { residential: 0.8, industrial: 0.5 };
    if (code === 'SP-AIR') return { residential: 0.2, industrial: 0.9 };
    if (code === 'SP-STA') return { residential: 0.5, industrial: 0.8 };
    return { residential: 0.6, industrial: 0.6 };
  }
  return { residential: 0.5, industrial: 0.5 };
}

function segmentZoningContext(segment, zoningIndex) {
  const observations = [];
  for (const sample of lineSampleLocations(segment.geometry)) {
    let sideMatches = 0;
    for (const direction of [-1, 1]) {
      const point = [
        sample.center[0] + direction * sample.normalX * ZONING_ADJACENT_OFFSET_METERS / METERS_PER_DEG_LON,
        sample.center[1] + direction * sample.normalY * ZONING_ADJACENT_OFFSET_METERS / METERS_PER_DEG_LAT
      ];
      const match = containingZoning(point, zoningIndex);
      if (match) {
        observations.push(match.properties);
        sideMatches += 1;
      }
    }
    if (!sideMatches) {
      const centerMatch = containingZoning(sample.center, zoningIndex);
      if (centerMatch) observations.push(centerMatch.properties);
    }
  }

  if (!observations.length) {
    return {
      zoning_primary_group: null,
      zoning_primary_code: null,
      zoning_land_use_mix: 'Not assessed',
      zoning_codes: '',
      zoning_residential_context_score: null,
      zoning_industrial_context_score: null,
      zoning_special_review: false,
      zoning_pending: false,
      zoning_pending_bills: '',
      zoning_sample_count: 0,
      zoning_context_basis: 'No adjacent zoning polygon was found; verify the segment manually.'
    };
  }

  const groupCounts = new Map();
  const codeCounts = new Map();
  const pendingBills = new Set();
  let residentialScore = 0;
  let industrialScore = 0;
  let specialReviewCount = 0;
  let pending = false;
  for (const observation of observations) {
    const code = String(observation.code ?? 'Unknown');
    const group = readableZoningGroup(String(observation.zoning_group ?? ''), code);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    const scores = zoningContextScores(group, code);
    residentialScore += scores.residential;
    industrialScore += scores.industrial;
    if (ZONING_SPECIAL_REVIEW_CODES.has(code)) specialReviewCount += 1;
    if (String(observation.pending ?? '').toLowerCase() === 'yes') pending = true;
    if (observation.pending_bill) pendingBills.add(String(observation.pending_bill));
  }

  const descending = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const groups = [...groupCounts.entries()].sort(descending);
  const codes = [...codeCounts.entries()].sort(descending);
  const total = observations.length;
  return {
    zoning_primary_group: groups[0][0],
    zoning_primary_code: codes[0][0],
    zoning_land_use_mix: groups.map(([group, count]) => `${group} ${Math.round(count / total * 100)}%`).join('; '),
    zoning_codes: codes.slice(0, 5).map(([code]) => code).join(', '),
    zoning_residential_context_score: clamp01(residentialScore / total),
    zoning_industrial_context_score: clamp01(industrialScore / total),
    zoning_special_review: specialReviewCount / total >= 0.25,
    zoning_pending: pending,
    zoning_pending_bills: [...pendingBills].join(', '),
    zoning_sample_count: total,
    zoning_context_basis: `Adjacent zoning inferred from ${total} sampled points approximately ${metersToFeet(ZONING_ADJACENT_OFFSET_METERS)} ft from the street centerline; verify parcel-level conditions.`
  };
}

function nearestLine(segment, index, threshold) {
  let nearest = Infinity, match = null;
  for (const item of index.search(expand(bbox(segment), threshold))) {
    const distance = lineDistance(segment.geometry, item.feature.geometry, threshold);
    if (distance < nearest) { nearest = distance; match = item.feature; }
  }
  return { signal: nearest <= threshold ? 1 : 0, distance: Number.isFinite(nearest) ? nearest : null, match };
}

function bestCapitalOpportunity(segment, index, threshold) {
  let bestDistance = Infinity;
  let bestScore = -1;
  let match = null;
  for (const item of index.search(expand(bbox(segment), threshold))) {
    // A zero stop value calculates the true nearest distance, which is needed
    // to break ties between projects with the same lifecycle score.
    const distance = lineDistance(segment.geometry, item.feature.geometry, 0);
    if (distance > threshold) continue;
    const score = Number(item.feature.properties?.capital_opportunity_signal ?? 0);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      bestScore = score;
      bestDistance = distance;
      match = item.feature;
    }
  }
  return {
    signal: match ? 1 : 0,
    opportunity: match ? clamp01(bestScore) : 0,
    distance: match ? bestDistance : null,
    match
  };
}

function nearestSite(segment, index, maxDistance) {
  let nearest = Infinity, match = null;
  for (const item of index.search(expand(bbox(segment), maxDistance))) {
    const distance = pointLineDistance(item.feature.geometry, segment.geometry);
    if (distance < nearest) { nearest = distance; match = item.feature; }
  }
  return {
    signal: nearest <= maxDistance ? clamp01(1 - nearest / maxDistance) : 0,
    distance: Number.isFinite(nearest) ? nearest : null,
    match
  };
}

function nearbySites(segment, index, maxDistance) {
  const matches = [];
  for (const item of index.search(expand(bbox(segment), maxDistance))) {
    const distance = pointLineDistance(item.feature.geometry, segment.geometry);
    if (distance <= maxDistance) matches.push({ feature: item.feature, distance });
  }
  matches.sort((a, b) => a.distance - b.distance);
  return matches;
}

function nearbyLines(segment, index, maxDistance) {
  const matches = [];
  for (const item of index.search(expand(bbox(segment), maxDistance))) {
    const distance = lineDistance(segment.geometry, item.feature.geometry, 0);
    if (distance <= maxDistance) matches.push({ feature: item.feature, distance });
  }
  matches.sort((a, b) => a.distance - b.distance);
  return matches;
}

function polygonMatches(segment, index) {
  const midpoint = lineMidpoint(segment.geometry);
  return index.search([midpoint[0], midpoint[1], midpoint[0], midpoint[1]])
    .filter((item) => pointInPolygonGeometry(midpoint, item.feature.geometry))
    .map((item) => item.feature);
}

function titleCaseStreet(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const abbreviations = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
  return text.toLowerCase().split(/\s+/).map((part) => {
    const upper = part.toUpperCase();
    return abbreviations.has(upper) ? upper : part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

function segmentStreetContext(segment, streetIndex) {
  const primaryMatch = nearestLine(segment, streetIndex, STREET_NAME_DISTANCE_METERS);
  const primaryName = titleCaseStreet(primaryMatch.match?.properties?.f_name);
  const points = [segment.geometry.coordinates[0], segment.geometry.coordinates.at(-1), lineMidpoint(segment.geometry)];
  let crossStreet = null;
  let crossDistance = Infinity;
  for (const point of points) {
    const searchBox = expand([point[0], point[1], point[0], point[1]], CROSS_STREET_DISTANCE_METERS);
    for (const item of streetIndex.search(searchBox)) {
      const candidateName = titleCaseStreet(item.feature.properties?.f_name);
      if (!candidateName || candidateName === primaryName) continue;
      const distance = pointAnyLineDistance({ type: 'Point', coordinates: point }, item.feature.geometry);
      if (distance <= CROSS_STREET_DISTANCE_METERS && distance < crossDistance) {
        crossStreet = candidateName;
        crossDistance = distance;
      }
    }
  }
  const midpoint = lineMidpoint(segment.geometry);
  const displayName = primaryName
    ? crossStreet ? `${primaryName} near ${crossStreet}` : primaryName
    : `Near ${midpoint[1].toFixed(3)}, ${midpoint[0].toFixed(3)}`;
  return {
    display_name: displayName,
    street_name: primaryName,
    cross_street: crossStreet,
    neighborhood: null,
    midpoint_longitude: Number(midpoint[0].toFixed(6)),
    midpoint_latitude: Number(midpoint[1].toFixed(6))
  };
}

function segmentCompleteStreetsContext(segment, index) {
  const match = nearestLine(segment, index, COMPLETE_STREETS_DISTANCE_METERS);
  const properties = match.match?.properties ?? {};
  const policyNotes = [
    properties.recfacil ? `Recommended facility: ${properties.recfacil}` : '',
    properties.bikenetwor ? `Bicycle network: ${properties.bikenetwor}` : '',
    properties.sidewlk_wd ? `Sidewalk: ${properties.sidewlk_wd}` : '',
    properties.wlk_zn ? `Walking zone: ${properties.wlk_zn}` : ''
  ].filter(Boolean);
  return {
    context: {
      complete_streets_match: Boolean(match.match),
      complete_streets_distance_ft: metersToFeet(match.distance),
      complete_streets_type: presentValue(properties.street_typ ?? properties.combined_s),
      complete_streets_class: presentValue(properties.class1),
      complete_streets_bike_facility: presentValue(properties.recfacil ?? properties.bikenetwor),
      complete_streets_sidewalk_width: presentValue(properties.sidewlk_wd),
      complete_streets_walking_zone: presentValue(properties.wlk_zn),
      complete_streets_policy_notes: policyNotes.join('; ')
    },
    match: match.match
  };
}

function groupTransitStops(collection) {
  const stops = new Map();
  for (const feature of collection.features) {
    if (feature.geometry?.type !== 'Point') continue;
    const properties = feature.properties ?? {};
    const key = String(properties.Stop_ID ?? properties.Stop_Name ?? feature.id ?? stops.size);
    const existing = stops.get(key);
    if (existing) {
      const lines = new Set(existing.properties.routes ?? []);
      if (properties.Line != null) lines.add(String(properties.Line));
      existing.properties.routes = [...lines].sort();
    } else {
      stops.set(key, {
        ...feature,
        properties: {
          stop_id: key,
          stop_name: properties.Stop_Name ?? properties.Stop_Abbr ?? 'Transit stop',
          routes: properties.Line == null ? [] : [String(properties.Line)]
        }
      });
    }
  }
  return { type: 'FeatureCollection', features: [...stops.values()] };
}

function normalizePwdProjects(gsi, construction) {
  const gsiFeatures = gsi.features.flatMap((feature) => {
    if (!['LineString', 'MultiLineString'].includes(feature.geometry?.type)) return [];
    const p = feature.properties ?? {};
    const category = String(p.statuscategory ?? '').toLowerCase();
    const stage = category.includes('construct') && !category.includes('in construction')
      ? 'completed'
      : category.includes('in construction') ? 'active'
        : category.includes('design') || category.includes('contract') ? 'planned' : 'unknown';
    return [{
      ...feature,
      properties: {
        context_id: `gsi-${p.projectid ?? feature.id ?? ''}`,
        project_name: p.projectname ?? 'PWD green stormwater project',
        project_status: p.status ?? p.statuscategory ?? 'Status not reported',
        context_stage: stage,
        project_type: p.primaryprogramname ?? p.project_type ?? 'Green stormwater infrastructure',
        source_kind: 'PWD green stormwater infrastructure',
        project_url: p.project_page_link ?? ''
      }
    }];
  });
  const constructionFeatures = construction.features.flatMap((feature) => {
    if (!['LineString', 'MultiLineString'].includes(feature.geometry?.type)) return [];
    const p = feature.properties ?? {};
    return [{
      ...feature,
      properties: {
        context_id: `construction-${p.PROJECTID ?? feature.id ?? ''}`,
        project_name: p.PROJECTTITLE ?? p.STNAME ?? 'PWD construction project',
        project_status: p.PROJECTSTATUS ?? 'Active construction',
        context_stage: 'active',
        project_type: p.TYPE ?? 'Water infrastructure construction',
        source_kind: 'PWD construction map',
        project_url: ''
      }
    }];
  });
  return { type: 'FeatureCollection', features: [...gsiFeatures, ...constructionFeatures] };
}

function compactMatched(collection, matchedIds, idField) {
  return {
    type: 'FeatureCollection',
    features: collection.features.filter((feature, index) => matchedIds.has(String(feature.properties?.[idField] ?? feature.id ?? index)))
  };
}

function buildRecommendation(properties) {
  const evidence = ['sop_need'];
  if (properties.hin_signal > 0) evidence.push('vision_zero_hin');
  if (properties.capital_signal > 0) evidence.push(`capital_project_${properties.capital_project_stage}`);
  if (properties.brownfield_proximity_signal > 0.05) evidence.push('brownfield_inventory_proximity');
  if (properties.superfund_signal > 0.05) evidence.push('superfund_constraint');
  if (properties.complete_streets_match) evidence.push('complete_streets_context');
  if (properties.development_context) evidence.push('development_permit_context');
  if (properties.pwd_project_match) evidence.push(`pwd_project_${properties.pwd_project_stage}`);
  if (properties.transit_stop_count > 0) evidence.push('transit_access_context');
  if (properties.serious_crash_count > 0) evidence.push('serious_crash_evidence');
  if (properties.floodplain_review) evidence.push('floodplain_review');
  if (properties.historic_review) evidence.push('historic_district_review');

  let type = 'feasibility_study';
  let title = 'Investigate the segment further';
  let action = 'Confirm the segment-level need, document applicable policy context, and identify a feasible implementation or funding pathway.';

  if (properties.hin_signal > 0 && properties.capital_opportunity_signal > 0) {
    type = 'capital_safety_coordination';
    title = 'Investigate safety coordination with the capital project';
    action = 'Contact the capital-project owner to determine whether a professionally developed pedestrian-safety concept could be considered while scope decisions remain influenceable.';
  } else if (properties.hin_signal > 0) {
    type = 'vision_zero_project_development';
    title = 'Review a potential Vision Zero project';
    action = 'Ask qualified planning and engineering staff to assess potential safety treatments and suitable funding pathways.';
  } else if (properties.capital_opportunity_signal > 0) {
    type = 'capital_scope_coordination';
    title = 'Investigate coordination with the capital project';
    action = 'Contact the project owner to determine whether the project is still influenceable and whether a professionally developed improvement concept could be considered.';
  } else if (properties.brownfield_opportunity_signal > 0.01) {
    type = 'redevelopment_coordination';
    title = 'Investigate a Brownfield coordination lead';
    action = 'Verify whether cleanup or redevelopment is active, then engage the responsible parties to explore coordinated public-realm planning.';
  } else if (properties.pwd_coordination_context) {
    type = 'pwd_coordination_review';
    title = 'Investigate coordination with a planned PWD project';
    action = 'Confirm the PWD project schedule, owner, and remaining scope decisions before proposing a coordinated street improvement.';
  } else if (properties.development_context) {
    type = 'development_coordination_review';
    title = 'Investigate a private-development coordination lead';
    action = 'Review the nearby issued permit and determine whether development timing, frontage work, and responsible parties create a viable coordination opportunity.';
  } else if (properties.need_score < 0.34) {
    type = 'monitor';
    title = 'Monitor for a future implementation opportunity';
    action = 'Retain the segment in the opportunity pipeline and reassess it when a project, policy, or redevelopment trigger emerges.';
  }

  let rationale = `This screening lead combines a ${(properties.need_score * 100).toFixed(0)}-point need score with mapped evidence; it is not an engineering recommendation or confirmation of available funding.`;
  if (properties.capital_signal > 0) {
    rationale += ` The selected nearby capital project is classified as ${properties.capital_project_stage.replaceAll('_', ' ')} and contributes ${properties.capital_opportunity_signal.toFixed(1)} to coordination opportunity. ${properties.capital_opportunity_basis}`;
  }
  if (properties.superfund_signal > 0.05) {
    action += ' Complete environmental due diligence before committing the concept or schedule.';
    rationale += ' Nearby Superfund evidence is shown separately as a constraint requiring professional review.';
  }
  if (properties.brownfield_proximity_signal > 0.05) {
    rationale += ` Nearby Brownfield inventory evidence contributes only ${properties.brownfield_opportunity_signal.toFixed(2)} because active cleanup, redevelopment, funding, and partner interest have not been verified.`;
  }
  if (properties.complete_streets_match) {
    rationale += ` The Complete Streets match is policy context only and does not independently raise this score.`;
  }
  if (properties.development_context || properties.pwd_project_match) {
    rationale += ' Development and PWD records are shown as coordination leads but do not affect scoring until their timing and influenceability are validated.';
  }

  const impact = properties.need_score >= 0.67 || properties.hin_signal > 0
    ? 'high' : properties.need_score >= 0.34 ? 'medium' : 'low';
  return {
    recommendation_id: `REC-${properties.location_id}`,
    recommendation_type: type,
    recommendation_title: title,
    recommendation_action: action,
    recommendation_rationale: rationale,
    recommendation_impact: impact,
    implementation_effort: null,
    cost_band: null,
    timing_band: null,
    recommendation_evidence: evidence.join(','),
    recommendation_method: 'prototype-screening-v3'
  };
}

function compact(collection) {
  return JSON.stringify(collection);
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const sop = JSON.parse(await readFile(SOP_PATH, 'utf8'));
  validateSop(sop);
  const [hin, capitalRecords, brownfields, superfund, zoningRecords] = await Promise.all([
    fetchGeoJSON('Vision Zero HIN', HIN_URL),
    fetchCapitalProjects(),
    fetchGeoJSON('EPA Brownfields', epaUrl(5)),
    fetchGeoJSON('EPA Superfund', epaUrl(0)),
    fetchGeoJSON('Philadelphia zoning', ZONING_URL)
  ]);
  const cutoff = permitCutoffDate();
  // These services share ArcGIS infrastructure. Fetch sequentially to avoid
  // rate-related 400 responses during long, paginated refreshes.
  const streetsResult = await optionalSource('Philadelphia street names', () => fetchArcGIS('street centerlines', ARCGIS_SOURCES.streets, {
    outFields: 'objectid,f_name,seg_id,f_source'
  }));
  const completeResult = await optionalSource('Complete Streets', () => fetchArcGIS('Complete Streets', ARCGIS_SOURCES.completeStreets, {
    outFields: 'objectid,stname,class1,recfacil,bikenetwor,combined_s,street_typ,sidewlk_wd,wlk_zn,phase2_sid'
  }));
  const permitsResult = await optionalSource('issued development permits', () => fetchArcGIS('issued development permits', ARCGIS_SOURCES.permits, {
    where: `status='Issued' AND permitissuedate >= DATE '${cutoff}' AND (` +
      `numberofunits >= 5 OR numberofstories >= 4 OR areaofdisturbance >= 5000 OR ` +
      `typeofwork LIKE '%New Construction%' OR typeofwork LIKE '%New construction%' OR ` +
      `permittype IN ('BP_NEWCNST','BP_ADDITON'))`,
    outFields: 'objectid,permitnumber,permittype,permitdescription,typeofwork,approvedscopeofwork,permitissuedate,status,address,numberofunits,numberofstories,areaofdisturbance'
  }));
  const pwdGsiResult = await optionalSource('PWD green infrastructure', () => fetchArcGIS('PWD green infrastructure', ARCGIS_SOURCES.pwdGsi, {
    outFields: 'objectid,projectid,projectname,worknumber,statuscategory,status,smpdata_phase,primaryprogramname,project_type,project_page_link'
  }));
  const pwdConstructionResult = await optionalSource('PWD active construction', () => fetchArcGIS('PWD active construction', ARCGIS_SOURCES.pwdConstruction, {
    outFields: 'OBJECTID,STNAME,PROJECTID,PROJECTSTATUS,PROJECTTITLE,TYPE,WORKNO,Legend'
  }));
  const transitResult = await optionalSource('SEPTA stops', () => fetchArcGIS('SEPTA stops', ARCGIS_SOURCES.septaStops, {
    outFields: 'FID,Line,Stop_ID,Stop_Abbr,Stop_Name'
  }));
  const crashResult = await optionalSource('pedestrian and bicycle crashes', () => fetchArcGIS('pedestrian and bicycle crashes', ARCGIS_SOURCES.crashes, {
    where: 'pedestrian = 1 OR bicycle = 1',
    outFields: 'objectid,crn,crash_year,pedestrian,bicycle,fatal_count,susp_serious_inj_count,ped_death_count,ped_susp_serious_inj_count,bicycle_death_count,bicycle_susp_serious_inj_count'
  }));
  const floodResult = await optionalSource('FEMA floodplain', () => fetchArcGIS('FEMA floodplain', ARCGIS_SOURCES.floodplain, {
    where: "sfha_tf='T' OR zone_subty='0.2 PCT ANNUAL CHANCE FLOOD HAZARD'",
    outFields: 'objectid,fld_zone,zone_subty,sfha_tf,source_cit'
  }));
  const historicResult = await optionalSource('historic districts', () => fetchGeoJSON('historic districts', HISTORIC_DISTRICTS_URL));
  const bikeResult = await optionalSource('bike network', () => fetchArcGIS('bike network', ARCGIS_SOURCES.bike, {
    outFields: 'objectid,st_name,st_type,bikewaytyp,facityp,grouping,faccode,hqbn'
  }));
  const vacancyResult = await optionalSource('vacancy context', () => fetchArcGIS('vacancy context', ARCGIS_SOURCES.vacancy, {
    outFields: 'objectid,parcelcount,combinedvaccount,combinedvacpercentage,date_update'
  }));
  const capital = groupCapitalProjects(capitalRecords);
  const zoning = normalizeZoning(zoningRecords);
  const transit = groupTransitStops(transitResult.collection);
  const pwd = normalizePwdProjects(pwdGsiResult.collection, pwdConstructionResult.collection);
  console.log(`Grouped capital data into ${capital.features.length} unique projects.`);
  console.log(`Grouped transit records into ${transit.features.length} unique stops.`);
  const environmental = { type: 'FeatureCollection', features: [
    ...brownfields.features.map((feature) => ({ ...feature, properties: { ...feature.properties, site_type: 'Brownfield' } })),
    ...superfund.features.map((feature) => ({ ...feature, properties: { ...feature.properties, site_type: 'Superfund' } }))
  ] };
  const hinIndex = new GridIndex(hin.features);
  const capitalIndex = new GridIndex(capital.features);
  const brownfieldIndex = new GridIndex(brownfields.features);
  const superfundIndex = new GridIndex(superfund.features);
  const zoningIndex = new GridIndex(zoning.features, 0.005);
  const streetIndex = new GridIndex(streetsResult.collection.features);
  const completeIndex = new GridIndex(completeResult.collection.features);
  const permitIndex = new GridIndex(permitsResult.collection.features);
  const pwdIndex = new GridIndex(pwd.features);
  const transitIndex = new GridIndex(transit.features);
  const crashIndex = new GridIndex(crashResult.collection.features);
  const floodIndex = new GridIndex(floodResult.collection.features, 0.005);
  const historicIndex = new GridIndex(historicResult.collection.features, 0.005);
  const bikeIndex = new GridIndex(bikeResult.collection.features);
  const vacancyIndex = new GridIndex(vacancyResult.collection.features, 0.005);
  const matched = {
    complete: new Set(), permits: new Set(), pwd: new Set(), transit: new Set(), crashes: new Set(), bike: new Set()
  };

  console.log(`Enriching ${sop.features.length} SoP segments...`);
  const features = sop.features.map((feature) => {
    const hinMatch = nearestLine(feature, hinIndex, HIN_DISTANCE_METERS);
    const capitalMatch = bestCapitalOpportunity(feature, capitalIndex, CAPITAL_DISTANCE_METERS);
    const brownfieldMatch = nearestSite(feature, brownfieldIndex, ENVIRONMENTAL_DISTANCE_METERS);
    const superfundMatch = nearestSite(feature, superfundIndex, ENVIRONMENTAL_DISTANCE_METERS);
    const zoningContext = segmentZoningContext(feature, zoningIndex);
    const streetContext = segmentStreetContext(feature, streetIndex);
    const completeContext = segmentCompleteStreetsContext(feature, completeIndex);
    const permitMatches = nearbySites(feature, permitIndex, DEVELOPMENT_DISTANCE_METERS);
    const pwdMatches = nearbyLines(feature, pwdIndex, PWD_DISTANCE_METERS);
    const transitMatches = nearbySites(feature, transitIndex, TRANSIT_DISTANCE_METERS);
    const crashMatches = nearbySites(feature, crashIndex, CRASH_DISTANCE_METERS);
    const floodMatches = polygonMatches(feature, floodIndex);
    const historicMatches = polygonMatches(feature, historicIndex);
    const bikeMatch = nearestLine(feature, bikeIndex, BIKE_DISTANCE_METERS);
    const midpoint = lineMidpoint(feature.geometry);
    const vacancyMatch = vacancyIndex.search([midpoint[0], midpoint[1], midpoint[0], midpoint[1]])
      .map((item) => item.feature)
      .find((item) => pointInPolygonGeometry(midpoint, item.geometry));
    if (completeContext.match) matched.complete.add(String(completeContext.match.properties?.objectid ?? completeContext.match.id));
    for (const match of permitMatches) matched.permits.add(String(match.feature.properties?.permitnumber ?? match.feature.id));
    for (const match of pwdMatches) matched.pwd.add(String(match.feature.properties?.context_id ?? match.feature.id));
    for (const match of transitMatches) matched.transit.add(String(match.feature.properties?.stop_id ?? match.feature.id));
    for (const match of crashMatches) matched.crashes.add(String(match.feature.properties?.crn ?? match.feature.id));
    if (bikeMatch.match) matched.bike.add(String(bikeMatch.match.properties?.objectid ?? bikeMatch.match.id));
    const capitalProps = capitalMatch.match?.properties ?? {};
    const brownfieldProps = brownfieldMatch.match?.properties ?? {};
    const superfundProps = superfundMatch.match?.properties ?? {};
    const brownfieldProximity = brownfieldMatch.signal;
    const brownfieldOpportunity = brownfieldProximity * 0.2;
    const environmentalConstraint = superfundMatch.signal;
    const nearestPermit = permitMatches[0];
    const nearestPermitProperties = nearestPermit?.feature.properties ?? {};
    const preferredPwd = pwdMatches.find(({ feature: match }) => match.properties?.context_stage === 'planned') ?? pwdMatches[0];
    const pwdProperties = preferredPwd?.feature.properties ?? {};
    const transitRoutes = new Set();
    for (const { feature: stop } of transitMatches) {
      for (const route of stop.properties?.routes ?? []) transitRoutes.add(String(route));
    }
    const crashProperties = crashMatches.map(({ feature: crash }) => crash.properties ?? {});
    const seriousCrashes = crashProperties.filter((crash) =>
      Number(crash.fatal_count ?? 0) > 0 || Number(crash.susp_serious_inj_count ?? 0) > 0 ||
      Number(crash.ped_death_count ?? 0) > 0 || Number(crash.ped_susp_serious_inj_count ?? 0) > 0 ||
      Number(crash.bicycle_death_count ?? 0) > 0 || Number(crash.bicycle_susp_serious_inj_count ?? 0) > 0
    ).length;
    const floodProperties = floodMatches[0]?.properties ?? {};
    const historicProperties = historicMatches[0]?.properties ?? {};
    const bikeProperties = bikeMatch.match?.properties ?? {};
    const reviewFlags = [
      environmentalConstraint > 0.05 ? 'Superfund proximity' : '',
      zoningContext.zoning_special_review ? 'Industrial or special-purpose zoning' : '',
      floodMatches.length ? 'FEMA floodplain' : '',
      historicMatches.length ? 'Registered historic district' : ''
    ].filter(Boolean);
    const baseProperties = {
      ...feature.properties,
      ...streetContext,
      ...zoningContext,
      ...completeContext.context,
      need_score: clamp01(1 - Number(feature.properties.SoPIndex8Norm ?? 0) / 100),
      hin_signal: hinMatch.signal,
      hin_distance_ft: metersToFeet(hinMatch.distance),
      capital_signal: capitalMatch.signal,
      capital_opportunity_signal: capitalMatch.opportunity,
      capital_distance_ft: metersToFeet(capitalMatch.distance),
      capital_project_id: presentValue(capitalProps.PROJECT_ID),
      capital_project_name: presentValue(capitalProps.PROJECT_TI) ?? presentValue(capitalProps.STREET_NAM),
      capital_project_stage: capitalProps.capital_project_stage ?? null,
      capital_opportunity_basis: capitalProps.capital_opportunity_basis ?? null,
      capital_let_date: normalizeCapitalDate(capitalProps.LET_DATE_D),
      capital_ntp_date: normalizeCapitalDate(capitalProps.NTP_DATE),
      capital_completion_date: normalizeCapitalDate(capitalProps.COMPLETI_1),
      capital_open_date: normalizeCapitalDate(capitalProps.OPEN_DATE),
      brownfield_proximity_signal: brownfieldProximity,
      brownfield_signal: brownfieldProximity,
      brownfield_opportunity_signal: brownfieldOpportunity,
      brownfield_distance_ft: metersToFeet(brownfieldMatch.distance),
      brownfield_site_name: brownfieldProps.primary_name ?? null,
      superfund_signal: environmentalConstraint,
      superfund_distance_ft: metersToFeet(superfundMatch.distance),
      superfund_site_name: superfundProps.primary_name ?? null,
      environmental_opportunity_signal: brownfieldProximity,
      environmental_constraint_signal: environmentalConstraint,
      environmental_signal: clamp01(brownfieldProximity - environmentalConstraint),
      coordination_opportunity_signal: Math.max(capitalMatch.opportunity, brownfieldOpportunity),
      development_permit_count: permitMatches.length,
      development_permit_nearest_ft: metersToFeet(nearestPermit?.distance ?? null),
      development_permit_address: presentValue(nearestPermitProperties.address),
      development_permit_type: presentValue(nearestPermitProperties.typeofwork ?? nearestPermitProperties.permittype),
      development_permit_issue_date: isoDate(nearestPermitProperties.permitissuedate),
      development_permit_numbers: permitMatches.slice(0, 10).map(({ feature: permit }) => permit.properties?.permitnumber).filter(Boolean).join(', '),
      development_context: permitMatches.length > 0,
      pwd_project_match: Boolean(preferredPwd),
      pwd_project_distance_ft: metersToFeet(preferredPwd?.distance ?? null),
      pwd_project_name: presentValue(pwdProperties.project_name),
      pwd_project_status: presentValue(pwdProperties.project_status),
      pwd_project_stage: presentValue(pwdProperties.context_stage),
      pwd_coordination_context: pwdProperties.context_stage === 'planned',
      transit_stop_count: transitMatches.length,
      nearest_transit_stop_ft: metersToFeet(transitMatches[0]?.distance ?? null),
      nearest_transit_stop_name: presentValue(transitMatches[0]?.feature.properties?.stop_name),
      transit_routes: [...transitRoutes].sort().join(', '),
      crash_count: crashMatches.length,
      serious_crash_count: seriousCrashes,
      pedestrian_crash_count: crashProperties.filter((crash) => Number(crash.pedestrian ?? 0) > 0).length,
      bicycle_crash_count: crashProperties.filter((crash) => Number(crash.bicycle ?? 0) > 0).length,
      floodplain_review: floodMatches.length > 0,
      flood_zone: presentValue(floodProperties.fld_zone ?? floodProperties.FLD_ZONE),
      historic_review: historicMatches.length > 0,
      historic_district: presentValue(historicProperties.name ?? historicProperties.NAME ?? historicProperties.district ?? historicProperties.DISTRICT),
      bike_network_match: Boolean(bikeMatch.match),
      bike_facility_type: presentValue(bikeProperties.bikewaytyp ?? bikeProperties.facityp ?? bikeProperties.grouping),
      vacancy_context_percent: vacancyMatch ? Number(vacancyMatch.properties?.combinedvacpercentage ?? 0) : null,
      context_review_flags: reviewFlags.join(', ')
    };
    return {
      ...feature,
      properties: {
        ...baseProperties,
        ...buildRecommendation(baseProperties)
      }
    };
  });

  const segmentCount = features.length;
  const countMatches = (predicate) => features.filter(({ properties }) => predicate(properties)).length;
  const sourceRecord = (id, name, publisher, url, role, affectsScore, result, featureCount, matchCount, method, limitations, sourceVintage = '') => ({
    id, name, publisher, url, role, affects_score: affectsScore,
    refreshed_at: new Date().toISOString(), source_vintage: sourceVintage,
    feature_count: featureCount, segment_match_count: matchCount,
    segment_match_percent: Number((matchCount / segmentCount * 100).toFixed(1)),
    method, limitations: result?.error ? `${limitations} Refresh error: ${result.error}` : limitations,
    status: result?.status ?? 'ready'
  });
  const manifest = {
    generated_at: new Date().toISOString(),
    method_version: 'prototype-screening-v3',
    segment_count: segmentCount,
    sources: [
      sourceRecord('sop', 'State of Place street segments', 'State of Place / practicum team', SOURCE_LINKS.sop, 'need', true, null, sop.features.length, segmentCount, 'Supplied segment indicators; need is one minus the normalized SoP index.', 'Confirm attribution, codebook interpretation, and redistribution permission.'),
      sourceRecord('streets', 'Streets Composite Layer', 'City of Philadelphia', SOURCE_LINKS.streets, 'identification', false, streetsResult, streetsResult.collection.features.length, countMatches((p) => Boolean(p.street_name)), `Nearest named street within ${metersToFeet(STREET_NAME_DISTANCE_METERS)} ft; a different nearby name is used as the cross street.`, 'Labels are approximate and are not legal street or survey records.'),
      sourceRecord('hin', '2025 High Injury Network', 'City of Philadelphia', HIN_URL, 'safety', true, null, hin.features.length, countMatches((p) => p.hin_signal > 0), `Line match within ${metersToFeet(HIN_DISTANCE_METERS)} ft.`, 'A binary screening signal; consult current Vision Zero records.', '2025'),
      sourceRecord('crashes', 'Pedestrian and bicycle crashes', 'PennDOT / City of Philadelphia', SOURCE_LINKS.crashes, 'safety', false, crashResult, crashResult.collection.features.length, countMatches((p) => p.crash_count > 0), `Crash points within ${metersToFeet(CRASH_DISTANCE_METERS)} ft.`, 'Evidence only to avoid double-counting safety already represented by the HIN.', '2020–2024'),
      sourceRecord('capital', 'Transportation improvement projects', 'PennDOT', 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/26', 'coordination', true, null, capital.features.length, countMatches((p) => p.capital_signal > 0), `Lifecycle-aware line match within ${metersToFeet(CAPITAL_DISTANCE_METERS)} ft.`, 'Lifecycle flags and influenceability require confirmation.'),
      sourceRecord('brownfields', 'Brownfields and Superfund facilities', 'U.S. EPA', EPA_BASE, 'coordination', true, null, environmental.features.length, countMatches((p) => p.brownfield_proximity_signal > 0), `Point proximity within ${metersToFeet(ENVIRONMENTAL_DISTANCE_METERS)} ft; Brownfields are capped and Superfund is a constraint.`, 'Proximity does not establish redevelopment activity, funding, contamination extent, or partner interest.'),
      sourceRecord('zoning', 'Zoning Base Districts', 'City of Philadelphia', 'https://opendataphilly.org/datasets/zoning-base-districts/', 'context', true, null, zoning.features.length, countMatches((p) => p.zoning_sample_count > 0), `Sampled approximately ${metersToFeet(ZONING_ADJACENT_OFFSET_METERS)} ft on both sides of each segment.`, 'Optional 15% lens only; zoning is not engineering feasibility.'),
      sourceRecord('complete_streets', 'Complete Streets', 'City of Philadelphia', SOURCE_LINKS.completeStreets, 'policy', false, completeResult, completeResult.collection.features.length, countMatches((p) => p.complete_streets_match), `Nearest line within ${metersToFeet(COMPLETE_STREETS_DISTANCE_METERS)} ft.`, 'Policy context only; recommendations and street typology require planner confirmation.'),
      sourceRecord('permits', 'Issued development permits', 'City of Philadelphia L&I', SOURCE_LINKS.permits, 'coordination', false, permitsResult, permitsResult.collection.features.length, countMatches((p) => p.development_context), `Substantial issued permits from the prior three years within ${metersToFeet(DEVELOPMENT_DISTANCE_METERS)} ft.`, 'A permit is a lead, not evidence of active construction, available funding, or developer participation.', `Rolling three-year window beginning ${cutoff}`),
      sourceRecord('pwd', 'PWD construction and green-infrastructure projects', 'Philadelphia Water Department', SOURCE_LINKS.pwd, 'coordination', false, pwdGsiResult.status === 'ready' || pwdConstructionResult.status === 'ready' ? { status: 'ready', error: '' } : pwdGsiResult, pwd.features.length, countMatches((p) => p.pwd_project_match), `Line match within ${metersToFeet(PWD_DISTANCE_METERS)} ft; planned and active stages are distinguished.`, 'Context only until scope timing and influenceability are confirmed.'),
      sourceRecord('septa', 'SEPTA transit stops', 'SEPTA', SOURCE_LINKS.septa, 'context', false, transitResult, transit.features.length, countMatches((p) => p.transit_stop_count > 0), `Stops within ${metersToFeet(TRANSIT_DISTANCE_METERS)} ft.`, 'Transit proximity describes access; it is not a capital commitment.', 'Fall 2026 service data'),
      sourceRecord('floodplain', 'FEMA Floodplain 2023', 'FEMA / City of Philadelphia', SOURCE_LINKS.floodplain, 'constraint', false, floodResult, floodResult.collection.features.length, countMatches((p) => p.floodplain_review), 'Segment midpoint falls within a mapped 1% or 0.2% annual-chance flood-hazard polygon.', 'Review flag only; site-specific resilience and engineering analysis are required.', '2023'),
      sourceRecord('historic', 'Registered Historic Districts', 'Philadelphia Historical Commission', SOURCE_LINKS.historic, 'constraint', false, historicResult, historicResult.collection.features.length, countMatches((p) => p.historic_review), 'Segment midpoint falls within a mapped historic district.', 'The public layer may be stale; confirm current designation status.'),
      sourceRecord('bike', 'Bike Network', 'City of Philadelphia', SOURCE_LINKS.bike, 'context', false, bikeResult, bikeResult.collection.features.length, countMatches((p) => p.bike_network_match), `Nearest bike-network line within ${metersToFeet(BIKE_DISTANCE_METERS)} ft.`, 'Existing network context only; does not establish a planned improvement.'),
      sourceRecord('vacancy', 'Vacant Property Indicators', 'City of Philadelphia', SOURCE_LINKS.vacancy, 'context', false, vacancyResult, vacancyResult.collection.features.length, countMatches((p) => p.vacancy_context_percent != null), 'Segment midpoint contained by a vacancy-indicator block.', 'Reference context only; values may be stale and require careful equity interpretation.'),
      sourceRecord('parcels', 'Property parcels', 'City of Philadelphia', SOURCE_LINKS.parcels, 'context', false, { status: 'deferred', error: '' }, 0, 0, 'Catalogued for future parcel/frontage review.', 'Not downloaded because parcel geometry alone does not establish ownership cooperation or feasibility.'),
      sourceRecord('traffic', 'DVRPC traffic counts', 'DVRPC', SOURCE_LINKS.traffic, 'context', false, { status: 'deferred', error: '' }, 0, 0, 'Catalogued for future traffic-exposure review.', 'The public viewer lacks a stable citywide GeoJSON API in the current workflow; count dates vary.')
    ]
  };

  const matchedComplete = compactMatched(completeResult.collection, matched.complete, 'objectid');
  const matchedPermits = compactMatched(permitsResult.collection, matched.permits, 'permitnumber');
  const matchedPwd = compactMatched(pwd, matched.pwd, 'context_id');
  const matchedTransit = compactMatched(transit, matched.transit, 'stop_id');
  const matchedCrashes = compactMatched(crashResult.collection, matched.crashes, 'crn');
  const matchedBike = compactMatched(bikeResult.collection, matched.bike, 'objectid');

  await Promise.all([
    writeFile(resolve(DATA_DIR, 'implementation_segments.geojson'), compact({ type: 'FeatureCollection', features })),
    writeFile(resolve(DATA_DIR, 'vision_zero.geojson'), compact(hin)),
    writeFile(resolve(DATA_DIR, 'capital_projects.geojson'), compact(capital)),
    writeFile(resolve(DATA_DIR, 'environmental_sites.geojson'), compact(environmental)),
    writeFile(resolve(DATA_DIR, 'complete_streets_context.geojson'), compact(matchedComplete)),
    writeFile(resolve(DATA_DIR, 'development_permits_context.geojson'), compact(matchedPermits)),
    writeFile(resolve(DATA_DIR, 'pwd_projects_context.geojson'), compact(matchedPwd)),
    writeFile(resolve(DATA_DIR, 'transit_stops_context.geojson'), compact(matchedTransit)),
    writeFile(resolve(DATA_DIR, 'crashes_context.geojson'), compact(matchedCrashes)),
    writeFile(resolve(DATA_DIR, 'bike_network_context.geojson'), compact(matchedBike)),
    writeFile(resolve(DATA_DIR, 'data_manifest.json'), JSON.stringify(manifest, null, 2))
  ]);
  console.log('Wrote browser-ready data to public/data/.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
