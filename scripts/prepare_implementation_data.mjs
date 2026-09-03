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

const CAPITAL_ENDPOINT =
  'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/26/query';
const CAPITAL_FIELDS =
  'PROJECT_ID,PROJECT_TI,PROJECT_IM,PUBLIC_NAR,EST_CONSTR,CURRENT_CO,UNDER_CONS,FUTURE_DEV,IN_DEVELOP,STREET_NAM';
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

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LON = 85_300;
const FEET_PER_METER = 3.28084;
const HIN_DISTANCE_METERS = 25;
const CAPITAL_DISTANCE_METERS = 50;
const ENVIRONMENTAL_DISTANCE_METERS = 500;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const metersToFeet = (value) => value == null ? null : Math.round(value * FEET_PER_METER);

async function fetchGeoJSON(label, url) {
  process.stdout.write(`Downloading ${label}... `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  if (data.error) throw new Error(`${label}: ${JSON.stringify(data.error)}`);
  console.log(`${data.features?.length ?? 0} features`);
  return data;
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
    if (existing) existing.geometry.coordinates.push(...parts);
    else projects.set(key, {
      type: 'Feature',
      properties,
      geometry: { type: 'MultiLineString', coordinates: [...parts] }
    });
  }
  return { type: 'FeatureCollection', features: [...projects.values()] };
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
  return { signal: nearest <= threshold ? 1 : 0, distance: Number.isFinite(nearest) ? nearest : null, match };
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

function buildRecommendation(properties) {
  const evidence = ['sop_need'];
  if (properties.hin_signal > 0) evidence.push('vision_zero_hin');
  if (properties.capital_signal > 0) evidence.push('capital_project');
  if (properties.brownfield_signal > 0.05) evidence.push('brownfield_opportunity');
  if (properties.superfund_signal > 0.05) evidence.push('superfund_constraint');

  let type = 'feasibility_study';
  let title = 'Develop a corridor feasibility study';
  let action = 'Confirm the segment-level need, define a feasible improvement concept, and identify an implementation or funding pathway.';
  let effort = 'medium';
  let cost = '$';
  let timing = '1–3 years';

  if (properties.hin_signal > 0 && properties.capital_signal > 0) {
    type = 'capital_safety_coordination';
    title = 'Bundle a safety upgrade with the programmed project';
    action = 'Coordinate with the capital-project owner to incorporate a pedestrian-safety treatment while scope and delivery decisions are active.';
    effort = 'medium'; cost = '$$'; timing = '1–3 years';
  } else if (properties.hin_signal > 0) {
    type = 'vision_zero_project_development';
    title = 'Advance a Vision Zero safety intervention';
    action = 'Develop a safety concept and pursue an appropriate Vision Zero or transportation-funding pathway.';
    effort = 'medium'; cost = '$$'; timing = '1–3 years';
  } else if (properties.capital_signal > 0) {
    type = 'capital_scope_coordination';
    title = 'Coordinate improvements with the capital project';
    action = 'Contact the project owner to test whether pedestrian improvements can be added to the existing project scope.';
    effort = 'medium'; cost = '$$'; timing = '1–3 years';
  } else if (properties.brownfield_signal > 0.05) {
    type = 'redevelopment_coordination';
    title = 'Coordinate streetscape and Brownfield redevelopment';
    action = 'Engage the site and corridor stakeholders to align public-realm improvements with cleanup or redevelopment planning.';
    effort = 'medium'; cost = '$$'; timing = '3–5 years';
  } else if (properties.need_score < 0.34) {
    type = 'monitor';
    title = 'Monitor for a future implementation opportunity';
    action = 'Retain the segment in the opportunity pipeline and reassess it when a project, policy, or redevelopment trigger emerges.';
    effort = 'low'; cost = '$'; timing = '3–5 years';
  }

  let rationale = `The rule combines a ${(properties.need_score * 100).toFixed(0)}-point need score with the detected implementation evidence.`;
  if (properties.superfund_signal > 0.05) {
    action += ' Complete environmental due diligence before committing the concept or schedule.';
    rationale += ' Nearby Superfund evidence is treated as a constraint that may increase uncertainty, cost, and timing.';
    effort = 'high'; cost = '$$$'; timing = '3–5 years';
  } else if (properties.brownfield_signal > 0.05) {
    rationale += ' Nearby Brownfield evidence is treated as a potential coordination opportunity, not proof of eligibility.';
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
    implementation_effort: effort,
    cost_band: cost,
    timing_band: timing,
    recommendation_evidence: evidence.join(','),
    recommendation_method: 'prototype-rule-v1'
  };
}

function compact(collection) {
  return JSON.stringify(collection);
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const sop = JSON.parse(await readFile(SOP_PATH, 'utf8'));
  validateSop(sop);
  const [hin, capitalRecords, brownfields, superfund] = await Promise.all([
    fetchGeoJSON('Vision Zero HIN', HIN_URL),
    fetchCapitalProjects(),
    fetchGeoJSON('EPA Brownfields', epaUrl(5)),
    fetchGeoJSON('EPA Superfund', epaUrl(0))
  ]);
  const capital = groupCapitalProjects(capitalRecords);
  console.log(`Grouped capital data into ${capital.features.length} unique projects.`);
  const environmental = { type: 'FeatureCollection', features: [
    ...brownfields.features.map((feature) => ({ ...feature, properties: { ...feature.properties, site_type: 'Brownfield' } })),
    ...superfund.features.map((feature) => ({ ...feature, properties: { ...feature.properties, site_type: 'Superfund' } }))
  ] };
  const hinIndex = new GridIndex(hin.features);
  const capitalIndex = new GridIndex(capital.features);
  const brownfieldIndex = new GridIndex(brownfields.features);
  const superfundIndex = new GridIndex(superfund.features);

  console.log(`Enriching ${sop.features.length} SoP segments...`);
  const features = sop.features.map((feature) => {
    const hinMatch = nearestLine(feature, hinIndex, HIN_DISTANCE_METERS);
    const capitalMatch = nearestLine(feature, capitalIndex, CAPITAL_DISTANCE_METERS);
    const brownfieldMatch = nearestSite(feature, brownfieldIndex, ENVIRONMENTAL_DISTANCE_METERS);
    const superfundMatch = nearestSite(feature, superfundIndex, ENVIRONMENTAL_DISTANCE_METERS);
    const capitalProps = capitalMatch.match?.properties ?? {};
    const brownfieldProps = brownfieldMatch.match?.properties ?? {};
    const superfundProps = superfundMatch.match?.properties ?? {};
    const environmentalOpportunity = brownfieldMatch.signal;
    const environmentalConstraint = superfundMatch.signal;
    const baseProperties = {
      ...feature.properties,
      need_score: clamp01(1 - Number(feature.properties.SoPIndex8Norm ?? 0) / 100),
      hin_signal: hinMatch.signal,
      hin_distance_ft: metersToFeet(hinMatch.distance),
      capital_signal: capitalMatch.signal,
      capital_distance_ft: metersToFeet(capitalMatch.distance),
      capital_project_name: capitalProps.PROJECT_TI ?? capitalProps.STREET_NAM ?? null,
      brownfield_signal: environmentalOpportunity,
      brownfield_distance_ft: metersToFeet(brownfieldMatch.distance),
      brownfield_site_name: brownfieldProps.primary_name ?? null,
      superfund_signal: environmentalConstraint,
      superfund_distance_ft: metersToFeet(superfundMatch.distance),
      superfund_site_name: superfundProps.primary_name ?? null,
      environmental_opportunity_signal: environmentalOpportunity,
      environmental_constraint_signal: environmentalConstraint,
      environmental_signal: clamp01(environmentalOpportunity - environmentalConstraint)
    };
    return {
      ...feature,
      properties: {
        ...baseProperties,
        ...buildRecommendation(baseProperties)
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
