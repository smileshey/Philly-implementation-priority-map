import React from 'react';

export type LayerVisibility = {
  sop: boolean;
  hin: boolean;
  capital: boolean;
  environmental: boolean;
  zoning: boolean;
  completeStreets: boolean;
  development: boolean;
  pwd: boolean;
  transit: boolean;
  crashes: boolean;
  bike: boolean;
};

export default function LayerToggle({
  visibility,
  onChange
}: {
  visibility: LayerVisibility;
  onChange: (visibility: LayerVisibility) => void;
}) {
  const toggle = (key: keyof LayerVisibility) => onChange({ ...visibility, [key]: !visibility[key] });
  return (
    <div id="layerToggleDiv">
      <div className="layer-toggle-card">
        <strong>Layers</strong>
        <label><input type="checkbox" checked={visibility.sop} onChange={() => toggle('sop')} /><span className="layer-swatch sop" /> SoP segments</label>
        <label><input type="checkbox" checked={visibility.hin} onChange={() => toggle('hin')} /><span className="layer-swatch hin" /> Vision Zero HIN</label>
        <label><input type="checkbox" checked={visibility.capital} onChange={() => toggle('capital')} /><span className="layer-icon capital">C</span> Capital projects</label>
        <label><input type="checkbox" checked={visibility.environmental} onChange={() => toggle('environmental')} /><span className="layer-icon brownfield">B</span><span className="layer-icon superfund">S</span> Brownfield / Superfund</label>
        <details className="context-layer-group">
          <summary>Planning Support Layers</summary>
          <small className="context-layer-note">Supporting evidence; only an optional zoning lens can affect the score.</small>
          <label><input type="checkbox" checked={visibility.zoning} onChange={() => toggle('zoning')} /><span className="layer-swatch zoning" /> Zoning context</label>
          <label><input type="checkbox" checked={visibility.completeStreets} onChange={() => toggle('completeStreets')} /><span className="layer-swatch complete-streets" /> Complete Streets</label>
          <label><input type="checkbox" checked={visibility.development} onChange={() => toggle('development')} /><span className="layer-icon development">D</span> Development permits</label>
          <label><input type="checkbox" checked={visibility.pwd} onChange={() => toggle('pwd')} /><span className="layer-icon pwd">W</span> PWD projects</label>
          <label><input type="checkbox" checked={visibility.transit} onChange={() => toggle('transit')} /><span className="layer-icon transit">T</span> SEPTA stops</label>
          <label><input type="checkbox" checked={visibility.crashes} onChange={() => toggle('crashes')} /><span className="layer-icon crashes">!</span> Crash evidence</label>
          <label><input type="checkbox" checked={visibility.bike} onChange={() => toggle('bike')} /><span className="layer-swatch bike" /> Bike network</label>
        </details>
      </div>
    </div>
  );
}
