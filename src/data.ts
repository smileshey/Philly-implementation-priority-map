import type { ExternalData, LineCollection, PointCollection, SopCollection } from './types';

async function fetchGeoJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export async function loadSopData(): Promise<SopCollection> {
  return fetchGeoJSON<SopCollection>('./data/implementation_segments.geojson');
}

export async function loadExternalData(): Promise<ExternalData> {
  const [hin, capital, environmental] = await Promise.all([
    fetchGeoJSON<LineCollection>('./data/vision_zero.geojson'),
    fetchGeoJSON<LineCollection>('./data/capital_projects.geojson'),
    fetchGeoJSON<PointCollection>('./data/environmental_sites.geojson')
  ]);
  return { hin, capital, environmental };
}
