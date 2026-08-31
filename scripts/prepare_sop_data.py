#!/usr/bin/env python3
"""Reduce the State of Place GeoJSON to only fields used by the prototype.

Usage:
  python scripts/prepare_sop_data.py /path/to/septa_blocks.geojson public/data/sop_segments.geojson
"""
import json
import sys
from pathlib import Path

KEEP = [
    'location_id', 'SoPIndex8Norm', 'PEDS5Norm', 'SAFENorm',
    'TRAFFIC6Norm', 'CONN7Norm', 'DENS3Norm'
]


def clean_number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def main(src: str, dst: str):
    with open(src, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = []
    for feature in data.get('features', []):
        props = feature.get('properties', {})
        cleaned = {'location_id': str(props.get('location_id', ''))}
        for key in KEEP[1:]:
            cleaned[key] = clean_number(props.get(key, 0))
        features.append({
            'type': 'Feature',
            'properties': cleaned,
            'geometry': feature.get('geometry')
        })

    output = {'type': 'FeatureCollection', 'features': features}
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(output, f, separators=(',', ':'))
    print(f'Wrote {len(features)} features to {dst}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare_sop_data.py INPUT.geojson OUTPUT.geojson')
    main(sys.argv[1], sys.argv[2])
