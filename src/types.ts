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
  hin_distance_m?: number | null;
  capital_distance_m?: number | null;
  capital_project_name?: string | null;
  environmental_distance_m?: number | null;
  environmental_site_name?: string | null;
  environmental_site_type?: string | null;
  priority_score?: number;
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
