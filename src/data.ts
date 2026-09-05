import type { DataManifest, ExternalData, LineCollection, PointCollection, SopCollection } from './types';
import { addNeedDiagnostics } from './need_explanation';

async function fetchGeoJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export async function loadSopData(): Promise<SopCollection> {
  return addNeedDiagnostics(await fetchGeoJSON<SopCollection>('./data/implementation_segments.geojson'));
}

export async function loadExternalData(): Promise<ExternalData> {
  const [hin, capital, environmental, completeStreets, development, pwd, transit, crashes, bike] = await Promise.all([
    fetchGeoJSON<LineCollection>('./data/vision_zero.geojson'),
    fetchGeoJSON<LineCollection>('./data/capital_projects.geojson'),
    fetchGeoJSON<PointCollection>('./data/environmental_sites.geojson'),
    fetchGeoJSON<LineCollection>('./data/complete_streets_context.geojson'),
    fetchGeoJSON<PointCollection>('./data/development_permits_context.geojson'),
    fetchGeoJSON<LineCollection>('./data/pwd_projects_context.geojson'),
    fetchGeoJSON<PointCollection>('./data/transit_stops_context.geojson'),
    fetchGeoJSON<PointCollection>('./data/crashes_context.geojson'),
    fetchGeoJSON<LineCollection>('./data/bike_network_context.geojson')
  ]);
  return { hin, capital, environmental, completeStreets, development, pwd, transit, crashes, bike };
}

export async function loadDataManifest(): Promise<DataManifest> {
  return fetchGeoJSON<DataManifest>('./data/data_manifest.json');
}
