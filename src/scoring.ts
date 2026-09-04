import type { PriorityStrategy, SopCollection, SopFeature, Weights, ZoningLens } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export type CoordinationOverrides = Record<string, number>;

export type RecalculationOptions = {
  strategy?: PriorityStrategy;
  zoningLens?: ZoningLens;
  applyPlannerAdjustments?: boolean;
};

function strategyScore(
  need: number,
  safety: number,
  coordination: number,
  weights: Weights,
  strategy: PriorityStrategy
): number {
  const totalWeight = weights.need + weights.safety + weights.coordination;
  const weighted = totalWeight === 0 ? 0 : clamp01(
    (need * weights.need + safety * weights.safety + coordination * weights.coordination) /
    totalWeight
  );
  return strategy === 'need'
    ? need
    : strategy === 'safety'
      ? clamp01(0.75 * safety + 0.25 * need)
      : strategy === 'coordination'
        ? coordination >= 0.4
          ? clamp01(0.7 + 0.2 * coordination + 0.1 * need)
          : clamp01(0.35 * coordination + 0.15 * need)
        : weighted;
}

function applyZoningContext(score: number, zoningContext: number | null): number {
  return zoningContext == null ? score : clamp01(0.85 * score + 0.15 * zoningContext);
}

export function baseCoordinationScore(feature: SopFeature): number {
  const p = feature.properties;
  const capital = p.capital_opportunity_signal ?? ((p.capital_signal ?? 0) > 0 ? 0.2 : 0);
  const brownfield = p.brownfield_opportunity_signal ?? (p.brownfield_signal ?? 0) * 0.2;
  return clamp01(p.coordination_opportunity_signal ?? Math.max(capital, brownfield));
}

export function recalculatePriority(
  sop: SopCollection,
  weights: Weights,
  coordinationOverrides: CoordinationOverrides = {},
  options: RecalculationOptions = {}
): SopCollection {
  const strategy = options.strategy ?? 'custom';
  const zoningLens = options.zoningLens ?? 'citywide';
  const applyPlannerAdjustments = options.applyPlannerAdjustments ?? false;
  return {
    type: 'FeatureCollection',
    features: sop.features.map((feature) => {
      const p = feature.properties;
      const need = clamp01(p.need_score ?? 0);
      const safety = clamp01(p.safety_score ?? p.hin_signal ?? 0);
      const publicCoordination = baseCoordinationScore(feature);
      const reviewedCoordination = coordinationOverrides[p.location_id];
      const adjustedCoordination = Number.isFinite(reviewedCoordination)
        ? clamp01(reviewedCoordination)
        : publicCoordination;
      const zoningCandidate = zoningLens === 'residential_access'
        ? p.zoning_residential_context_score
        : zoningLens === 'industrial_safety'
          ? p.zoning_industrial_context_score
          : null;
      const zoningContext = typeof zoningCandidate === 'number' && Number.isFinite(zoningCandidate)
        ? clamp01(zoningCandidate)
        : null;
      const publicBase = strategyScore(need, safety, publicCoordination, weights, strategy);
      const adjustedBase = strategyScore(need, safety, adjustedCoordination, weights, strategy);
      const publicPriority = applyZoningContext(publicBase, zoningContext);
      const adjustedPriority = applyZoningContext(adjustedBase, zoningContext);
      const priority = applyPlannerAdjustments ? adjustedPriority : publicPriority;
      return {
        ...feature,
        properties: {
          ...p,
          safety_score: safety,
          coordination_opportunity_signal: applyPlannerAdjustments ? adjustedCoordination : publicCoordination,
          // Kept temporarily for compatibility with existing exported data consumers.
          feasibility_score: applyPlannerAdjustments ? adjustedCoordination : publicCoordination,
          zoning_context_score: zoningContext,
          priority_base_score: applyPlannerAdjustments ? adjustedBase : publicBase,
          public_screening_score: publicPriority,
          review_adjusted_score: adjustedPriority,
          review_score_delta: adjustedPriority - publicPriority,
          planner_adjustment_applied: applyPlannerAdjustments && Number.isFinite(reviewedCoordination),
          priority_strategy: strategy,
          zoning_lens: zoningLens,
          priority_score: priority
        }
      };
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
  if ((p.capital_opportunity_signal ?? 0) > 0) actions.push('explore coordination with a future transportation project');
  if ((p.brownfield_opportunity_signal ?? 0) > 0.01) actions.push('verify a Brownfield redevelopment coordination opportunity');
  if ((p.superfund_signal ?? 0) > 0.05) actions.push('complete environmental due diligence before advancing work');
  if (!actions.length) actions.push('identify a viable implementation or funding pathway');
  return actions.join('; ') + '.';
}
