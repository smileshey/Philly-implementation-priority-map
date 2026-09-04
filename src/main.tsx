import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/styles.common.css';
import './styles/navBar.css';
import './styles/styles.desktop.css';
import BasicMenu from './navBar';
import SliderWidget, { type ScreeningFilters, type WeightPreset } from './slider_widget';
import LayerToggle, { type LayerVisibility } from './layer_toggle';
import PlannerReviewPanel, {
  loadPlannerReviews,
  savePlannerReviews,
  type PlannerReview,
  type PlannerReviewStore
} from './planner_review';
import { loadDataManifest, loadExternalData, loadSopData } from './data';
import { baseCoordinationScore, recalculatePriority, topSegments, type CoordinationOverrides } from './scoring';
import { segmentMidpoint } from './geometry';
import type { DataManifest, ExternalData, SopCollection, SopFeature, Weights, ZoningLens } from './types';

const PRESET_WEIGHTS: Record<WeightPreset, Weights> = {
  need: { need: 4, safety: 1, coordination: 1 },
  safety: { need: 1, safety: 4, coordination: 1 },
  coordination: { need: 1, safety: 1, coordination: 4 },
  balanced: { need: 2, safety: 2, coordination: 2 }
};
const DEFAULT_WEIGHTS = PRESET_WEIGHTS.balanced;
const EMPTY_EXTERNAL: ExternalData = {
  hin: { type: 'FeatureCollection', features: [] },
  capital: { type: 'FeatureCollection', features: [] },
  environmental: { type: 'FeatureCollection', features: [] },
  completeStreets: { type: 'FeatureCollection', features: [] },
  development: { type: 'FeatureCollection', features: [] },
  pwd: { type: 'FeatureCollection', features: [] },
  transit: { type: 'FeatureCollection', features: [] },
  crashes: { type: 'FeatureCollection', features: [] },
  bike: { type: 'FeatureCollection', features: [] }
};
const SOURCE_URLS = {
  hin: 'https://hub.arcgis.com/api/v3/datasets/7e416319784a463fa0d8b528d7ccf511_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1',
  capital: 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/26',
  environmental: 'https://geopub.epa.gov/ArcGIS/rest/services/EMEF/efpoints/MapServer',
  zoning: 'https://opendataphilly.org/datasets/zoning-base-districts/',
  streets: 'https://opendataphilly.org/datasets/streets-composite-layer/',
  completeStreets: 'https://opendataphilly.org/datasets/complete-streets/',
  permits: 'https://opendataphilly.org/datasets/licenses-and-inspections-building-and-zoning-permits/',
  pwd: 'https://water.phila.gov/projects/map/',
  septa: 'https://opendataphilly.org/datasets/septa-routes-stops-locations/',
  crashes: 'https://opendataphilly.org/datasets/crashes/',
  floodplain: 'https://opendataphilly.org/datasets/fema-flood-plain/',
  historic: 'https://opendataphilly.org/datasets/philadelphia-registered-historic-districts/',
  bike: 'https://opendataphilly.org/datasets/bike-network/'
};

const EMPTY_FILTERS: ScreeningFilters = {
  unreviewed: false,
  completeStreets: false,
  futureCapital: false,
  development: false,
  pwd: false,
  transit: false,
  constraints: false,
  missingZoning: false
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function markerImage(label: string, color: string, shape: 'circle' | 'diamond' | 'triangle'): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.clearRect(0, 0, 48, 48);
  context.fillStyle = color;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 4;
  context.beginPath();
  if (shape === 'circle') context.arc(24, 24, 18, 0, Math.PI * 2);
  else if (shape === 'diamond') {
    context.moveTo(24, 3); context.lineTo(45, 24); context.lineTo(24, 45); context.lineTo(3, 24); context.closePath();
  } else {
    context.moveTo(24, 3); context.lineTo(45, 43); context.lineTo(3, 43); context.closePath();
  }
  context.fill();
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = 'bold 22px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 24, shape === 'triangle' ? 28 : 24);
  return context.getImageData(0, 0, 48, 48);
}

function formatCurrency(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
    : 'Not reported';
}

const CAPITAL_STAGE_LABELS: Record<string, string> = {
  completed: 'Completed',
  under_construction: 'Under construction',
  in_development: 'In development',
  future_development: 'Future development',
  unverified: 'Status not verified'
};

const STRATEGY_LABELS: Record<PlannerReview['strategy'], string> = {
  undetermined: 'Not yet determined',
  include_in_scope: 'Seek inclusion in an existing project',
  separate_coordinated: 'Develop a separate, coordinated project',
  independent: 'Develop an independent project'
};

const ENGAGEMENT_LABELS: Record<PlannerReview['engagement'], string> = {
  not_contacted: 'Project owner not contacted',
  initial_discussion: 'Initial discussion completed',
  feasible: 'Concept considered feasible',
  accepted_scope: 'Accepted into project scope',
  approved: 'Scope and funding approved'
};

const FEASIBILITY_LABELS: Record<PlannerReview['feasibility'], string> = {
  not_assessed: 'Not assessed',
  feasible: 'Feasible',
  uncertain: 'Uncertain',
  not_feasible: 'Not feasible'
};

const ZONING_LENS_LABELS: Record<ZoningLens, string> = {
  citywide: 'Citywide — no zoning adjustment',
  residential_access: 'Residential access',
  industrial_safety: 'Industrial safety'
};

const activeFlag = (value: unknown) => ['y', 'yes', 'true', '1', 't'].includes(String(value ?? '').trim().toLowerCase());

