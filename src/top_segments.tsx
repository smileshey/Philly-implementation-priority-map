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
          <span className="top-score" title={`Need ${Math.round((segment.properties.need_score ?? 0) * 100)} · Feasibility ${Math.round((segment.properties.feasibility_score ?? 0) * 100)}`}>
            {Math.round((segment.properties.priority_score ?? 0) * 100)}
          </span>
        </div>
      ))}
    </div>
  );
}
