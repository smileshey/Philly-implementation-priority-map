import React from 'react';

export default function BasicMenu({
  onHowItWorks,
  onData
}: {
  onHowItWorks: () => void;
  onData: () => void;
}) {
  return (
    <div className="navbar-container desktop">
      <div className="navbar-title desktop">Implementation in Philadelphia</div>
      <div className="navbar-links-container">
        <button className="navbar-link desktop" type="button" onClick={onHowItWorks}>How it works</button>
        <button className="navbar-link desktop" type="button" onClick={onData}>Data</button>
        <a
          className="navbar-link desktop"
          href="https://github.com/smileshey/Philly-implementation-priority-map"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