function capitalStage(properties: Record<string, unknown>): string {
  const preparedStage = String(properties.capital_project_stage ?? '');
  if (preparedStage) return preparedStage;
  if (activeFlag(properties.COMPLETED)) return 'completed';
  if (activeFlag(properties.UNDER_CONS)) return 'under_construction';
  if (activeFlag(properties.IN_DEVELOP)) return 'in_development';
  if (activeFlag(properties.FUTURE_DEV)) return 'future_development';
  return 'unverified';
}

function formatDate(value: unknown): string {
  if (value == null || String(value).trim() === '') return 'Not reported';
  const input = String(value).trim();
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const numeric = Number(value);
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : Number.isFinite(numeric) && numeric > 10_000_000_000
      ? new Date(numeric)
      : new Date(input);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function capitalPlanningNote(stage: string): string {
  if (stage === 'completed' || stage === 'under_construction') {
    return 'Shown for context only. This project does not raise the coordination score because its scope is unlikely to remain influenceable.';
  }
  if (stage === 'in_development') {
    return 'Potential coordination lead. Confirm the project owner, decision point, scope flexibility, and funding before relying on it.';
  }
  if (stage === 'future_development') {
    return 'Early coordination lead. Confirm that the project is active and determine when scope decisions will occur.';
  }
  return 'Proximity alone is an unverified lead; status, timing, scope, funding, and partner interest require confirmation.';
}

function externalPopupHtml(layerId: string, properties: Record<string, unknown>): string {
  if (layerId.startsWith('capital-')) {
    const title = properties.PROJECT_TI || properties.STREET_NAM || 'Transportation project';
    const stage = capitalStage(properties);
    const opportunity = Number(properties.capital_opportunity_signal ?? 0);
    return `<div class="popup-content feature-popup">
      <div class="popup-kicker capital">Capital project</div>
      <strong>${escapeHtml(title)}</strong>
      <dl>
        <dt>Project ID</dt><dd>${escapeHtml(properties.PROJECT_ID || 'Not reported')}</dd>
        <dt>Improvement</dt><dd>${escapeHtml(properties.PROJECT_IM || 'Not reported')}</dd>
        <dt>Description</dt><dd>${escapeHtml(properties.PUBLIC_NAR || 'Not reported')}</dd>
        <dt>Estimated construction</dt><dd>${formatCurrency(properties.EST_CONSTR)}</dd>
        <dt>Current cost</dt><dd>${formatCurrency(properties.CURRENT_CO)}</dd>
        <dt>Lifecycle</dt><dd>${escapeHtml(CAPITAL_STAGE_LABELS[stage] ?? stage)}</dd>
        <dt>Let date</dt><dd>${escapeHtml(formatDate(properties.LET_DATE_D))}</dd>
        <dt>Notice to proceed</dt><dd>${escapeHtml(formatDate(properties.NTP_DATE))}</dd>
        <dt>Open date</dt><dd>${escapeHtml(formatDate(properties.OPEN_DATE))}</dd>
        <dt>Coordination signal</dt><dd>${Math.round((Number.isFinite(opportunity) ? opportunity : 0) * 100)} / 100</dd>
      </dl>
      <p class="popup-planning-note">${escapeHtml(capitalPlanningNote(stage))}</p>
    </div>`;
  }

  if (layerId === 'complete-streets-lines') {
    return `<div class="popup-content feature-popup">
      <div class="popup-kicker policy">Policy context</div>
      <strong>${escapeHtml(properties.stname || properties.street_typ || 'Complete Streets segment')}</strong>
      <dl><dt>Street type</dt><dd>${escapeHtml(properties.street_typ || properties.combined_s || 'Not reported')}</dd>
      <dt>Road class</dt><dd>${escapeHtml(properties.class1 || 'Not reported')}</dd>
      <dt>Recommended facility</dt><dd>${escapeHtml(properties.recfacil || properties.bikenetwor || 'Not reported')}</dd>
      <dt>Sidewalk</dt><dd>${escapeHtml(properties.sidewlk_wd || 'Not reported')}</dd>
      <dt>Walking zone</dt><dd>${escapeHtml(properties.wlk_zn || 'Not reported')}</dd></dl>
      <p class="popup-planning-note">Policy evidence only; this record does not establish engineering feasibility.</p>
    </div>`;
  }
  if (layerId === 'development-icons') {
    return `<div class="popup-content feature-popup"><div class="popup-kicker development">Development lead</div>
      <strong>${escapeHtml(properties.address || 'Issued development permit')}</strong>
      <dl><dt>Permit</dt><dd>${escapeHtml(properties.permitnumber || 'Not reported')}</dd>
      <dt>Work</dt><dd>${escapeHtml(properties.typeofwork || properties.permittype || 'Not reported')}</dd>
      <dt>Issued</dt><dd>${escapeHtml(formatDate(properties.permitissuedate))}</dd>
      <dt>Status</dt><dd>${escapeHtml(properties.status || 'Not reported')}</dd></dl>
      <p class="popup-planning-note">A permit is a coordination lead—not evidence of active construction, accessible funds, or developer participation.</p></div>`;
  }
  if (layerId.startsWith('pwd-')) {
    return `<div class="popup-content feature-popup"><div class="popup-kicker pwd">PWD context</div>
      <strong>${escapeHtml(properties.project_name || 'PWD project')}</strong>
      <dl><dt>Status</dt><dd>${escapeHtml(properties.project_status || 'Not reported')}</dd>
      <dt>Stage</dt><dd>${escapeHtml(properties.context_stage || 'Unknown')}</dd>
      <dt>Type</dt><dd>${escapeHtml(properties.project_type || 'Not reported')}</dd></dl>
      <p class="popup-planning-note">Confirm schedule, ownership, scope flexibility, and coordination timing with PWD.</p></div>`;
  }
  if (layerId === 'transit-icons') {
    const routes = Array.isArray(properties.routes) ? properties.routes.join(', ') : properties.routes;
    return `<div class="popup-content feature-popup"><div class="popup-kicker transit">Transit context</div>
      <strong>${escapeHtml(properties.stop_name || 'SEPTA stop')}</strong>
      <dl><dt>Stop ID</dt><dd>${escapeHtml(properties.stop_id || 'Not reported')}</dd><dt>Routes</dt><dd>${escapeHtml(routes || 'Not reported')}</dd></dl>
      <p class="popup-planning-note">Transit proximity describes access and does not represent a capital commitment.</p></div>`;
  }
  if (layerId === 'crash-icons') {
    return `<div class="popup-content feature-popup"><div class="popup-kicker crashes">Crash evidence</div>
      <strong>Pedestrian or bicycle crash</strong><dl><dt>Year</dt><dd>${escapeHtml(properties.crash_year || 'Not reported')}</dd>
      <dt>Fatalities</dt><dd>${escapeHtml(properties.fatal_count || 0)}</dd><dt>Serious injuries</dt><dd>${escapeHtml(properties.susp_serious_inj_count || 0)}</dd></dl>
      <p class="popup-planning-note">Supporting evidence only; it is not scored separately from the High Injury Network.</p></div>`;
  }
  if (layerId === 'bike-lines') {
    return `<div class="popup-content feature-popup"><div class="popup-kicker bike">Bike-network context</div>
      <strong>${escapeHtml([properties.st_name, properties.st_type].filter(Boolean).join(' ') || 'Bike facility')}</strong>
      <dl><dt>Facility</dt><dd>${escapeHtml(properties.bikewaytyp || properties.facityp || properties.grouping || 'Not reported')}</dd></dl>
      <p class="popup-planning-note">Existing network context only; it does not establish a planned project.</p></div>`;
  }

  const siteType = properties.site_type === 'Superfund' ? 'Superfund' : 'Brownfield';
  const facilityUrl = String(properties.facility_url ?? '');
  const safeUrl = facilityUrl.startsWith('https://') ? facilityUrl : '';
  return `<div class="popup-content feature-popup">
    <div class="popup-kicker ${siteType.toLowerCase()}">${siteType} site</div>
    <strong>${escapeHtml(properties.primary_name || 'Unnamed EPA site')}</strong>
    <dl>
      <dt>Address</dt><dd>${escapeHtml(properties.location_address || 'Not reported')}</dd>
      <dt>EPA Registry ID</dt><dd>${escapeHtml(properties.registry_id || 'Not reported')}</dd>
    </dl>
    ${safeUrl ? `<a class="popup-source-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">View EPA facility record ↗</a>` : ''}
  </div>`;
}

const feet = (value: number | null | undefined) => value == null ? 'distance unavailable' : `${value.toLocaleString()} ft away`;

function plannerCoordinationOverrides(reviews: PlannerReviewStore, sop: SopCollection): CoordinationOverrides {
  const engagementScores: Record<PlannerReview['engagement'], number | null> = {
    not_contacted: null,
    initial_discussion: 0.55,
    feasible: 0.75,
    accepted_scope: 0.9,
    approved: 1
  };
  return Object.fromEntries(sop.features.flatMap((feature) => {
    const review = reviews[feature.properties.location_id];
    if (!review) return [];
    if (review.strategy === 'independent' || review.feasibility === 'not_feasible') {
      return [[feature.properties.location_id, 0]];
    }
    const reviewedScore = engagementScores[review.engagement];
    return [[
      feature.properties.location_id,
      reviewedScore == null ? baseCoordinationScore(feature) : Math.max(baseCoordinationScore(feature), reviewedScore)
    ]];
  }));
}

function segmentPopupHtml(feature: SopFeature, review?: PlannerReview): string {
  const p = feature.properties;
  const hinEvidence = (p.hin_signal ?? 0) > 0
    ? `Matches the High Injury Network (${feet(p.hin_distance_ft)})`
    : 'No High Injury Network match within 82 ft';
  const capitalEvidence = (p.capital_signal ?? 0) > 0
    ? `${escapeHtml(p.capital_project_name ?? 'Mapped project')} (${feet(p.capital_distance_ft)}); ${escapeHtml(CAPITAL_STAGE_LABELS[p.capital_project_stage ?? 'unverified'] ?? p.capital_project_stage ?? 'status not verified')}; contributes ${Math.round((p.capital_opportunity_signal ?? 0) * 100)} / 100`
    : 'No capital project detected within 164 ft';
  const brownfieldDetected = (p.brownfield_proximity_signal ?? p.brownfield_signal ?? 0) > 0;
  const brownfieldEvidence = brownfieldDetected
    ? `${escapeHtml(p.brownfield_site_name ?? 'Unnamed Brownfield')} (${feet(p.brownfield_distance_ft)}); proximity-only lead contributes ${Math.round((p.brownfield_opportunity_signal ?? p.brownfield_signal ?? 0) * 100)} / 100`
    : 'None detected within 1,640 ft';
  const superfundEvidence = (p.superfund_signal ?? 0) > 0
    ? `${escapeHtml(p.superfund_site_name ?? 'Unnamed Superfund site')} (${feet(p.superfund_distance_ft)})`
    : 'None detected within 1,640 ft';
  const fundingSources = review?.fundingSources.length
    ? review.fundingSources.map((source) => escapeHtml(source)).join('<br>')
    : 'No pathways documented';
  const costEstimate = review?.professionalCostEstimate.trim() || 'Not assessed';
  const estimateSource = review?.estimateSource.trim() || 'Not assessed';
  const treatment = review?.proposedTreatment.trim() || 'Not assessed';
  const constraints = review?.constraints.trim() || 'Not assessed';
  const zoningLens = p.zoning_lens ?? 'citywide';
  const zoningScore = p.zoning_context_score == null
    ? 'Not applied'
    : `${Math.round(p.zoning_context_score * 100)} / 100 (15% of priority)`;
  const zoningTreatment = p.zoning_primary_group?.startsWith('Industrial')
    ? 'Screen worker access, truck conflicts, crossings, lighting, and sidewalk continuity; coordinate with freight operations.'
    : p.zoning_primary_group?.startsWith('Residential')
      ? 'Screen crossings, traffic calming, sidewalk continuity, and access to neighborhood destinations.'
      : p.zoning_primary_group?.startsWith('Commercial')
        ? 'Screen crossings, curb/loading activity, transit access, and pedestrian circulation.'
        : 'Confirm the site-specific land use and appropriate treatment with planning and engineering staff.';
  const publicScore = Math.round((p.public_screening_score ?? p.priority_score ?? 0) * 100);
  const adjustedScore = Math.round((p.review_adjusted_score ?? p.priority_score ?? 0) * 100);
  const scoreDelta = adjustedScore - publicScore;
  const constraintEvidence = p.context_review_flags || 'No mapped Phase 5 review flags';

  return `<div class="popup-content segment-popup">
    <div class="popup-kicker recommendation">Follow-up candidate</div>
    <strong>${escapeHtml(p.display_name ?? `Segment ${p.location_id.slice(0, 8)}`)}</strong>
    <p class="segment-reference">${escapeHtml(p.neighborhood ?? 'Philadelphia')} · ${escapeHtml(p.location_id)}</p>
    <h4>${escapeHtml(p.recommendation_title ?? 'Investigate this segment further')}</h4>
    <div class="score-grid">
      <span>Need <b>${Math.round((p.need_score ?? 0) * 100)}</b></span>
      <span>Safety <b>${Math.round((p.safety_score ?? p.hin_signal ?? 0) * 100)}</b></span>
      <span>Coordination <b>${Math.round((p.coordination_opportunity_signal ?? 0) * 100)}</b></span>
      <span>Screening priority <b>${Math.round((p.priority_score ?? 0) * 100)}</b></span>
    </div>
    <div class="score-comparison"><span>Public screening <b>${publicScore}</b></span><span>→</span><span>Review-adjusted <b>${adjustedScore}</b></span><small>${scoreDelta === 0 ? 'No review adjustment' : `${scoreDelta > 0 ? '+' : ''}${scoreDelta} points from documented review`}</small></div>
    <p>${escapeHtml(p.recommendation_action ?? 'Identify a viable implementation pathway.')}</p>
    <div class="recommendation-badges">
      <span>Impact: ${escapeHtml(p.recommendation_impact ?? '—')}</span>
      <span>Planner review: ${review ? 'saved' : 'not started'}</span>
      ${p.zoning_special_review ? '<span class="warning">Special-context review</span>' : ''}
    </div>
    <p class="recommendation-rationale">${escapeHtml(p.recommendation_rationale ?? '')}</p>
    <details>
      <summary>Planner assessment</summary>
      <dl>
        <dt>Strategy</dt><dd>${review ? escapeHtml(STRATEGY_LABELS[review.strategy]) : 'Not assessed'}</dd>
        <dt>Engagement</dt><dd>${review ? escapeHtml(ENGAGEMENT_LABELS[review.engagement]) : 'Not assessed'}</dd>
        <dt>Feasibility</dt><dd>${review ? escapeHtml(FEASIBILITY_LABELS[review.feasibility]) : 'Not assessed'}</dd>
        <dt>Treatment</dt><dd>${escapeHtml(treatment)}</dd>
        <dt>Professional cost</dt><dd>${escapeHtml(costEstimate)}</dd>
        <dt>Estimate source</dt><dd>${escapeHtml(estimateSource)}</dd>
        <dt>Effort / timing</dt><dd>Not assessed</dd>
        <dt>Constraints</dt><dd>${escapeHtml(constraints)}</dd>
        <dt>Funding leads</dt><dd>${fundingSources}</dd>
      </dl>
    </details>
    <details>
      <summary>Evidence and sources</summary>
      <dl>
        <dt>SoP need</dt><dd>${Math.round((p.need_score ?? 0) * 100)} / 100 · practicum dataset</dd>
        <dt>Safety urgency</dt><dd>${hinEvidence} · <a href="${SOURCE_URLS.hin}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Capital opportunity</dt><dd>${capitalEvidence} · <a href="${SOURCE_URLS.capital}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Brownfield lead</dt><dd>${brownfieldEvidence} · <a href="${SOURCE_URLS.environmental}" target="_blank" rel="noreferrer">EPA source ↗</a></dd>
        <dt>Separate constraint</dt><dd>${superfundEvidence} · <a href="${SOURCE_URLS.environmental}" target="_blank" rel="noreferrer">EPA source ↗</a></dd>
        <dt>Complete Streets</dt><dd>${p.complete_streets_match ? `${escapeHtml(p.complete_streets_type ?? 'Matched')} · ${escapeHtml(p.complete_streets_policy_notes ?? 'policy context available')}` : 'No match'} · <a href="${SOURCE_URLS.completeStreets}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Development</dt><dd>${p.development_context ? `${p.development_permit_count ?? 0} substantial issued permit(s); nearest at ${feet(p.development_permit_nearest_ft)} · ${escapeHtml(p.development_permit_address ?? '')}` : 'No filtered permit within 250 ft'} · <a href="${SOURCE_URLS.permits}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>PWD project</dt><dd>${p.pwd_project_match ? `${escapeHtml(p.pwd_project_name ?? 'Mapped project')} · ${escapeHtml(p.pwd_project_stage ?? 'unknown stage')} · ${feet(p.pwd_project_distance_ft)}` : 'No match within 328 ft'} · <a href="${SOURCE_URLS.pwd}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Transit access</dt><dd>${p.transit_stop_count ? `${p.transit_stop_count} stop record(s) within 500 ft; ${escapeHtml(p.nearest_transit_stop_name ?? '')}; routes ${escapeHtml(p.transit_routes || 'not reported')}` : 'No stop within 500 ft'} · <a href="${SOURCE_URLS.septa}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Crash evidence</dt><dd>${p.crash_count ? `${p.crash_count} pedestrian/bicycle crash(es), including ${p.serious_crash_count ?? 0} fatal or serious-injury crash(es), within 164 ft` : 'No pedestrian/bicycle crash in the mapped period within 164 ft'} · <a href="${SOURCE_URLS.crashes}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Review flags</dt><dd>${escapeHtml(constraintEvidence)}</dd>
        <dt>Zoning context</dt><dd>${escapeHtml(p.zoning_primary_group ?? 'Not assessed')} · ${escapeHtml(p.zoning_primary_code ?? 'code unavailable')}</dd>
        <dt>Adjacent mix</dt><dd>${escapeHtml(p.zoning_land_use_mix ?? 'Not assessed')}</dd>
        <dt>Land-use lens</dt><dd>${escapeHtml(ZONING_LENS_LABELS[zoningLens])} · ${zoningScore}</dd>
        ${p.zoning_pending ? `<dt>Pending zoning</dt><dd>Mapped pending change${p.zoning_pending_bills ? ` · ${escapeHtml(p.zoning_pending_bills)}` : ''}; treat as a coordination lead, not proof of development.</dd>` : ''}
        <dt>Treatment context</dt><dd>${escapeHtml(zoningTreatment)}</dd>
        <dt>Zoning method</dt><dd>${escapeHtml(p.zoning_context_basis ?? 'Not assessed')} · <a href="${SOURCE_URLS.zoning}" target="_blank" rel="noreferrer">City data ↗</a></dd>
      </dl>
    </details>
    <button class="planner-review-launch" type="button">${review ? 'Update planner review' : 'Start planner review'}</button>
    <small>Rule-generated screening result (${escapeHtml(p.recommendation_method ?? 'prototype')}); it does not select a project or confirm engineering feasibility, project scope, funding availability, cost, or schedule.</small>
  </div>`;
}

function addSourceAndLayers(map: MapLibreMap, sop: SopCollection, external: ExternalData) {
  if (!map.getSource('sop')) map.addSource('sop', { type: 'geojson', data: sop });
  if (!map.getSource('hin')) map.addSource('hin', { type: 'geojson', data: external.hin });
  if (!map.getSource('capital')) map.addSource('capital', { type: 'geojson', data: external.capital });
  if (!map.getSource('complete-streets')) map.addSource('complete-streets', { type: 'geojson', data: external.completeStreets });
  if (!map.getSource('development')) map.addSource('development', { type: 'geojson', data: external.development });
  if (!map.getSource('pwd')) map.addSource('pwd', { type: 'geojson', data: external.pwd });
  if (!map.getSource('transit')) map.addSource('transit', { type: 'geojson', data: external.transit });
  if (!map.getSource('crashes')) map.addSource('crashes', { type: 'geojson', data: external.crashes });
  if (!map.getSource('bike')) map.addSource('bike', { type: 'geojson', data: external.bike });
  const environmental = {
    type: 'FeatureCollection' as const,
    features: external.environmental.features
  };
  if (!map.getSource('environmental')) map.addSource('environmental', { type: 'geojson', data: environmental });
  if (!map.hasImage('capital-project-marker')) map.addImage('capital-project-marker', markerImage('C', '#6a1b9a', 'diamond'), { pixelRatio: 2 });
  if (!map.hasImage('brownfield-marker')) map.addImage('brownfield-marker', markerImage('B', '#ef8a00', 'circle'), { pixelRatio: 2 });
  if (!map.hasImage('superfund-marker')) map.addImage('superfund-marker', markerImage('S', '#b71c1c', 'triangle'), { pixelRatio: 2 });
  if (!map.hasImage('development-marker')) map.addImage('development-marker', markerImage('D', '#ad5a18', 'circle'), { pixelRatio: 2 });
  if (!map.hasImage('pwd-marker')) map.addImage('pwd-marker', markerImage('W', '#1976a8', 'diamond'), { pixelRatio: 2 });
  if (!map.hasImage('transit-marker')) map.addImage('transit-marker', markerImage('T', '#253b80', 'circle'), { pixelRatio: 2 });
  if (!map.hasImage('crash-marker')) map.addImage('crash-marker', markerImage('!', '#b33a3a', 'triangle'), { pixelRatio: 2 });

  if (!map.getLayer('sop-lines')) {
    map.addLayer({
      id: 'sop-lines',
      type: 'line',
      source: 'sop',
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 4],
        'line-opacity': 0.82,
        'line-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'priority_score'], ['get', 'need_score'], 0],
          0, '#2c7bb6',
          0.5, '#ffffbf',
          1, '#d7191c'
        ]
      }
    });
  }
  if (!map.getLayer('hin-lines')) map.addLayer({ id: 'hin-lines', type: 'line', source: 'hin', paint: { 'line-color': '#111', 'line-width': 2.5, 'line-opacity': 0.25 } });
  if (!map.getLayer('capital-lines')) map.addLayer({ id: 'capital-lines', type: 'line', source: 'capital', paint: { 'line-color': '#6a1b9a', 'line-width': 2, 'line-opacity': 0.15, 'line-dasharray': [2, 1] } });
  if (!map.getLayer('capital-icons')) map.addLayer({
    id: 'capital-icons', type: 'symbol', source: 'capital',
    layout: { 'symbol-placement': 'line-center', 'icon-image': 'capital-project-marker', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 1], 'icon-padding': 8, 'icon-allow-overlap': false },
    paint: { 'icon-opacity': 0.4 }
  });
  if (!map.getLayer('brownfield-icons')) map.addLayer({
    id: 'brownfield-icons', type: 'symbol', source: 'environmental',
    filter: ['==', ['get', 'site_type'], 'Brownfield'],
    layout: { 'icon-image': 'brownfield-marker', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.65, 15, 1], 'icon-padding': 7, 'icon-allow-overlap': false }
  });
  if (!map.getLayer('superfund-icons')) map.addLayer({
    id: 'superfund-icons', type: 'symbol', source: 'environmental',
    filter: ['==', ['get', 'site_type'], 'Superfund'],
    layout: { 'icon-image': 'superfund-marker', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.75, 15, 1.05], 'icon-allow-overlap': true }
  });
  if (!map.getLayer('complete-streets-lines')) map.addLayer({ id: 'complete-streets-lines', type: 'line', source: 'complete-streets', paint: { 'line-color': '#00897b', 'line-width': 3, 'line-opacity': 0.35, 'line-dasharray': [1.5, 1] } });
  if (!map.getLayer('development-icons')) map.addLayer({ id: 'development-icons', type: 'symbol', source: 'development', layout: { 'icon-image': 'development-marker', 'icon-size': 0.7, 'icon-padding': 7, 'icon-allow-overlap': false }, paint: { 'icon-opacity': 0.7 } });
  if (!map.getLayer('pwd-lines')) map.addLayer({ id: 'pwd-lines', type: 'line', source: 'pwd', paint: { 'line-color': '#1976a8', 'line-width': 2.5, 'line-opacity': 0.38 } });
  if (!map.getLayer('pwd-icons')) map.addLayer({ id: 'pwd-icons', type: 'symbol', source: 'pwd', layout: { 'symbol-placement': 'line-center', 'icon-image': 'pwd-marker', 'icon-size': 0.72, 'icon-padding': 8, 'icon-allow-overlap': false }, paint: { 'icon-opacity': 0.75 } });
  if (!map.getLayer('transit-icons')) map.addLayer({ id: 'transit-icons', type: 'symbol', source: 'transit', layout: { 'icon-image': 'transit-marker', 'icon-size': 0.6, 'icon-padding': 5, 'icon-allow-overlap': false }, paint: { 'icon-opacity': 0.75 } });
  if (!map.getLayer('crash-icons')) map.addLayer({ id: 'crash-icons', type: 'symbol', source: 'crashes', layout: { 'icon-image': 'crash-marker', 'icon-size': 0.52, 'icon-padding': 4, 'icon-allow-overlap': false }, paint: { 'icon-opacity': 0.62 } });
  if (!map.getLayer('bike-lines')) map.addLayer({ id: 'bike-lines', type: 'line', source: 'bike', paint: { 'line-color': '#3f8d4e', 'line-width': 2, 'line-opacity': 0.38, 'line-dasharray': [2, 1] } });
}

