# Philadelphia State of Place — Implementation Priority Prototype

This is a deliberately small adaptation of the **Seattle Walkability Index** UI and workflow for the Georgia Tech OMSA / State of Place practicum.

## What is preserved from the Seattle app

- Full-screen interactive map
- White translucent top-left navbar
- Bottom-left slider card
- 0–4 preference sliders plus **Recalculate** and **Reset**
- Bottom-center map legend
- Bottom-right layer controls
- Top-five ranked locations displayed on the map
- Clickable map features with a compact popup

The major technical change is replacing ArcGIS Online / ArcGIS JS with **MapLibre GL JS**, so the prototype can be published as a normal open-source web app without an ArcGIS account.

## Prototype logic

Each State of Place street segment gets four signals:

1. **SoP Need** — `1 - SoPIndex8Norm / 100`
2. **Vision Zero** — segment overlaps the 2025 Philadelphia High Injury Network (25 m tolerance)
3. **Capital Projects** — segment overlaps a PennDOT Transportation Improvement Project (50 m tolerance)
4. **Environmental Context** — continuous proximity score to an EPA Brownfield or Superfund site within 500 m

The four slider values are weights. Clicking **Recalculate** recomputes a 0–100 implementation-priority score and updates the top five segments.

This is intentionally a prototype score, not a final causal or eligibility model. The next iteration should validate the distance thresholds and distinguish true funding eligibility from contextual proximity.

## Public sources

- State of Place: supplied practicum street-segment GeoJSON
- Philadelphia Vision Zero: 2025 High Injury Network
- PennDOT: Transportation Improvement Projects, line layer
- U.S. EPA: Brownfields and Superfund point layers
- Basemap: OpenStreetMap

The public sources are downloaded and spatially joined ahead of time. The browser loads local, precomputed GeoJSON and only handles rendering, weighting, ranking, and interaction. This keeps the map responsive and makes a team demo independent of third-party API latency.

## Run

```bash
nvm use
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

Node 20 or newer is required. On this machine, the included `.nvmrc` selects the compatible system-installed Node 20 instead of the older nvm default.

## Refresh public implementation data

To download the current Vision Zero, PennDOT, and EPA layers and rebuild the browser-ready files:

```bash
nvm use
npm run prepare:data
```

This is the only step that performs spatial proximity calculations. It writes the enriched segment and overlay layers to `public/data/`.

## Rebuild the trimmed SoP file

The original practicum GeoJSON carries hundreds of fields per segment. The browser version only needs a small subset:

```bash
python scripts/prepare_sop_data.py /path/to/septa_blocks.geojson public/data/sop_segments.geojson
```

The supplied file is reduced from roughly 46 MB to a much smaller client layer.

## Publishing / licensing note

The **application code** can be open-source. Before committing the supplied State of Place data to a public repository, confirm with State of Place that redistribution of that dataset is permitted. A safe deployment pattern is to keep the code public and inject the SoP GeoJSON during build/deployment if the data itself is restricted.

## Next development step

Once the UI and spatial joins are behaving correctly, replace the simple weighted score with structured implementation signals such as eligibility, timing, project status, estimated cost, and funding-program fit. That is where an LLM/RAG layer can later add value for extracting rules from funding and planning documents.

## v0.3 performance update

The initial prototypes performed spatial comparisons in the browser. Version 0.3 moves those calculations into `scripts/prepare_implementation_data.mjs` and serves the resulting signal fields directly. The 25 m / 50 m line proximity and 500 m environmental proximity calculations remain prototype-grade approximations using a local planar conversion appropriate for Philadelphia; validate those thresholds before treating the score as a production model.
