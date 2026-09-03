import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';

export type SopProperties = {
  location_id: string;
  SoPIndex8Norm: number;
  PEDS5Norm: number;
  SAFENorm: number;
  TRAFFIC6Norm: number;
  CONN7Norm: number;
  DENS3Norm: number;
  need_score?: number;
  safety_score?: number;
  hin_signal?: number;
  capital_signal?: number;
  capital_opportunity_signal?: number;
  brownfield_opportunity_signal?: number;
  coordination_opportunity_signal?: number;
  environmental_signal?: number;
  environmental_opportunity_signal?: number;
  environmental_constraint_signal?: number;
  brownfield_signal?: number;
  superfund_signal?: number;
  hin_distance_ft?: number | null;
  capital_distance_ft?: number | null;
  capital_project_id?: string | number | null;
  capital_project_name?: string | null;
  capital_project_stage?: string | null;
  capital_opportunity_basis?: string | null;
  capital_let_date?: string | null;
  capital_ntp_date?: string | null;
  capital_completion_date?: string | null;
  capital_open_date?: string | null;
  brownfield_distance_ft?: number | null;
  brownfield_site_name?: string | null;
  brownfield_proximity_signal?: number;
  superfund_distance_ft?: number | null;
  superfund_site_name?: string | null;
  zoning_primary_group?: string | null;
  zoning_primary_code?: string | null;
  zoning_land_use_mix?: string;
  zoning_codes?: string;
  zoning_residential_context_score?: number | null;
  zoning_industrial_context_score?: number | null;
  zoning_special_review?: boolean;
  zoning_pending?: boolean;
  zoning_pending_bills?: string;
  zoning_sample_count?: number;
  zoning_context_basis?: string;
  zoning_context_score?: number | null;
  priority_base_score?: number;
  priority_strategy?: PriorityStrategy;
  zoning_lens?: ZoningLens;
  feasibility_score?: number;
  priority_score?: number;
  recommendation_id?: string;
  recommendation_type?: string;
  recommendation_title?: string;
  recommendation_action?: string;
  recommendation_rationale?: string;
  recommendation_impact?: 'low' | 'medium' | 'high';
  implementation_effort?: 'low' | 'medium' | 'high' | null;
  cost_band?: '$' | '$$' | '$$$' | null;
  timing_band?: string | null;
  recommendation_evidence?: string;
  recommendation_method?: string;
};

export type SopFeature = Feature<LineString, SopProperties>;
export type SopCollection = FeatureCollection<LineString, SopProperties>;
export type LineCollection = FeatureCollection<LineString | MultiLineString>;
export type PointCollection = FeatureCollection<Point>;

export type Weights = {
  need: number;
  safety: number;
  coordination: number;
};

export type PriorityStrategy = 'need' | 'safety' | 'coordination' | 'balanced' | 'custom';
export type ZoningLens = 'citywide' | 'residential_access' | 'industrial_safety';

export type SourceStatus = 'loading' | 'ready' | 'failed';

export type ExternalData = {
  hin: LineCollection;
  capital: LineCollection;
  environmental: PointCollection;
};

export type DataStatus = {
  hin: SourceStatus;
  capital: SourceStatus;
  environmental: SourceStatus;
};
