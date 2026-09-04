import React, { useEffect, useId, useRef, useState } from 'react';
import type { SopFeature } from './types';
import './styles/planner_review.css';

export type CoordinationStrategy =
  | 'undetermined'
  | 'include_in_scope'
  | 'separate_coordinated'
  | 'independent';

export type EngagementStage =
  | 'not_contacted'
  | 'initial_discussion'
  | 'feasible'
  | 'accepted_scope'
  | 'approved';

export type Feasibility = 'not_assessed' | 'feasible' | 'uncertain' | 'not_feasible';

export type PlannerReview = {
  segmentId: string;
  strategy: CoordinationStrategy;
  engagement: EngagementStage;
  relatedProject: string;
  projectOwner: string;
  projectContact: string;
  fundingSources: string[];
  proposedTreatment: string;
  feasibility: Feasibility;
  constraints: string;
  professionalCostEstimate: string;
  estimateSource: string;
  notes: string;
  reviewer: string;
  reviewDate: string;
  updatedAt: string;
};

export type PlannerReviewStore = Record<string, PlannerReview>;

export const PLANNER_REVIEW_STORAGE_KEY = 'philly-sop-planner-reviews-v1';

export const FUNDING_SOURCE_OPTIONS = [
  'PennDOT / DVRPC transportation programming',
  'Transportation Alternatives Set-Aside',
  'PennDOT Multimodal Transportation Fund',
  'DCED Multimodal Transportation Fund',
  'Philadelphia capital funding',
  'EPA Brownfields funding',
  'Private development commitment',
  'SEPTA, utility, or infrastructure coordination',
  'Other federal, state, local, or philanthropic grant',
] as const;

const coordinationStrategies: Array<{ value: CoordinationStrategy; label: string }> = [
  { value: 'undetermined', label: 'Not yet determined' },
  { value: 'include_in_scope', label: 'Seek inclusion in an existing project' },
  { value: 'separate_coordinated', label: 'Develop a separate, coordinated project' },
  { value: 'independent', label: 'Develop an independent project' },
];

const engagementStages: Array<{ value: EngagementStage; label: string }> = [
  { value: 'not_contacted', label: 'Project owner not contacted' },
  { value: 'initial_discussion', label: 'Initial discussion completed' },
  { value: 'feasible', label: 'Concept considered feasible' },
  { value: 'accepted_scope', label: 'Accepted into project scope' },
  { value: 'approved', label: 'Scope and funding approved' },
];

const feasibilityOptions: Array<{ value: Feasibility; label: string }> = [
  { value: 'not_assessed', label: 'Not assessed' },
  { value: 'feasible', label: 'Feasible' },
  { value: 'uncertain', label: 'Uncertain' },
  { value: 'not_feasible', label: 'Not feasible' },
];

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function createPlannerReview(segmentId: string): PlannerReview {
  return {
    segmentId,
    strategy: 'undetermined',
    engagement: 'not_contacted',
    relatedProject: '',
    projectOwner: '',
    projectContact: '',
    fundingSources: [],
    proposedTreatment: '',
    feasibility: 'not_assessed',
    constraints: '',
    professionalCostEstimate: '',
    estimateSource: '',
    notes: '',
    reviewer: '',
    reviewDate: today(),
    updatedAt: '',
  };
}

const isString = (value: unknown): value is string => typeof value === 'string';

function isPlannerReview(value: unknown): value is PlannerReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<PlannerReview>;
  return (
    isString(review.segmentId) &&
    coordinationStrategies.some(({ value: option }) => review.strategy === option) &&
    engagementStages.some(({ value: option }) => review.engagement === option) &&
    feasibilityOptions.some(({ value: option }) => review.feasibility === option) &&
    isString(review.relatedProject) &&
    isString(review.projectOwner) &&
    isString(review.projectContact) &&
    Array.isArray(review.fundingSources) &&
    review.fundingSources.every(isString) &&
    isString(review.proposedTreatment) &&
    isString(review.constraints) &&
    isString(review.professionalCostEstimate) &&
    isString(review.estimateSource) &&
    isString(review.notes) &&
    isString(review.reviewer) &&
    isString(review.reviewDate) &&
    isString(review.updatedAt)
  );
}

