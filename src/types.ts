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
  hin_signal?: number;
  capital_signal?: number;
  environmental_signal?: number;
  environmental_opportunity_signal?: number;
  environmental_constraint_signal?: number;
  brownfield_signal?: number;
  superfund_signal?: number;
  hin_distance_ft?: number | null;
  capital_distance_ft?: number | null;
  capital_project_name?: string | null;
  brownfield_distance_ft?: number | null;
  brownfield_site_name?: string | null;
  superfund_distance_ft?: number | null;
  superfund_site_name?: string | null;
  feasibility_score?: number;
  priority_score?: number;
  recommendation_id?: string;
  recommendation_type?: string;
  recommendation_title?: string;
  recommendation_action?: string;
  recommendation_rationale?: string;
  recommendation_impact?: 'low' | 'medium' | 'high';
  implementation_effort?: 'low' | 'medium' | 'high';
  cost_band?: '$' | '$$' | '$$$';
  timing_band?: string;
  recommendation_evidence?: string;
  recommendation_method?: string;
};

export type SopFeature = Feature<LineString, SopProperties>;
export type SopCollection = FeatureCollection<LineString, SopProperties>;
export type LineCollection = FeatureCollection<LineString | MultiLineString>;
export type PointCollection = FeatureCollection<Point>;

export type Weights = {
  need: number;
  visionZero: number;
  capital: number;
  environmental: number;
};

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
