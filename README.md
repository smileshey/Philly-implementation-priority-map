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
- Distinct, clickable capital-project and environmental-site symbols

The major technical change is replacing ArcGIS Online / ArcGIS JS with **MapLibre GL JS**, so the prototype can be published as a normal open-source web app without an ArcGIS account.

## Prototype logic

Each State of Place street segment gets a need score and a distinct feasibility score:

1. **SoP Need** — `1 - SoPIndex8Norm / 100`
2. **Policy Alignment** — segment overlaps the 2025 Philadelphia High Injury Network (82 ft tolerance)
3. **Capital Readiness** — segment overlaps a PennDOT Transportation Improvement Project (164 ft tolerance)
4. **Environmental Fit** — Brownfield proximity is an opportunity and Superfund proximity is a constraint within 1,640 ft

The three implementation-context signals first produce a 0–100 **feasibility** score. The selected need and feasibility weights then produce the 0–100 **priority** score. Clicking **Recalculate** updates that priority and the top-five segments.

Each segment also receives a deterministic prototype recommendation with a type, action, rationale, impact, implementation effort, cost band, timing band, and evidence codes. These rules turn the sponsor's suggested 1–3 hammer / 1–3 dollar / timing concept into a discussion-ready interface. They are screening aids—not final engineering recommendations, funding eligibility determinations, or causal estimates.

## Public sources

- State of Place: supplied practicum street-segment GeoJSON
- Philadelphia Vision Zero: 2025 High Injury Network
- PennDOT: Transportation Improvement Projects, line layer
- U.S. EPA: Brownfields and Superfund point layers
- Basemap: OpenStreetMap

The public sources are downloaded and spatially joined ahead of time. The PennDOT ArcGIS service is queried by object ID in pages and then grouped by project ID, avoiding the service's per-request record limit. The browser loads local, precomputed GeoJSON and only handles rendering, weighting, ranking, and interaction. This keeps the map responsive and makes a team demo independent of third-party API latency.

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

The supplied file is reduced from roughly 46 MB to a much smaller client layer. During implementation-data preparation, the script checks that segment IDs are unique, geometries are lines, and the six retained normalized fields contain numeric values from 0–100. This is a schema/range check; the project still needs the official State of Place codebook to validate each field's substantive meaning.

## Publishing / licensing note

The **application code** can be open-source. Before committing the supplied State of Place data to a public repository, confirm with State of Place that redistribution of that dataset is permitted. A safe deployment pattern is to keep the code public and inject the SoP GeoJSON during build/deployment if the data itself is restricted.

## Recommendation method

`scripts/prepare_implementation_data.mjs` uses transparent, versioned rules (`prototype-rule-v1`) to select a primary action. HIN and capital-project matches favor safety/project coordination; a Brownfield match favors redevelopment coordination; a Superfund match adds due diligence and raises the estimated effort, cost, and timing. A segment with no implementation trigger receives either a feasibility-study or monitoring recommendation based on need. All underlying evidence and source links are exposed in the segment popup.

## v0.3 performance update

The initial prototypes performed spatial comparisons in the browser. Version 0.3 moves those calculations into `scripts/prepare_implementation_data.mjs` and serves the resulting signal fields directly. Geometry calculations remain metric internally and are converted to American units for stored/displayed distances: 82 ft HIN, 164 ft capital, and 1,640 ft environmental thresholds. The local planar calculations are prototype-grade approximations appropriate for Philadelphia; validate the thresholds before treating the score as a production model.
