import React from 'react';
import type { DataStatus, SopFeature, Weights, ZoningLens } from './types';
import TopSegments from './top_segments';

const LABELS = ['None', 'Low', 'Medium', 'High', 'Very high'];

export type WeightPreset = 'need' | 'safety' | 'coordination' | 'balanced';

function SliderRow({
  label,
  help,
  value,
  onChange
}: {
  label: string;
  help: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider-row">
      <div>
        <div className="slider-caption">{label}</div>
        <div className="slider-help">{help}</div>
      </div>
      <div className="slider-element">
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          title={LABELS[value]}
          aria-label={`${label} weight`}
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
  activePreset,
  zoningLens,
  onWeights,
  onPreset,
  onZoningLens,
  onRecalculate,
  onReset,
  top,
  status
}: {
  weights: Weights;
  activePreset: WeightPreset | 'custom';
  zoningLens: ZoningLens;
  onWeights: (weights: Weights) => void;
  onPreset: (preset: WeightPreset) => void;
  onZoningLens: (lens: ZoningLens) => void;
  onRecalculate: () => void;
  onReset: () => void;
  top: SopFeature[];
  status: DataStatus;
}) {
  const update = (field: keyof Weights, value: number) => onWeights({ ...weights, [field]: value });
  const presetButton = (preset: WeightPreset, label: string) => (
    <button
      type="button"
      className={`slider-preset-button${activePreset === preset ? ' active' : ''}`}
      aria-pressed={activePreset === preset}
      onClick={() => onPreset(preset)}
    >
      {label}
    </button>
  );

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
      <div className="preset-copy">
        Choose a planning lens, or adjust the weights below.
      </div>
      <div className="weight-presets" aria-label="Priority weighting presets">
        {presetButton('need', 'Need first')}
        {presetButton('safety', 'Safety first')}
        {presetButton('coordination', 'Coordination first')}
        {presetButton('balanced', 'Balanced')}
      </div>
      <div className="zoning-lens-control">
        <label htmlFor="zoning-lens">Land-use lens</label>
        <select id="zoning-lens" value={zoningLens} onChange={(event) => onZoningLens(event.target.value as ZoningLens)}>
          <option value="citywide">Citywide — no adjustment</option>
          <option value="residential_access">Residential access — 15% context</option>
          <option value="industrial_safety">Industrial safety — 15% context</option>
        </select>
        <small>Zoning changes context—not engineering feasibility. Industrial areas remain eligible.</small>
      </div>
      <details className="advanced-weighting">
        <summary>Advanced weighting{activePreset === 'custom' ? ' — Custom active' : ''}</summary>
        <p className="advanced-weighting-help">Moving any slider switches from the preset rule to a custom weighted score.</p>
        <div className="slider-content">
          <SliderRow
            label="Street Need"
            help="How strongly should current street conditions affect priority?"
            value={weights.need}
            onChange={(v) => update('need', v)}
          />
          <SliderRow
            label="Safety Urgency"
            help="How strongly should High Injury Network alignment affect priority?"
            value={weights.safety}
            onChange={(v) => update('safety', v)}
          />
          <SliderRow
            label="Investment & Coordination Opportunity"
            help="How strongly should nearby, influenceable public or private investment affect priority?"
            value={weights.coordination}
            onChange={(v) => update('coordination', v)}
          />
        </div>
      </details>
      <div className="slider-actions">
        <button className="slider-recalculate-button" onClick={onRecalculate}>Recalculate</button>
        <button className="slider-reset-button" onClick={onReset}>Reset</button>
      </div>
      <div className="slider-divider" />
      <div className="slider-widget-title">Top implementation priorities</div>
      <TopSegments segments={top} />
    </div>
  );
}
