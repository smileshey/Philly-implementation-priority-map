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
import { recalculatePriority, topSegments } from './scoring';
import { segmentMidpoint } from './geometry';
import type { DataStatus, ExternalData, SopCollection, Weights } from './types';

const DEFAULT_WEIGHTS: Weights = { need: 2, visionZero: 2, capital: 2, environmental: 2 };
const EMPTY_STATUS: DataStatus = { hin: 'loading', capital: 'loading', environmental: 'loading' };
const EMPTY_EXTERNAL: ExternalData = {
  hin: { type: 'FeatureCollection', features: [] },
  capital: { type: 'FeatureCollection', features: [] },
  environmental: { type: 'FeatureCollection', features: [] }
};
const SOURCE_URLS = {
  hin: 'https://hub.arcgis.com/api/v3/datasets/7e416319784a463fa0d8b528d7ccf511_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1',
  capital: 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/26',
  environmental: 'https://geopub.epa.gov/ArcGIS/rest/services/EMEF/efpoints/MapServer'
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

function externalPopupHtml(layerId: string, properties: Record<string, unknown>): string {
  if (layerId.startsWith('capital-')) {
    const title = properties.PROJECT_TI || properties.STREET_NAM || 'Transportation project';
    return `<div class="popup-content feature-popup">
      <div class="popup-kicker capital">Capital project</div>
      <strong>${escapeHtml(title)}</strong>
      <dl>
        <dt>Project ID</dt><dd>${escapeHtml(properties.PROJECT_ID || 'Not reported')}</dd>
        <dt>Improvement</dt><dd>${escapeHtml(properties.PROJECT_IM || 'Not reported')}</dd>
        <dt>Description</dt><dd>${escapeHtml(properties.PUBLIC_NAR || 'Not reported')}</dd>
        <dt>Estimated construction</dt><dd>${formatCurrency(properties.EST_CONSTR)}</dd>
        <dt>Current cost</dt><dd>${formatCurrency(properties.CURRENT_CO)}</dd>
        <dt>Status</dt><dd>${properties.UNDER_CONS === 'Y' ? 'Under construction' : properties.IN_DEVELOP === 'Y' ? 'In development' : properties.FUTURE_DEV === 'Y' ? 'Future development' : 'Status not reported'}</dd>
      </dl>
    </div>`;
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
const effortSymbols = (effort: string | undefined) => effort === 'high' ? '🔨🔨🔨' : effort === 'medium' ? '🔨🔨' : '🔨';

function segmentPopupHtml(feature: SopCollection['features'][number]): string {
  const p = feature.properties;
  const hinEvidence = (p.hin_signal ?? 0) > 0
    ? `Matches the High Injury Network (${feet(p.hin_distance_ft)})`
    : 'No High Injury Network match within 82 ft';
  const capitalEvidence = (p.capital_signal ?? 0) > 0
    ? `${escapeHtml(p.capital_project_name ?? 'Planned project')} (${feet(p.capital_distance_ft)})`
    : 'No capital project detected within 164 ft';
  const brownfieldEvidence = (p.brownfield_signal ?? 0) > 0
    ? `${escapeHtml(p.brownfield_site_name ?? 'Unnamed Brownfield')} (${feet(p.brownfield_distance_ft)})`
    : 'None detected within 1,640 ft';
  const superfundEvidence = (p.superfund_signal ?? 0) > 0
    ? `${escapeHtml(p.superfund_site_name ?? 'Unnamed Superfund site')} (${feet(p.superfund_distance_ft)})`
    : 'None detected within 1,640 ft';

  return `<div class="popup-content segment-popup">
    <div class="popup-kicker recommendation">Prototype recommendation</div>
    <strong>${escapeHtml(p.recommendation_title ?? 'Implementation opportunity')}</strong>
    <div class="score-grid">
      <span>Need <b>${Math.round((p.need_score ?? 0) * 100)}</b></span>
      <span>Feasibility <b>${Math.round((p.feasibility_score ?? 0) * 100)}</b></span>
      <span>Priority <b>${Math.round((p.priority_score ?? 0) * 100)}</b></span>
    </div>
    <p>${escapeHtml(p.recommendation_action ?? 'Identify a viable implementation pathway.')}</p>
    <div class="recommendation-badges">
      <span>Impact: ${escapeHtml(p.recommendation_impact ?? '—')}</span>
      <span title="Implementation effort">${effortSymbols(p.implementation_effort)} ${escapeHtml(p.implementation_effort ?? '—')}</span>
      <span>Cost: ${escapeHtml(p.cost_band ?? '—')}</span>
      <span>Timing: ${escapeHtml(p.timing_band ?? '—')}</span>
    </div>
    <p class="recommendation-rationale">${escapeHtml(p.recommendation_rationale ?? '')}</p>
    <details>
      <summary>Evidence and sources</summary>
      <dl>
        <dt>SoP need</dt><dd>${Math.round((p.need_score ?? 0) * 100)} / 100 · practicum dataset</dd>
        <dt>Policy alignment</dt><dd>${hinEvidence} · <a href="${SOURCE_URLS.hin}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Capital readiness</dt><dd>${capitalEvidence} · <a href="${SOURCE_URLS.capital}" target="_blank" rel="noreferrer">source ↗</a></dd>
        <dt>Opportunity</dt><dd>${brownfieldEvidence} · <a href="${SOURCE_URLS.environmental}" target="_blank" rel="noreferrer">EPA source ↗</a></dd>
        <dt>Constraint</dt><dd>${superfundEvidence} · <a href="${SOURCE_URLS.environmental}" target="_blank" rel="noreferrer">EPA source ↗</a></dd>
      </dl>
    </details>
    <small>Rule-generated screening result (${escapeHtml(p.recommendation_method ?? 'prototype')}); verify before project decisions.</small>
  </div>`;
}

function addSourceAndLayers(map: MapLibreMap, sop: SopCollection, external: ExternalData) {
  if (!map.getSource('sop')) map.addSource('sop', { type: 'geojson', data: sop });
  if (!map.getSource('hin')) map.addSource('hin', { type: 'geojson', data: external.hin });
  if (!map.getSource('capital')) map.addSource('capital', { type: 'geojson', data: external.capital });
  const environmental = {
    type: 'FeatureCollection' as const,
    features: external.environmental.features
  };
  if (!map.getSource('environmental')) map.addSource('environmental', { type: 'geojson', data: environmental });
  if (!map.hasImage('capital-project-marker')) map.addImage('capital-project-marker', markerImage('C', '#6a1b9a', 'diamond'), { pixelRatio: 2 });
  if (!map.hasImage('brownfield-marker')) map.addImage('brownfield-marker', markerImage('B', '#ef8a00', 'circle'), { pixelRatio: 2 });
  if (!map.hasImage('superfund-marker')) map.addImage('superfund-marker', markerImage('S', '#b71c1c', 'triangle'), { pixelRatio: 2 });

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
  if (!map.getLayer('capital-icons')) map.addLayer({
    id: 'capital-icons', type: 'symbol', source: 'capital',
    layout: { 'symbol-placement': 'line-center', 'icon-image': 'capital-project-marker', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 1], 'icon-padding': 8, 'icon-allow-overlap': false }
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
      ['capital', ['capital-lines', 'capital-icons']],
      ['environmental', ['brownfield-icons', 'superfund-icons']]
    ];
    values.forEach(([key, layers]) => layers.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', visibility[key] ? 'visible' : 'none')));
    rankMarkersRef.current.forEach((marker) => { marker.getElement().style.display = visibility.sop ? 'flex' : 'none'; });
  }, [visibility, scoredSop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const click = (event: maplibregl.MapMouseEvent) => {
      const interactiveLayers = ['superfund-icons', 'brownfield-icons', 'capital-icons', 'capital-lines', 'sop-lines']
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
      const feature = scoredSop?.features.find((item) => item.properties.location_id === p.location_id);
      if (!feature) return;
      new maplibregl.Popup({ maxWidth: '430px' }).setLngLat(event.lngLat).setHTML(segmentPopupHtml(feature)).addTo(map);
    };
    const move = (event: maplibregl.MapMouseEvent) => {
      const layers = ['superfund-icons', 'brownfield-icons', 'capital-icons', 'capital-lines', 'sop-lines']
        .filter((id) => map.getLayer(id));
      map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : '';
    };
    map.on('click', click);
    map.on('mousemove', move);
    return () => {
      map.off('click', click);
      map.off('mousemove', move);
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
              <p><strong>Need</strong> comes from the inverse of the normalized State of Place score. <strong>Feasibility</strong> combines High Injury Network policy alignment, nearby capital-project readiness, Brownfield opportunity, and Superfund constraint.</p>
              <p>Priority combines need and feasibility using the selected 0–4 weights. Select <strong>Recalculate</strong> to update the scores and top-five list. Click a segment to see its rule-generated action, effort, cost, timing, and evidence.</p>
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
              <p>Spatial signals are precomputed using 82 ft (HIN), 164 ft (capital), and 1,640 ft (environmental) prototype thresholds. Brownfields are opportunities; Superfund sites are constraints.</p>
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
