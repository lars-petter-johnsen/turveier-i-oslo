// ---------- Map setup ----------

const map = L.map('map', { zoomControl: true }).setView([59.91, 10.75], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

const PALETTE = ['#2f6f6d', '#b5533c', '#3d4f91', '#7a8450', '#a35b8f'];
let colorIndex = 0;
function nextColor() {
  const c = PALETTE[colorIndex % PALETTE.length];
  colorIndex++;
  return c;
}

// track { id, name, color, layer, listEl }
const tracks = new Map();
let allBounds = null;

function extendBounds(layerBounds) {
  if (!layerBounds) return;
  allBounds = allBounds ? allBounds.extend(layerBounds) : L.latLngBounds(layerBounds.getSouthWest(), layerBounds.getNorthEast());
}

function fitToAll() {
  if (allBounds && allBounds.isValid()) {
    map.fitBounds(allBounds, { padding: [30, 30] });
  }
}

function formatDistance(meters) {
  if (!meters) return '—';
  return (meters / 1000).toFixed(1) + ' km';
}

function formatDuration(ms) {
  if (!ms) return '';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return mins + ' min';
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
}

function removeTrack(id) {
  const t = tracks.get(id);
  if (!t) return;
  map.removeLayer(t.layer);
  t.listEl.remove();
  tracks.delete(id);
  renderEmptyStateIfNeeded();
  updateToggleAllButton();
}

function renderEmptyStateIfNeeded() {
  const list = document.getElementById('route-list');
  if (tracks.size === 0 && !list.querySelector('.empty-note')) {
    const li = document.createElement('li');
    li.className = 'empty-note';
    li.textContent = 'No routes loaded yet.';
    list.appendChild(li);
  }
}

// Creates the sidebar row + checkbox/remove wiring for any track.
// Returns the created id and <li> element; caller fills in stats later.
function createListItem(name, color, removable) {
  const id = 'trk_' + Math.random().toString(36).slice(2, 9);
  const list = document.getElementById('route-list');
  const emptyNote = list.querySelector('.empty-note');
  if (emptyNote) emptyNote.remove();

  const li = document.createElement('li');
  li.className = 'route-item';
  li.innerHTML = `
    <span class="route-swatch" style="background:${color}"></span>
    <div class="route-info">
      <p class="route-name">${name}</p>
      <p class="route-stats" id="stats-${id}">loading…</p>
    </div>
    <div class="route-actions">
      <input type="checkbox" checked title="Toggle visibility" />
      ${removable ? '<button title="Remove">✕</button>' : ''}
    </div>
  `;
  list.appendChild(li);

  const checkbox = li.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      map.addLayer(tracks.get(id).layer);
    } else {
      map.removeLayer(tracks.get(id).layer);
    }
    updateToggleAllButton();
  });

  if (removable) {
    li.querySelector('button').addEventListener('click', () => removeTrack(id));
  }

  return { id, li };
}

// ---------- GPX tracks ----------

function addGpxTrack(source, name, color, removable) {
  const { id, li } = createListItem(name, color, removable);

  const layer = new L.GPX(source, {
    async: true,
    polyline_options: { color, weight: 4, opacity: 0.85 },
    markers: { startIcon: null, endIcon: null }
  });

  layer.on('loaded', (e) => {
    const g = e.target;
    extendBounds(g.get_bounds());
    fitToAll();
    const dist = g.get_distance ? g.get_distance() : null;
    const time = g.get_total_time ? g.get_total_time() : null;
    const statsEl = document.getElementById(`stats-${id}`);
    if (statsEl) {
      const parts = [formatDistance(dist)];
      const dur = formatDuration(time);
      if (dur) parts.push(dur);
      statsEl.textContent = parts.join(' · ');
    }
  });

  layer.on('error', () => {
    const statsEl = document.getElementById(`stats-${id}`);
    if (statsEl) statsEl.textContent = 'could not parse file';
  });

  layer.addTo(map);
  tracks.set(id, { id, name, color, layer, listEl: li });
}

// ---------- GeoJSON tracks (e.g. Overpass/OSM exports) ----------

function haversineMeters(coords) {
  // coords: array of [lon, lat, ele?]
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

function geometryLengthMeters(geometry) {
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return haversineMeters(geometry.coordinates);
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.reduce((sum, line) => sum + haversineMeters(line), 0);
  }
  return 0;
}

