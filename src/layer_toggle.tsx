import React from 'react';

export type LayerVisibility = {
  sop: boolean;
  hin: boolean;
  capital: boolean;
  environmental: boolean;
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
        <label><input type="checkbox" checked={visibility.sop} onChange={() => toggle('sop')} /> SoP segments</label>
        <label><input type="checkbox" checked={visibility.hin} onChange={() => toggle('hin')} /> Vision Zero HIN</label>
        <label><input type="checkbox" checked={visibility.capital} onChange={() => toggle('capital')} /> Capital projects</label>
        <label><input type="checkbox" checked={visibility.environmental} onChange={() => toggle('environmental')} /> Brownfield / Superfund</label>
      </div>
    </div>
  );
}