function applyLayerVisibility(map: MapLibreMap, visibility: LayerVisibility) {
  const values: [keyof LayerVisibility, string[]][] = [
    ['sop', ['sop-lines']],
    ['hin', ['hin-lines']],
    ['capital', ['capital-lines', 'capital-icons']],
    ['environmental', ['brownfield-icons', 'superfund-icons']],
    ['completeStreets', ['complete-streets-lines']],
    ['development', ['development-icons']],
    ['pwd', ['pwd-lines', 'pwd-icons']],
    ['transit', ['transit-icons']],
    ['crashes', ['crash-icons']],
    ['bike', ['bike-lines']]
  ];
  values.forEach(([key, layers]) => layers.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility[key] ? 'visible' : 'none');
  }));
}

function filterSegments(sop: SopCollection, filters: ScreeningFilters, reviews: PlannerReviewStore): SopCollection {
  return {
    ...sop,
    features: sop.features.filter(({ properties: p }) =>
      (!filters.unreviewed || !reviews[p.location_id]) &&
      (!filters.completeStreets || p.complete_streets_match) &&
      (!filters.futureCapital || (p.capital_opportunity_signal ?? 0) >= 0.4) &&
      (!filters.development || p.development_context) &&
      (!filters.pwd || p.pwd_coordination_context) &&
      (!filters.transit || (p.transit_stop_count ?? 0) > 0) &&
      (!filters.constraints || Boolean(p.context_review_flags)) &&
      (!filters.missingZoning || (p.zoning_sample_count ?? 0) === 0)
    )
  };
}

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rankMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [baseSop, setBaseSop] = useState<SopCollection | null>(null);
  const [scoredSop, setScoredSop] = useState<SopCollection | null>(null);
  const [external, setExternal] = useState<ExternalData>(EMPTY_EXTERNAL);
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [activePreset, setActivePreset] = useState<WeightPreset | 'custom'>('balanced');
  const [zoningLens, setZoningLens] = useState<ZoningLens>('citywide');
  const [applyPlannerAdjustments, setApplyPlannerAdjustments] = useState(false);
  const [filters, setFilters] = useState<ScreeningFilters>(EMPTY_FILTERS);
  const [visibility, setVisibility] = useState<LayerVisibility>({
    sop: true, hin: false, capital: false, environmental: false,
    completeStreets: false, development: false, pwd: false, transit: false, crashes: false, bike: false
  });
  const [infoPanel, setInfoPanel] = useState<'how' | 'data' | null>(null);
  const [reviews, setReviews] = useState<PlannerReviewStore>(() => loadPlannerReviews());
  const [selectedSegment, setSelectedSegment] = useState<SopFeature | null>(null);

  const displayedSop = useMemo(() => scoredSop ? filterSegments(scoredSop, filters, reviews) : null, [scoredSop, filters, reviews]);
  const top = useMemo(() => (displayedSop ? topSegments(displayedSop) : []), [displayedSop]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      center: [-75.1652, 39.9526],
      zoom: 11.2,
      minZoom: 9.5,
      maxZoom: 18,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sop, ext, sourceManifest] = await Promise.all([loadSopData(), loadExternalData(), loadDataManifest()]);
      if (cancelled) return;
      setBaseSop(sop);
      setExternal(ext);
      setManifest(sourceManifest);
      const storedReviews = loadPlannerReviews();
      setReviews(storedReviews);
      setScoredSop(recalculatePriority(
        sop,
        DEFAULT_WEIGHTS,
        plannerCoordinationOverrides(storedReviews, sop),
        { strategy: 'balanced', zoningLens: 'citywide', applyPlannerAdjustments: false }
      ));
    }
    load().catch((error) => {
      console.error('Data initialization failed', error);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !displayedSop) return;
    const render = () => {
      addSourceAndLayers(map, displayedSop, external);
      applyLayerVisibility(map, visibility);
      (map.getSource('sop') as GeoJSONSource | undefined)?.setData(displayedSop);
      (map.getSource('hin') as GeoJSONSource | undefined)?.setData(external.hin);
      (map.getSource('capital') as GeoJSONSource | undefined)?.setData(external.capital);
      (map.getSource('environmental') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: external.environmental.features
      });
      (map.getSource('complete-streets') as GeoJSONSource | undefined)?.setData(external.completeStreets);
      (map.getSource('development') as GeoJSONSource | undefined)?.setData(external.development);
      (map.getSource('pwd') as GeoJSONSource | undefined)?.setData(external.pwd);
      (map.getSource('transit') as GeoJSONSource | undefined)?.setData(external.transit);
      (map.getSource('crashes') as GeoJSONSource | undefined)?.setData(external.crashes);
      (map.getSource('bike') as GeoJSONSource | undefined)?.setData(external.bike);
      rankMarkersRef.current.forEach((marker) => marker.remove());
      rankMarkersRef.current = top.map((segment, index) => {
        const element = document.createElement('div');
        element.className = 'rank-marker';
        element.textContent = String(index + 1);
        element.style.display = visibility.sop ? 'flex' : 'none';
        return new maplibregl.Marker({ element }).setLngLat(segmentMidpoint(segment)).addTo(map);
      });
    };
    if (map.isStyleLoaded()) render(); else map.once('load', render);
  }, [displayedSop, external, top, visibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyLayerVisibility(map, visibility);
    rankMarkersRef.current.forEach((marker) => { marker.getElement().style.display = visibility.sop ? 'flex' : 'none'; });
  }, [visibility, scoredSop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const click = (event: maplibregl.MapMouseEvent) => {
      const interactiveLayers = ['superfund-icons', 'brownfield-icons', 'capital-icons', 'capital-lines', 'complete-streets-lines', 'development-icons', 'pwd-icons', 'pwd-lines', 'transit-icons', 'crash-icons', 'bike-lines', 'sop-lines']
        .filter((id) => map.getLayer(id));
      if (!interactiveLayers.length) return;
      const hits = map.queryRenderedFeatures(event.point, { layers: interactiveLayers });
      const hit = hits[0];
      if (!hit?.properties) return;
      if (hit.layer.id !== 'sop-lines') {
        new maplibregl.Popup({ maxWidth: '340px' })
          .setLngLat(event.lngLat)
          .setHTML(externalPopupHtml(hit.layer.id, hit.properties))
          .addTo(map);
        return;
      }
      const p = hit.properties;
      const feature = displayedSop?.features.find((item) => item.properties.location_id === p.location_id);
      if (!feature) return;
      const popup = new maplibregl.Popup({ maxWidth: '460px' })
        .setLngLat(event.lngLat)
        .setHTML(segmentPopupHtml(feature, reviews[feature.properties.location_id]))
        .addTo(map);
      popup.getElement()?.querySelector<HTMLButtonElement>('.planner-review-launch')?.addEventListener('click', () => {
        setSelectedSegment(feature);
        popup.remove();
      });
    };
    const move = (event: maplibregl.MapMouseEvent) => {
      const layers = ['superfund-icons', 'brownfield-icons', 'capital-icons', 'capital-lines', 'complete-streets-lines', 'development-icons', 'pwd-icons', 'pwd-lines', 'transit-icons', 'crash-icons', 'bike-lines', 'sop-lines']
        .filter((id) => map.getLayer(id));
      map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : '';
    };
    map.on('click', click);
    map.on('mousemove', move);
    return () => {
      map.off('click', click);
      map.off('mousemove', move);
    };
  }, [displayedSop, reviews]);

  const recalculate = () => {
    if (!baseSop) return;
    setScoredSop(recalculatePriority(
      baseSop,
      weights,
      plannerCoordinationOverrides(reviews, baseSop),
      { strategy: activePreset, zoningLens, applyPlannerAdjustments }
    ));
  };

  const reset = () => {
    setWeights(DEFAULT_WEIGHTS);
    setActivePreset('balanced');
    setZoningLens('citywide');
    setApplyPlannerAdjustments(false);
    setFilters(EMPTY_FILTERS);
    if (baseSop) setScoredSop(recalculatePriority(
      baseSop,
      DEFAULT_WEIGHTS,
      plannerCoordinationOverrides(reviews, baseSop),
      { strategy: 'balanced', zoningLens: 'citywide', applyPlannerAdjustments: false }
    ));
  };

  const applyPreset = (preset: WeightPreset) => {
    const nextWeights = PRESET_WEIGHTS[preset];
    setWeights(nextWeights);
    setActivePreset(preset);
    if (baseSop) setScoredSop(recalculatePriority(
      baseSop,
      nextWeights,
      plannerCoordinationOverrides(reviews, baseSop),
      { strategy: preset, zoningLens, applyPlannerAdjustments }
    ));
  };

  const applyZoningLens = (lens: ZoningLens) => {
    setZoningLens(lens);
    if (baseSop) setScoredSop(recalculatePriority(
      baseSop,
      weights,
      plannerCoordinationOverrides(reviews, baseSop),
      { strategy: activePreset, zoningLens: lens, applyPlannerAdjustments }
    ));
  };

  const applyReviewScoreMode = (apply: boolean) => {
    setApplyPlannerAdjustments(apply);
    if (baseSop) setScoredSop(recalculatePriority(
      baseSop,
      weights,
      plannerCoordinationOverrides(reviews, baseSop),
      { strategy: activePreset, zoningLens, applyPlannerAdjustments: apply }
    ));
  };

  const saveReview = (review: PlannerReview) => {
    const next = { ...reviews, [review.segmentId]: review };
    setReviews(next);
    savePlannerReviews(next);
    if (baseSop) setScoredSop(recalculatePriority(
      baseSop,
      weights,
      plannerCoordinationOverrides(next, baseSop),
      { strategy: activePreset, zoningLens, applyPlannerAdjustments }
    ));
  };

  return (
    <>
      <div ref={mapContainer} id="viewDiv" />
      <BasicMenu
        onHowItWorks={() => setInfoPanel((current) => current === 'how' ? null : 'how')}
        onData={() => setInfoPanel((current) => current === 'data' ? null : 'data')}
      />
      {infoPanel && (
        <section className="info-panel" aria-live="polite">
          <button className="info-panel-close" type="button" aria-label="Close information panel" onClick={() => setInfoPanel(null)}>×</button>
          {infoPanel === 'how' ? (
            <>
              <h2>How the screening tool works</h2>
              <p className="research-question"><strong>Research question:</strong> How can SoP need scores and public implementation context help Philadelphia planners identify high-need street segments that warrant further investigation?</p>
              <p><strong>Street Need</strong> is the inverse normalized State of Place score. <strong>Safety Urgency</strong> identifies a High Injury Network match. <strong>Investment &amp; Coordination Opportunity</strong> reflects influenceable PennDOT projects and capped Brownfield proximity leads.</p>
              <p>The presets now use different selection rules: <strong>Need first</strong> ranks need directly; <strong>Safety first</strong> places HIN segments first; <strong>Coordination first</strong> places verified or lifecycle-supported opportunities first; and <strong>Balanced</strong> uses the selected weights. Manual slider changes use a custom weighted score.</p>
              <p>The optional Residential access or Industrial safety lens contributes 15% of the result; the selected preset contributes 85%. Zoning describes land-use context, not engineering feasibility, and industrial segments remain eligible. In-development and future projects can raise coordination; under-construction and completed projects cannot.</p>
              <p>Complete Streets, filtered permits, PWD, transit, crash, floodplain, historic-district, bicycle-network, and vacancy records provide evidence or review flags. They do not alter the default score. Planner-review adjustments are also off by default and are always shown separately.</p>
              <p>This tool screens locations for follow-up. It does not select projects, establish engineering feasibility, guarantee funding, or estimate treatments and costs.</p>
            </>
          ) : (
            <>
              <h2>Data sources and limitations</h2>
              <p>{manifest ? `Prepared ${new Date(manifest.generated_at).toLocaleDateString()} · ${manifest.segment_count.toLocaleString()} SoP segments · method ${manifest.method_version}` : 'Loading source metadata…'}</p>
              <div className="source-records">
                {manifest?.sources.map((source) => (
                  <article className="source-record" key={source.id}>
                    <div><strong>{source.name}</strong><span className={`source-role ${source.role}`}>{source.role}</span>{source.affects_score && <span className="source-score-chip">affects score</span>}{source.status !== 'ready' && <span className="source-status-chip">{source.status}</span>}</div>
                    <small>{source.publisher} · {source.segment_match_count?.toLocaleString() ?? 0} segments matched ({source.segment_match_percent ?? 0}%)</small>
                    <p>{source.method}</p>
                    <p className="source-limitation">{source.limitations}</p>
                    {source.url.startsWith('http') && <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>}
                  </article>
                ))}
              </div>
              <p>The supplied SoP file is not attributed to an individual contributor in the repository. Confirm authorship, codebook interpretation, and redistribution permission before publication.</p>
            </>
          )}
        </section>
      )}
      <SliderWidget
        weights={weights}
        activePreset={activePreset}
        zoningLens={zoningLens}
        onWeights={(nextWeights) => { setWeights(nextWeights); setActivePreset('custom'); }}
        onPreset={applyPreset}
        onZoningLens={applyZoningLens}
        applyPlannerAdjustments={applyPlannerAdjustments}
        onApplyPlannerAdjustments={applyReviewScoreMode}
        filters={filters}
        onFilters={setFilters}
        onRecalculate={recalculate}
        onReset={reset}
        resultCount={displayedSop?.features.length ?? 0}
        top={top}
      />
      <div className="legend-container">
        <div className="legend-title">Screening Priority</div>
        <div className="legend-gradient" />
        <div className="legend-labels"><span>Lower</span><span>Higher</span></div>
      </div>
      <LayerToggle visibility={visibility} onChange={setVisibility} />
      {selectedSegment && (
        <PlannerReviewPanel
          selected={selectedSegment}
          existing={reviews[selectedSegment.properties.location_id]}
          onSave={saveReview}
          onClose={() => setSelectedSegment(null)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
