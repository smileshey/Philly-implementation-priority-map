import type { SopCollection, SopFeature, Weights } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function recalculatePriority(sop: SopCollection, weights: Weights): SopCollection {
  const feasibilityWeight = weights.visionZero + weights.capital + weights.environmental;
  const totalWeight = weights.need + weights.visionZero + weights.capital + weights.environmental;
  return {
    type: 'FeatureCollection',
    features: sop.features.map((feature) => {
      const p = feature.properties;
      const environmentalNet = (p.environmental_opportunity_signal ?? 0) -
        (p.environmental_constraint_signal ?? 0);
      const feasibility = feasibilityWeight === 0 ? 0 : clamp01(
        ((p.hin_signal ?? 0) * weights.visionZero +
          (p.capital_signal ?? 0) * weights.capital +
          environmentalNet * weights.environmental) /
        feasibilityWeight
      );
      const priority = totalWeight === 0 ? 0 : clamp01(
        ((p.need_score ?? 0) * weights.need + feasibility * feasibilityWeight) /
        totalWeight
      );
      return { ...feature, properties: { ...p, feasibility_score: feasibility, priority_score: priority } };
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
  if ((p.brownfield_signal ?? 0) > 0.05) actions.push('evaluate Brownfield redevelopment coordination');
  if ((p.superfund_signal ?? 0) > 0.05) actions.push('complete environmental due diligence before advancing work');
  if (!actions.length) actions.push('identify a viable implementation or funding pathway');
  return actions.join('; ') + '.';
}
