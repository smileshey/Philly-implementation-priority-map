import React, { useState } from 'react';
import type { SopFeature, Weights, ZoningLens } from './types';
import TopSegments from './top_segments';

const LABELS = ['None', 'Low', 'Medium', 'High', 'Very high'];

export type WeightPreset = 'need' | 'safety' | 'coordination' | 'balanced';
export type ScreeningFilters = {
  unreviewed: boolean;
  completeStreets: boolean;
  futureCapital: boolean;
  development: boolean;
  pwd: boolean;
  transit: boolean;
  constraints: boolean;
  missingZoning: boolean;
};

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

export default function SliderWidget({
  started,
  ready,
  onStart,
  weights,
  activePreset,
  zoningLens,
  onWeights,
  onPreset,
  onZoningLens,
  applyPlannerAdjustments,
  onApplyPlannerAdjustments,
  filters,
  onFilters,
  onRecalculate,
  onReset,
  resultCount,
  top,
  reviewedIds,
  onSelectCandidate
}: {
  started: boolean;
  ready: boolean;
  onStart: () => void;
  weights: Weights;
  activePreset: WeightPreset | 'custom';
  zoningLens: ZoningLens;
  onWeights: (weights: Weights) => void;
  onPreset: (preset: WeightPreset) => void;
  onZoningLens: (lens: ZoningLens) => void;
  applyPlannerAdjustments: boolean;
  onApplyPlannerAdjustments: (apply: boolean) => void;
  filters: ScreeningFilters;
  onFilters: (filters: ScreeningFilters) => void;
  onRecalculate: () => void;
  onReset: () => void;
  resultCount: number;
  top: SopFeature[];
  reviewedIds: Set<string>;
  onSelectCandidate: (segment: SopFeature) => void;
}) {
  const [workflowStep, setWorkflowStep] = useState<'criteria' | 'candidates'>('criteria');
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
    <div className={`slider-widget-container${started ? ' is-started' : ' is-intro'}`}>
      {!started ? (
        <section className="priority-intro" aria-labelledby="priority-intro-title">
          <span className="priority-intro-kicker">Start Here</span>
          <h2 id="priority-intro-title">Explore Priority Opportunities</h2>
          <p>Use State of Place need, safety urgency, and coordination opportunities to identify street segments worth investigating.</p>
          <p className="priority-intro-note">This is a screening tool. It does not select, design, fund, or approve a project.</p>
          <button className="priority-start-button" type="button" onClick={onStart} disabled={!ready}>
            {ready ? 'Start Here' : 'Loading Data…'}
          </button>
        </section>
      ) : (
      <div className="priority-controls">
      {workflowStep === 'criteria' ? (
      <section className="priority-workflow-step" aria-labelledby="priority-criteria-title">
      <div className="slider-widget-header">
        <div className="slider-widget-title" id="priority-criteria-title">What Should Drive Priority?</div>
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
      <details className="screening-filters">
        <summary>Filter follow-up candidates</summary>
        <div className="screening-filter-grid">
          {([
            ['unreviewed', 'Unreviewed'],
            ['completeStreets', 'Complete Streets match'],
            ['futureCapital', 'Future capital opportunity'],
            ['development', 'Development permit'],
            ['pwd', 'Planned PWD project'],
            ['transit', 'Transit nearby'],
            ['constraints', 'Review constraint'],
            ['missingZoning', 'Zoning not assessed']
          ] as Array<[keyof ScreeningFilters, string]>).map(([key, label]) => (
            <label key={key}>
              <input type="checkbox" checked={filters[key]} onChange={() => onFilters({ ...filters, [key]: !filters[key] })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <small>When multiple filters are selected, candidates must meet all of them.</small>
      </details>
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
        <button className="slider-recalculate-button" onClick={() => { onRecalculate(); setWorkflowStep('candidates'); }}>Calculate &amp; Review</button>
        <button className="slider-reset-button" onClick={onReset}>Reset</button>
      </div>
      </section>
      ) : (
      <section className="priority-workflow-step priority-candidates" aria-labelledby="priority-candidates-title">
        <span className="priority-intro-kicker">Next Step</span>
        <h2 id="priority-candidates-title">Review Priority Candidates</h2>
        <p className="candidate-instructions">Select a candidate to document coordination, feasibility, funding leads, and professional estimates.</p>
        <div className="candidate-heading"><strong>Top Candidates</strong><span>{resultCount.toLocaleString()} matching segments</span></div>
        <TopSegments segments={top} reviewedIds={reviewedIds} onSelect={onSelectCandidate} />
        {resultCount === 0 && <p className="empty-candidates">No segments meet every selected filter. Adjust the priorities or filters and try again.</p>}
        <label className="review-score-toggle">
          <input type="checkbox" checked={applyPlannerAdjustments} onChange={(event) => onApplyPlannerAdjustments(event.target.checked)} />
          <span>
            <strong>Apply Saved Review Adjustments</strong>
            <small>Optional. This reranks candidates using documented coordination stages and feasibility findings.</small>
          </span>
        </label>
        <button className="candidate-back-button" type="button" onClick={() => setWorkflowStep('criteria')}>← Adjust Priorities</button>
      </section>
      )}
      </div>
      )}
    </div>
  );
}
