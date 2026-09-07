# Turveier i Oslo

A tiny static site that shows Oslo's marked walking trails (turveier) on a map. No backend, no build step — plain HTML/CSS/JS, so it deploys straight to GitHub Pages.

It works with any GPX or GeoJSON track data, so it's easy to repurpose for routes elsewhere too — see [Add a permanent route](#add-a-permanent-route-to-the-site) below.

**Stack:** [Leaflet.js](https://leafletjs.com/) + OpenStreetMap tiles for the map, the [leaflet-gpx](https://github.com/mpetazzoni/leaflet-gpx) plugin to parse `.gpx` files, and Leaflet's built-in `L.geoJSON` for `.geojson` files (handy for trail exports from [Overpass Turbo](https://overpass-turbo.eu/)).

## Features

- Loads all routes listed in `routes/manifest.json` on page load, each as its own entry in the sidebar.
- Per-route checkbox to show/hide it on the map, plus a "Select all / Deselect all" toggle.
- Distance (and duration, for GPX tracks with timestamps) shown under each route name.
- "Find my location" button (bottom-right of the map) using the browser's geolocation API.
- Sidebar route list is collapsible, and starts collapsed on narrow/mobile screens.

## Run it locally

Because the page fetches `routes/manifest.json`, opening `index.html` directly (`file://`) will fail in most browsers due to CORS. Serve it locally instead, from the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Add a permanent route to the site

1. Drop your `.gpx` or `.geojson` file into the `routes/` folder.
2. Add an entry to `routes/manifest.json`:

```json
{
  "name": "Trollstigen Descent",
  "file": "trollstigen.gpx",
  "color": "#b5533c"
}
```

For a GeoJSON file, add `"type": "geojson"` (or just use a `.geojson`/`.json` file extension — either is enough for it to be auto-detected). A GeoJSON `FeatureCollection` with multiple line features (e.g. an Overpass export with many named trails) is split automatically into one sidebar entry per trail.

`color` is optional — omit it and one will be picked automatically. That's it, no code changes needed.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (as the repo root, or in a `/docs` folder — your choice).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick the branch and folder (`/root` or `/docs`) where these files live, save.
4. GitHub gives you a URL like `https://<username>.github.io/<repo>/` within a minute or two.

No further config needed — everything (Leaflet, the GPX plugin) loads from CDN, and the site itself is 100% static.

## Project layout

```
index.html        Page structure (sidebar + map)
css/style.css      Styling
js/app.js          Map setup, route loading/rendering, sidebar interactions
routes/manifest.json   List of routes shown on load
routes/*.gpx, *.geojson   The actual route/track files
```

## Ideas if you want to extend it later

- **Elevation profile**: `leaflet-gpx` already exposes elevation data per point (`layer.get_elevation_gain()`, etc.) — a small chart under the map is a natural next step (e.g. with Chart.js).
- **Route categories/filters**: add a `tags` field to each manifest entry and filter the sidebar list.
- **Custom basemap**: swap the OpenStreetMap tile URL for something like OpenTopoMap (`{s}.tile.opentopomap.org`) if you want contour lines for hiking routes.
- **Page view analytics**: none configured yet — a privacy-friendly option like [GoatCounter](https://www.goatcounter.com/) or [Plausible](https://plausible.io/) can be added with a single script tag.
