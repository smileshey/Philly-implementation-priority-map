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

Each street segment has three primary signals:

1. **Street Need** — `1 - SoPIndex8Norm / 100`
2. **Safety Urgency** — whether the segment matches the 2025 Philadelphia High Injury Network within 82 ft
3. **Investment & Coordination Opportunity** — the stronger of a lifecycle-aware PennDOT project match within 164 ft or a capped Brownfield proximity lead within 1,640 ft

PennDOT projects contribute `0.6` when in development, `0.4` when marked for future development, `0.2` when status is unverified, and `0` when under construction or completed. Brownfield proximity contributes at most `0.2` until active redevelopment or partner interest is documented. Superfund proximity is displayed as a separate constraint and never changes priority automatically.

The presets are selection strategies rather than four versions of the same weighted average:

- **Need first** ranks Street Need directly.
- **Safety first** places HIN segments ahead of non-HIN segments, then considers need.
- **Coordination first** places opportunities scoring at least `0.4` ahead of proximity-only leads, then considers coordination and need.
- **Balanced** uses the three equal default weights. Manual slider changes use a custom weighted score.

An optional **Residential access** or **Industrial safety** zoning lens contributes 15% of the final score; the selected priority strategy contributes 85%. Citywide applies no zoning adjustment. Industrial, port, and airport contexts trigger a review flag rather than automatic exclusion. Zoning is treated as land-use context—not proof of engineering feasibility.

The Residential access prototype assigns context values of `1.0` to residential/mixed-use, `0.9` to commercial/mixed-use, `0.2–0.65` to industrial categories, and `0.2–0.8` to special-purpose categories. The Industrial safety lens assigns `1.0` to industrial/mixed-use, `0.6` to commercial, `0.5` to residential, and `0.5–0.9` to special-purpose categories. Mixed frontages use the sampled average. These are discussion assumptions, not adopted policy.

The map opens with only the SoP priority segments visible. The HIN, capital-project, and environmental overlays can be enabled from the layer control; HIN and capital lines are intentionally subdued so the SoP results remain the focal layer.

Each segment receives a transparent screening action and evidence trail. Treatment feasibility, implementation effort, cost, and timing remain **Not assessed** until a planner or engineer documents them in the segment review. Reviews are stored in that browser with `localStorage`; they can record coordination strategy, engagement, owner/contact, funding leads, treatment, constraints, professional estimates and sources, and reviewer/date. Funding selections are leads to investigate—not eligibility or funding commitments.

## Public sources

- State of Place: supplied practicum street-segment GeoJSON
- Philadelphia Vision Zero: 2025 High Injury Network
- PennDOT: Transportation Improvement Projects, line layer
- U.S. EPA: Brownfields and Superfund point layers
- City of Philadelphia: current Zoning Base District polygons
- Basemap: CARTO Positron using OpenStreetMap data

The public sources are downloaded and spatially joined ahead of time. The PennDOT service is queried by object ID in pages and grouped by project ID. Zoning is sampled on both sides of each street approximately 66 ft from the centerline; segments outside Philadelphia or without a match remain **Not assessed**. The browser loads local, precomputed GeoJSON and only handles rendering, ranking, review, and interaction.

## Run

```bash
nvm install
nvm use
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

Node 20 or newer is required. The included `.nvmrc` selects Node 20 consistently for local development and GitHub Actions.

## Deploy on GitHub Pages

Pushes to `main` automatically build and deploy the site through `.github/workflows/deploy-pages.yml`. The Pages build uses the repository base path and publishes `dist/` at:

```text
https://smileshey.github.io/Philly-implementation-priority-map/
```

Push to `main` or run the workflow manually from the **Actions** tab. The deployment workflow configures Pages automatically; if **Settings → Pages** only shows **Add domain**, no additional source selection is required.

Planner reviews remain in each viewer's browser storage; GitHub Pages does not provide a shared review database.

## Refresh public implementation data

To download the current Vision Zero, PennDOT, EPA, and Philadelphia zoning data and rebuild the browser-ready files:

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

`scripts/prepare_implementation_data.mjs` uses transparent, versioned screening rules (`prototype-screening-v2`) to select a primary follow-up action. HIN and influenceable capital-project matches favor safety or project-owner review; Brownfields produce low-confidence redevelopment leads; Superfund evidence adds a due-diligence warning. The rules do not invent a treatment, accessible funding, engineering feasibility, cost, effort, or schedule. Evidence and source links are exposed in each segment popup.

## v0.3 performance update

The initial prototypes performed spatial comparisons in the browser. Version 0.3 moves those calculations into `scripts/prepare_implementation_data.mjs` and serves the resulting signal fields directly. Geometry calculations remain metric internally and are converted to American units for stored/displayed distances: 82 ft HIN, 164 ft capital, 1,640 ft environmental, and approximately 66 ft zoning-side samples. The local planar calculations and context weights are prototype assumptions; validate them with the sponsor and qualified planning/engineering staff before production use.