// Adds ONE feature (one trail) as its own toggleable sidebar entry + layer.
function addGeoJsonFeatureTrack(feature, fallbackName, color, removable) {
  const name =
    (feature.properties && (feature.properties.name || feature.properties.ref)) || fallbackName;
  const { id, li } = createListItem(name, color, removable);

  const layer = L.geoJSON(feature, {
    style: { color, weight: 4, opacity: 0.85 }
  });

  layer.addTo(map);
  const b = layer.getBounds();
  if (b.isValid()) {
    extendBounds(b);
    fitToAll();
  }

  const meters = geometryLengthMeters(feature.geometry);
  const statsEl = document.getElementById(`stats-${id}`);
  if (statsEl) statsEl.textContent = formatDistance(meters);

  tracks.set(id, { id, name, color, layer, listEl: li });
}

// Loads a GeoJSON FeatureCollection and adds each line feature as its own
// route — this is what an Overpass Turbo / OSM export typically contains
// (many named trail relations in a single file).
async function loadGeoJsonCollection(source, removable, baseName) {
  let data;
  if (typeof source === 'string' && (source.startsWith('http') || source.startsWith('routes/') || source.startsWith('blob:'))) {
    const res = await fetch(source);
    if (!res.ok) throw new Error('could not fetch ' + source);
    data = await res.json();
  } else {
    data = source; // already-parsed object
  }

  const features = data.type === 'FeatureCollection' ? data.features : [data];
  let count = 0;
  features.forEach((feature) => {
    if (!feature.geometry) return;
    if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') return;
    count++;
    addGeoJsonFeatureTrack(feature, `${baseName} ${count}`, nextColor(), removable);
  });
  if (count === 0) {
    console.warn('No LineString/MultiLineString features found in', baseName);
  }
}

// ---------- Load saved routes from manifest ----------

async function loadManifest() {
  try {
    const res = await fetch('routes/manifest.json');
    if (!res.ok) throw new Error('no manifest');
    const routes = await res.json();
    if (!routes.length) {
      renderEmptyStateIfNeeded();
      return;
    }
    routes.forEach((r) => {
      const path = `routes/${r.file}`;
      if (r.type === 'geojson' || r.file.toLowerCase().endsWith('.geojson') || r.file.toLowerCase().endsWith('.json')) {
        loadGeoJsonCollection(path, false, r.name).catch((err) => console.warn(err));
      } else {
        addGpxTrack(path, r.name, r.color || nextColor(), false);
      }
    });
  } catch (err) {
    renderEmptyStateIfNeeded();
    console.warn('Could not load routes/manifest.json', err);
  }
}

loadManifest();

// ---------- Collapsible route list (collapsed by default on mobile) ----------

const routesToggle = document.getElementById('routes-toggle');
const routeListEl = document.getElementById('route-list');

function setRoutesCollapsed(collapsed) {
  routeListEl.classList.toggle('is-collapsed', collapsed);
  routesToggle.setAttribute('aria-expanded', String(!collapsed));
}

setRoutesCollapsed(window.matchMedia('(max-width: 720px)').matches);

routesToggle.addEventListener('click', () => {
  const isCollapsed = routeListEl.classList.contains('is-collapsed');
  setRoutesCollapsed(!isCollapsed);
});

// ---------- Select all / deselect all toggle ----------

const toggleAllBtn = document.getElementById('deselect-all-btn');

function updateToggleAllButton() {
  const checkboxes = document.querySelectorAll('#route-list input[type="checkbox"]');
  const anyChecked = Array.from(checkboxes).some((cb) => cb.checked);
  toggleAllBtn.textContent = anyChecked ? 'Deselect all' : 'Select all';
}

updateToggleAllButton();

toggleAllBtn.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('#route-list input[type="checkbox"]');
  const anyChecked = Array.from(checkboxes).some((cb) => cb.checked);
  const targetState = !anyChecked; // if any are checked, this click deselects all; otherwise selects all
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked !== targetState) {
      checkbox.checked = targetState;
      checkbox.dispatchEvent(new Event('change'));
    }
  });
});

// ---------- Find my location ----------

let userLocationMarker = null;
let userAccuracyCircle = null;

const locateBtn = document.getElementById('locate-btn');

locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by this browser.');
    return;
  }

  locateBtn.classList.add('locating');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locateBtn.classList.remove('locating');
      const { latitude, longitude, accuracy } = pos.coords;

      if (userLocationMarker) map.removeLayer(userLocationMarker);
      if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

      userAccuracyCircle = L.circle([latitude, longitude], {
        radius: accuracy,
        color: '#c8843c',
        weight: 1,
        fillColor: '#c8843c',
        fillOpacity: 0.08
      }).addTo(map);

      userLocationMarker = L.circleMarker([latitude, longitude], {
        radius: 7,
        color: '#f6f3ea',
        weight: 2,
        fillColor: '#c8843c',
        fillOpacity: 1
      }).addTo(map);

      map.flyTo([latitude, longitude], 15);
    },
    (err) => {
      locateBtn.classList.remove('locating');
      alert('Could not get your location: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});