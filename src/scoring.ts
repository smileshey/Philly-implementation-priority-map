import type { SopCollection, SopFeature, Weights } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function recalculatePriority(sop: SopCollection, weights: Weights): SopCollection {
  const totalWeight = weights.need + weights.visionZero + weights.capital + weights.environmental;
  const denominator = totalWeight || 1;
  return {
    type: 'FeatureCollection',
    features: sop.features.map((feature) => {
      const p = feature.properties;
      const score =
        ((p.need_score ?? 0) * weights.need +
          (p.hin_signal ?? 0) * weights.visionZero +
          (p.capital_signal ?? 0) * weights.capital +
          (p.environmental_signal ?? 0) * weights.environmental) /
        denominator;
      return { ...feature, properties: { ...p, priority_score: clamp01(score) } };
    })
  };
}

export function topSegments(sop: SopCollection, count = 5): SopFeature[] {
  return [...sop.features]
    .sort((a, b) => (b.properties.priority_score ?? 0) - (a.properties.priority_score ?? 0))
    .slice(0, count);
}

export function recommendedAction(feature: SopFeature): string {
  const p = feature.properties;
  const actions: string[] = [];
  if ((p.hin_signal ?? 0) > 0) actions.push('prioritize a Vision Zero safety intervention');
  if ((p.capital_signal ?? 0) > 0) actions.push('coordinate with an existing transportation capital project');
  if ((p.environmental_signal ?? 0) > 0.05) actions.push('evaluate nearby Brownfield/Superfund redevelopment context');
  if (!actions.length) actions.push('identify a viable implementation or funding pathway');
  return actions.join('; ') + '.';
}
