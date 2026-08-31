import React from 'react';
import type { DataStatus, SopFeature, Weights } from './types';
import TopSegments from './top_segments';

const LABELS = ['Not', 'A little', 'Either way', 'A lot', 'Very'];

function SliderRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider-row">
      <div className="slider-caption">{label}</div>
      <div className="slider-element">
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          title={LABELS[value]}
        />
        <div className="slider-value-label">{LABELS[value]}</div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: 'loading' | 'ready' | 'failed' }) {
  return <span className={`status-dot ${status}`} title={status} />;
}

export default function SliderWidget({
  weights,
  onWeights,
  onRecalculate,
  onReset,
  top,
  status
}: {
  weights: Weights;
  onWeights: (weights: Weights) => void;
  onRecalculate: () => void;
  onReset: () => void;
  top: SopFeature[];
  status: DataStatus;
}) {
  const update = (field: keyof Weights, value: number) => onWeights({ ...weights, [field]: value });

  return (
    <div className="slider-widget-container">
      <div className="slider-widget-header">
        <div className="slider-widget-title">What should drive project priority?</div>
        <div className="source-status" title="Public data source status">
          <StatusDot status={status.hin} />
          <StatusDot status={status.capital} />
          <StatusDot status={status.environmental} />
        </div>
      </div>
      <div className="slider-divider" />
      <div className="slider-content">
        <SliderRow label="SoP Need" value={weights.need} onChange={(v) => update('need', v)} />
        <SliderRow label="Vision Zero" value={weights.visionZero} onChange={(v) => update('visionZero', v)} />
        <SliderRow label="Capital Projects" value={weights.capital} onChange={(v) => update('capital', v)} />
        <SliderRow label="Environmental" value={weights.environmental} onChange={(v) => update('environmental', v)} />
      </div>
      <button className="slider-recalculate-button" onClick={onRecalculate}>Recalculate</button>
      <button className="slider-reset-button" onClick={onReset}>Reset</button>
      <div className="slider-divider" />
      <div className="slider-widget-title">Top implementation opportunities</div>
      <TopSegments segments={top} />
    </div>
  );
}
