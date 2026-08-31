import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/styles.common.css';
import './styles/navBar.css';
import './styles/styles.desktop.css';
import BasicMenu from './navBar';
import SliderWidget from './slider_widget';
import LayerToggle, { type LayerVisibility } from './layer_toggle';
import { loadExternalData, loadSopData } from './data';
import { recalculatePriority, recommendedAction, topSegments } from './scoring';
import { segmentMidpoint } from './geometry';
import type { DataStatus, ExternalData, SopCollection, Weights } from './types';

const DEFAULT_WEIGHTS: Weights = { need: 2, visionZero: 2, capital: 2, environmental: 2 };
const EMPTY_STATUS: DataStatus = { hin: 'loading', capital: 'loading', environmental: 'loading' };
const EMPTY_EXTERNAL: ExternalData = {
  hin: { type: 'FeatureCollection', features: [] },
  capital: { type: 'FeatureCollection', features: [] },
  environmental: { type: 'FeatureCollection', features: [] }
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function addSourceAndLayers(map: MapLibreMap, sop: SopCollection, external: ExternalData) {
  if (!map.getSource('sop')) map.addSource('sop', { type: 'geojson', data: sop });
  if (!map.getSource('hin')) map.addSource('hin', { type: 'geojson', data: external.hin });
  if (!map.getSource('capital')) map.addSource('capital', { type: 'geojson', data: external.capital });
  const environmental = {
    type: 'FeatureCollection' as const,
    features: external.environmental.features
  };
  if (!map.getSource('environmental')) map.addSource('environmental', { type: 'geojson', data: environmental });

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
  if (!map.getLayer('hin-lines')) map.addLayer({ id: 'hin-lines', type: 'line', source: 'hin', paint: { 'line-color': '#111', 'line-width': 4, 'line-opacity': 0.65 } });
  if (!map.getLayer('capital-lines')) map.addLayer({ id: 'capital-lines', type: 'line', source: 'capital', paint: { 'line-color': '#6a1b9a', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [2, 1] } });
  if (!map.getLayer('environmental-points')) map.addLayer({ id: 'environmental-points', type: 'circle', source: 'environmental', paint: { 'circle-radius': 5, 'circle-color': '#ff8f00', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
}




function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rankMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [baseSop, setBaseSop] = useState<SopCollection | null>(null);
  const [scoredSop, setScoredSop] = useState<SopCollection | null>(null);
  const [external, setExternal] = useState<ExternalData>(EMPTY_EXTERNAL);
  const [status, setStatus] = useState<DataStatus>(EMPTY_STATUS);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [visibility, setVisibility] = useState<LayerVisibility>({ sop: true, hin: true, capital: true, environmental: true });
  const [infoPanel, setInfoPanel] = useState<'how' | 'data' | null>(null);

  const top = useMemo(() => (scoredSop ? topSegments(scoredSop) : []), [scoredSop]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      center: [-75.1652, 39.9526],
      zoom: 11.2,
      minZoom: 9.5,
      maxZoom: 18,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sop, ext] = await Promise.all([loadSopData(), loadExternalData()]);
      if (cancelled) return;
      setBaseSop(sop);
      setExternal(ext);
      setStatus({ hin: 'ready', capital: 'ready', environmental: 'ready' });
      setScoredSop(recalculatePriority(sop, DEFAULT_WEIGHTS));
    }
    load().catch((error) => {
      console.error('Data initialization failed', error);
      if (!cancelled) setStatus({ hin: 'failed', capital: 'failed', environmental: 'failed' });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !scoredSop) return;
    const render = () => {
      addSourceAndLayers(map, scoredSop, external);
      (map.getSource('sop') as GeoJSONSource | undefined)?.setData(scoredSop);
      (map.getSource('hin') as GeoJSONSource | undefined)?.setData(external.hin);
      (map.getSource('capital') as GeoJSONSource | undefined)?.setData(external.capital);
      (map.getSource('environmental') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: external.environmental.features
      });
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
  }, [scoredSop, external, top, visibility.sop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const values: [keyof LayerVisibility, string[]][] = [
      ['sop', ['sop-lines']],
      ['hin', ['hin-lines']],
      ['capital', ['capital-lines']],
      ['environmental', ['environmental-points']]
    ];
    values.forEach(([key, layers]) => layers.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', visibility[key] ? 'visible' : 'none')));
    rankMarkersRef.current.forEach((marker) => { marker.getElement().style.display = visibility.sop ? 'flex' : 'none'; });
  }, [visibility, scoredSop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const click = (event: maplibregl.MapMouseEvent) => {
      if (!map.getLayer('sop-lines')) return;
      const hits = map.queryRenderedFeatures(event.point, { layers: ['sop-lines'] });
      const hit = hits[0];
      if (!hit?.properties) return;
      const p = hit.properties;
      const feature = scoredSop?.features.find((item) => item.properties.location_id === p.location_id);
      if (!feature) return;
      const html = `
        <div class="popup-content">
          <strong>Implementation opportunity</strong><br/>
          <b>Priority:</b> ${Math.round((feature.properties.priority_score ?? 0) * 100)}<br/>
          <b>SoP need:</b> ${Math.round((feature.properties.need_score ?? 0) * 100)}<br/>
          <b>Vision Zero:</b> ${(feature.properties.hin_signal ?? 0) > 0 ? 'Yes' : 'No'}<br/>
          <b>Capital project:</b> ${(feature.properties.capital_signal ?? 0) > 0
            ? `${escapeHtml(feature.properties.capital_project_name ?? 'Planned project')} (${feature.properties.capital_distance_m ?? 0} m)`
            : 'None detected within 50 m'}<br/>
          <b>Environmental context:</b> ${(feature.properties.environmental_signal ?? 0) > 0
            ? `${escapeHtml(feature.properties.environmental_site_type ?? 'EPA site')}: ${escapeHtml(feature.properties.environmental_site_name ?? 'Unnamed site')} (${feature.properties.environmental_distance_m ?? 0} m)`
            : 'None detected within 500 m'}<br/>
          <b>Next step:</b> ${recommendedAction(feature)}
        </div>`;
      new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(map);
    };
    map.on('click', click);
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('mouseenter', 'sop-lines', enter);
    map.on('mouseleave', 'sop-lines', leave);
    return () => {
      map.off('click', click);
      map.off('mouseenter', 'sop-lines', enter);
      map.off('mouseleave', 'sop-lines', leave);
    };
  }, [scoredSop]);

  const recalculate = () => {
    if (!baseSop) return;
    setScoredSop(recalculatePriority(baseSop, weights));
  };

  const reset = () => {
    setWeights(DEFAULT_WEIGHTS);
    if (baseSop) setScoredSop(recalculatePriority(baseSop, DEFAULT_WEIGHTS));
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
              <h2>How implementation priority works</h2>
              <p>State of Place identifies where street conditions need improvement. The other three signals identify policy, capital-program, and redevelopment context that may make action more timely.</p>
              <p>Adjust the weights from 0–4 and select <strong>Recalculate</strong>. Scores and the top-five list update on the map; they are screening priorities, not funding awards or final project recommendations.</p>
            </>
          ) : (
            <>
              <h2>Prototype data</h2>
              <ul>
                <li>State of Place street-segment indicators</li>
                <li>Philadelphia 2025 High Injury Network</li>
                <li>PennDOT transportation improvement projects</li>
                <li>EPA Brownfields and Superfund sites</li>
              </ul>
              <p>Spatial signals are precomputed locally using 25 m, 50 m, and 500 m prototype thresholds.</p>
            </>
          )}
        </section>
      )}
      <SliderWidget weights={weights} onWeights={setWeights} onRecalculate={recalculate} onReset={reset} top={top} status={status} />
      <div className="legend-container">
        <div className="legend-title">Implementation Priority</div>
        <div className="legend-gradient" />
        <div className="legend-labels"><span>Lower</span><span>Higher</span></div>
      </div>
      <LayerToggle visibility={visibility} onChange={setVisibility} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
