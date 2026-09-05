import React from 'react';
import type { SopFeature } from './types';

export default function TopSegments({
  segments,
  reviewedIds,
  onSelect
}: {
  segments: SopFeature[];
  reviewedIds: Set<string>;
  onSelect: (segment: SopFeature) => void;
}) {
  return (
    <div className="top-neighborhoods-list">
      {segments.map((segment, index) => {
        const reviewed = reviewedIds.has(segment.properties.location_id);
        const name = segment.properties.display_name ?? `Segment ${segment.properties.location_id.slice(0, 8)}`;
        return (
          <button
            type="button"
            className="top-neighborhood-row"
            key={segment.properties.location_id}
            onClick={() => onSelect(segment)}
            aria-label={`${reviewed ? 'Update' : 'Start'} planner review for ${name}`}
          >
            <span className={index === 0 ? 'rank1' : index < 3 ? `rank${index + 1}` : 'rankDefault'}>
              {index + 1}. {name}
            </span>
            <span className="candidate-row-meta">
              <span className="top-score" title={`Need ${Math.round((segment.properties.need_score ?? 0) * 100)} · Safety ${Math.round((segment.properties.safety_score ?? segment.properties.hin_signal ?? 0) * 100)} · Coordination ${Math.round((segment.properties.coordination_opportunity_signal ?? 0) * 100)}${segment.properties.zoning_context_score == null ? '' : ` · Zoning context ${Math.round(segment.properties.zoning_context_score * 100)}`}`}>
                {Math.round((segment.properties.priority_score ?? 0) * 100)}
              </span>
              <span className={`candidate-review-status${reviewed ? ' reviewed' : ''}`}>{reviewed ? 'Reviewed' : 'Review'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
