import type { Feature, Geometry, LineString, MultiLineString, Point } from 'geojson';
import type { SopFeature } from './types';

// Lightweight geometry helpers for the browser prototype.
// We deliberately avoid Turf here: the original implementation performed
// thousands of buffers/intersections on the main UI thread and could freeze
// the map while external data was being attached.

export type BBox = [number, number, number, number];

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LON_AT_PHILLY = 85_300;

export function featureBBox(feature: Feature<Geometry>): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const x = value[0] as number;
      const y = value[1] as number;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return;
    }
    value.forEach(visit);
  };

  const geometry = feature.geometry;
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach((g) => {
    if (g.type !== 'GeometryCollection') visit(g.coordinates);
  });
  else visit(geometry.coordinates);
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

export function expandBBoxMeters(bbox: BBox, meters: number): BBox {
  const dx = meters / METERS_PER_DEG_LON_AT_PHILLY;
  const dy = meters / METERS_PER_DEG_LAT;
  return [bbox[0] - dx, bbox[1] - dy, bbox[2] + dx, bbox[3] + dy];
}

export function boxesOverlap(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function toMeters(coord: number[]): [number, number] {
  return [coord[0] * METERS_PER_DEG_LON_AT_PHILLY, coord[1] * METERS_PER_DEG_LAT];
}

function pointSegmentDistanceMeters(point: number[], a: number[], b: number[]): number {
  const [px, py] = toMeters(point);
  const [ax, ay] = toMeters(a);
  const [bx, by] = toMeters(b);
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const vv = vx * vx + vy * vy;
  if (vv === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function orientation(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: [number, number], b: [number, number], p: [number, number]): boolean {
  const eps = 1e-9;
  return p[0] >= Math.min(a[0], b[0]) - eps && p[0] <= Math.max(a[0], b[0]) + eps &&
    p[1] >= Math.min(a[1], b[1]) - eps && p[1] <= Math.max(a[1], b[1]) + eps;
}

function segmentsIntersect(a1: number[], a2: number[], b1: number[], b2: number[]): boolean {
  const p1: [number, number] = [a1[0], a1[1]];
  const p2: [number, number] = [a2[0], a2[1]];
  const q1: [number, number] = [b1[0], b1[1]];
  const q2: [number, number] = [b2[0], b2[1]];
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  const eps = 1e-12;

  if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) &&
      (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) return true;
  if (Math.abs(o1) <= eps && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) <= eps && onSegment(p1, p2, q2)) return true;
  if (Math.abs(o3) <= eps && onSegment(q1, q2, p1)) return true;
  if (Math.abs(o4) <= eps && onSegment(q1, q2, p2)) return true;
  return false;
}

function segmentPairDistanceMeters(a1: number[], a2: number[], b1: number[], b2: number[]): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistanceMeters(a1, b1, b2),
    pointSegmentDistanceMeters(a2, b1, b2),
    pointSegmentDistanceMeters(b1, a1, a2),
    pointSegmentDistanceMeters(b2, a1, a2)
  );
}

function lineParts(geometry: LineString | MultiLineString): number[][][] {
  return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
}

export function lineDistanceMeters(a: LineString, b: LineString | MultiLineString, stopAt = 0): number {
  let best = Infinity;
  for (const aPart of [a.coordinates]) {
    for (const bPart of lineParts(b)) {
      for (let i = 0; i < aPart.length - 1; i += 1) {
        for (let j = 0; j < bPart.length - 1; j += 1) {
          best = Math.min(best, segmentPairDistanceMeters(aPart[i], aPart[i + 1], bPart[j], bPart[j + 1]));
          if (best <= stopAt) return best;
        }
      }
    }
  }
  return best;
}

export function pointLineDistanceMeters(point: Point, line: LineString): number {
  let best = Infinity;
  for (let i = 0; i < line.coordinates.length - 1; i += 1) {
    best = Math.min(best, pointSegmentDistanceMeters(point.coordinates, line.coordinates[i], line.coordinates[i + 1]));
  }
  return best;
}

export function segmentMidpoint(segment: SopFeature): [number, number] {
  const coords = segment.geometry.coordinates;
  if (coords.length === 0) return [-75.1652, 39.9526];
  if (coords.length === 1) return coords[0] as [number, number];

  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [ax, ay] = toMeters(coords[i]);
    const [bx, by] = toMeters(coords[i + 1]);
    const d = Math.hypot(bx - ax, by - ay);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return coords[0] as [number, number];

  const target = total / 2;
  let traversed = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const next = traversed + lengths[i];
    if (target <= next) {
      const ratio = lengths[i] === 0 ? 0 : (target - traversed) / lengths[i];
      const a = coords[i];
      const b = coords[i + 1];
      return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
    }
    traversed = next;
  }
  return coords[coords.length - 1] as [number, number];
}