export function loadPlannerReviews(): PlannerReviewStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PLANNER_REVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([segmentId, review]) => isPlannerReview(review) && review.segmentId === segmentId,
      ),
    );
  } catch {
    return {};
  }
}

export function savePlannerReviews(reviews: PlannerReviewStore): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(PLANNER_REVIEW_STORAGE_KEY, JSON.stringify(reviews));
    return true;
  } catch {
    return false;
  }
}

export type PlannerReviewPanelProps = {
  selected: SopFeature;
  existing?: PlannerReview | null;
  onSave: (review: PlannerReview) => void;
  onClose: () => void;
};

export default function PlannerReviewPanel({
  selected,
  existing,
  onSave,
  onClose,
}: PlannerReviewPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const estimateWarningId = useId();
  const segmentId = selected.properties.location_id;
  const panelRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLSelectElement>(null);
  const onCloseRef = useRef(onClose);
  const previousSegmentIdRef = useRef(segmentId);
  const [review, setReview] = useState<PlannerReview>(() =>
    existing?.segmentId === segmentId ? existing : createPlannerReview(segmentId),
  );
  const [saveMessage, setSaveMessage] = useState('');

  onCloseRef.current = onClose;

  useEffect(() => {
    const segmentChanged = previousSegmentIdRef.current !== segmentId;
    setReview(existing?.segmentId === segmentId ? existing : createPlannerReview(segmentId));
    if (segmentChanged) {
      setSaveMessage('');
      previousSegmentIdRef.current = segmentId;
    }
  }, [existing, segmentId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected && previouslyFocused !== document.body) previouslyFocused.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('#viewDiv canvas')?.focus({ preventScroll: true });
    };
  }, []);

  const update = <K extends keyof PlannerReview>(field: K, value: PlannerReview[K]) => {
    setReview((current) => ({ ...current, [field]: value }));
    setSaveMessage('');
  };

  const toggleFundingSource = (source: string) => {
    update(
      'fundingSources',
      review.fundingSources.includes(source)
        ? review.fundingSources.filter((item) => item !== source)
        : [...review.fundingSources, source],
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const savedReview = { ...review, updatedAt: new Date().toISOString() };
    setReview(savedReview);
    onSave(savedReview);
    setSaveMessage('Review saved in this browser.');
  };

  return (
    <div className="planner-review-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        ref={panelRef}
        className="planner-review-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="planner-review-header">
          <div>
            <span className="planner-review-kicker">Planner follow-up assessment</span>
            <h2 id={titleId}>{selected.properties.display_name ?? `Segment ${segmentId.slice(0, 12)}`}</h2>
            <p id={descriptionId}>
              Document coordination, feasibility, and verified funding information.
            </p>
          </div>
          <button className="planner-review-close" type="button" onClick={onClose} aria-label="Close planner review">
            ×
          </button>
        </header>

        <form className="planner-review-form" onSubmit={handleSubmit}>
          <section className="planner-review-score-summary">
            <h3>Transparent score comparison</h3>
            <div>
              <span>Public screening score <strong>{Math.round((selected.properties.public_screening_score ?? selected.properties.priority_score ?? 0) * 100)}</strong></span>
              <span aria-hidden="true">→</span>
              <span>Review-adjusted score <strong>{Math.round((selected.properties.review_adjusted_score ?? selected.properties.priority_score ?? 0) * 100)}</strong></span>
            </div>
            <p>Review adjustments are prototype assumptions and are excluded from the default ranking until explicitly enabled.</p>
            <details className="planner-review-impact">
              <summary>What changes when this review is saved?</summary>
              <p>The review is stored only in this browser. Saving does not change Street Need, Safety Urgency, zoning context, or the default public screening score.</p>
              <ul>
                <li>Initial discussion sets the review coordination signal to at least 55.</li>
                <li>A feasible concept sets it to at least 75; accepted scope to at least 90; approved scope and funding to 100.</li>
                <li>An independent strategy or a not-feasible finding sets the review coordination signal to 0.</li>
                <li>All other fields document follow-up work but do not change a score.</li>
              </ul>
              <p>The adjusted value affects map ranking only when <strong>Use planner-review adjustments</strong> is turned on.</p>
            </details>
          </section>
          <section>
            <h3>Coordination approach</h3>
            <label>
              Intended strategy
              <select ref={initialFocusRef} value={review.strategy} onChange={(event) => update('strategy', event.target.value as CoordinationStrategy)}>
                {coordinationStrategies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Engagement stage
              <select value={review.engagement} onChange={(event) => update('engagement', event.target.value as EngagementStage)}>
                {engagementStages.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="planner-review-two-column">
              <label>
                Related project or development
                <input value={review.relatedProject} onChange={(event) => update('relatedProject', event.target.value)} placeholder="Project name or ID" />
              </label>
              <label>
                Project owner
                <input value={review.projectOwner} onChange={(event) => update('projectOwner', event.target.value)} placeholder="Agency or developer" />
              </label>
            </div>
            <label>
              Project contact
              <input value={review.projectContact} onChange={(event) => update('projectContact', event.target.value)} placeholder="Name, email, or phone" />
            </label>
          </section>

          <section>
            <h3>Potential funding pathways</h3>
            <p className="planner-review-help">Selections identify leads to investigate; they do not indicate that funding is available or committed.</p>
            <fieldset className="planner-review-checklist">
              <legend className="sr-only">Potential funding sources</legend>
              {FUNDING_SOURCE_OPTIONS.map((source) => (
                <label key={source}>
                  <input type="checkbox" checked={review.fundingSources.includes(source)} onChange={() => toggleFundingSource(source)} />
                  <span>{source}</span>
                </label>
              ))}
            </fieldset>
          </section>

          <section>
            <h3>Professional assessment</h3>
            <label>
              Feasibility
              <select value={review.feasibility} onChange={(event) => update('feasibility', event.target.value as Feasibility)}>
                {feasibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Proposed treatment
              <textarea rows={3} value={review.proposedTreatment} onChange={(event) => update('proposedTreatment', event.target.value)} placeholder="Not assessed" />
            </label>
            <label>
              Constraints
              <textarea rows={3} value={review.constraints} onChange={(event) => update('constraints', event.target.value)} placeholder="Right-of-way, environmental, operational, or delivery constraints" />
            </label>
            <div className="planner-review-cost-heading">
              <span>Professional cost estimate</span>
              {!review.professionalCostEstimate.trim() && <strong>Not assessed</strong>}
            </div>
            <p id={estimateWarningId} className="planner-review-warning">Only enter a documented planning or engineering estimate. Do not substitute an automated or assumed cost.</p>
            <div className="planner-review-two-column">
              <label>
                Estimate or range
                <input value={review.professionalCostEstimate} onChange={(event) => update('professionalCostEstimate', event.target.value)} placeholder="Not assessed" aria-describedby={estimateWarningId} />
              </label>
              <label>
                Estimate source
                <input value={review.estimateSource} onChange={(event) => update('estimateSource', event.target.value)} placeholder="Author, document, and date" required={Boolean(review.professionalCostEstimate.trim())} aria-describedby={estimateWarningId} />
              </label>
            </div>
          </section>

          <section>
            <h3>Review record</h3>
            <label>
              Notes
              <textarea rows={4} value={review.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Follow-up actions, assumptions, and supporting documents" />
            </label>
            <div className="planner-review-two-column">
              <label>
                Reviewer
                <input value={review.reviewer} onChange={(event) => update('reviewer', event.target.value)} placeholder="Name or team" />
              </label>
              <label>
                Review date
                <input type="date" value={review.reviewDate} onChange={(event) => update('reviewDate', event.target.value)} />
              </label>
            </div>
          </section>

          <footer className="planner-review-actions">
            <span className="planner-review-save-message" role="status" aria-live="polite">{saveMessage}</span>
            <button type="button" className="planner-review-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="planner-review-primary">Save review</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
