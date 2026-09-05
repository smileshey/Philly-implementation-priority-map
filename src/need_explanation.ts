import type { SopCollection, SopProperties } from './types';

type ComponentScoreKey = 'PEDS5Norm' | 'SAFENorm' | 'TRAFFIC6Norm' | 'CONN7Norm' | 'DENS3Norm';
type ComponentPercentileKey = 'PEDS5Percentile' | 'SAFEPercentile' | 'TRAFFIC6Percentile' | 'CONN7Percentile' | 'DENS3Percentile';

export type NeedComponent = {
  label: string;
  score: number;
  percentile: number | null;
};

const COMPONENTS: Array<{
  label: string;
  scoreKey: ComponentScoreKey;
  percentileKey: ComponentPercentileKey;
}> = [
  { label: 'Pedestrian Environment', scoreKey: 'PEDS5Norm', percentileKey: 'PEDS5Percentile' },
  { label: 'Safety Conditions', scoreKey: 'SAFENorm', percentileKey: 'SAFEPercentile' },
  { label: 'Traffic Conditions', scoreKey: 'TRAFFIC6Norm', percentileKey: 'TRAFFIC6Percentile' },
  { label: 'Connectivity', scoreKey: 'CONN7Norm', percentileKey: 'CONN7Percentile' },
  { label: 'Density', scoreKey: 'DENS3Norm', percentileKey: 'DENS3Percentile' }
];

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

function percentileRank(sorted: number[], value: number): number {
  if (sorted.length <= 1) return 50;
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  const below = low;
  low = below;
  high = sorted.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sorted[middle] <= value) low = middle + 1;
    else high = middle;
  }
  const through = low;
  const averageIndex = (below + through - 1) / 2;
  return clamp100(Math.round(averageIndex / (sorted.length - 1) * 100));
}

export function addNeedDiagnostics(sop: SopCollection): SopCollection {
  const distributions = Object.fromEntries(COMPONENTS.map(({ scoreKey }) => [
    scoreKey,
    sop.features
      .map(({ properties }) => Number(properties[scoreKey]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
  ])) as Record<ComponentScoreKey, number[]>;

  return {
    ...sop,
    features: sop.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        ...Object.fromEntries(COMPONENTS.map(({ scoreKey, percentileKey }) => {
          const value = Number(feature.properties[scoreKey]);
          return [percentileKey, Number.isFinite(value) ? percentileRank(distributions[scoreKey], value) : null];
        }))
      }
    }))
  };
}

export function needComponentProfile(properties: SopProperties): NeedComponent[] {
  return COMPONENTS.map(({ label, scoreKey, percentileKey }) => {
    const scoreValue = properties[scoreKey];
    const percentileValue = properties[percentileKey];
    return {
      label,
      score: typeof scoreValue === 'number' && Number.isFinite(scoreValue) ? clamp100(scoreValue) : 0,
      percentile: typeof percentileValue === 'number' && Number.isFinite(percentileValue) ? clamp100(percentileValue) : null
    };
  });
}

export function relativeNeedDrivers(properties: SopProperties, count = 2): NeedComponent[] {
  return needComponentProfile(properties)
    .filter((component) => component.percentile != null)
    .sort((a, b) => (a.percentile ?? 100) - (b.percentile ?? 100) || a.score - b.score)
    .slice(0, count);
}

export function ordinal(value: number): string {
  const rounded = Math.round(value);
  const remainder100 = rounded % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? 'th'
    : rounded % 10 === 1 ? 'st' : rounded % 10 === 2 ? 'nd' : rounded % 10 === 3 ? 'rd' : 'th';
  return `${rounded}${suffix}`;
}

export function streetViewUrl(properties: SopProperties): string | null {
  const latitude = Number(properties.midpoint_latitude);
  const longitude = Number(properties.midpoint_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const viewpoint = encodeURIComponent(`${latitude.toFixed(6)},${longitude.toFixed(6)}`);
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${viewpoint}`;
}
