import React from 'react';
import type { SopFeature } from './types';

const shortId = (id: string) => id.slice(0, 8);

export default function TopSegments({ segments }: { segments: SopFeature[] }) {
  return (
    <div className="top-neighborhoods-list">
      {segments.map((segment, index) => (
        <div className="top-neighborhood-row" key={segment.properties.location_id}>
          <span className={index === 0 ? 'rank1' : index < 3 ? `rank${index + 1}` : 'rankDefault'}>
            {index + 1}. Segment {shortId(segment.properties.location_id)}
          </span>
          <span className="top-score" title={`Need ${Math.round((segment.properties.need_score ?? 0) * 100)} · Safety ${Math.round((segment.properties.safety_score ?? segment.properties.hin_signal ?? 0) * 100)} · Coordination ${Math.round((segment.properties.coordination_opportunity_signal ?? 0) * 100)}${segment.properties.zoning_context_score == null ? '' : ` · Zoning context ${Math.round(segment.properties.zoning_context_score * 100)}`}`}>
            {Math.round((segment.properties.priority_score ?? 0) * 100)}
          </span>
        </div>
      ))}
    </div>
  );
}
