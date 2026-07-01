/**
 * map.js — Leaflet map with automatic geocoding for substation names.
 *
 * NEW:
 *   • updateMapAll() now renders every substation as a CLICKABLE marker.
 *     Register a handler with setMarkerSelectHandler(fn) and it fires with
 *     the substation name when a marker is clicked.
 *   • focusSubstation(name) pans + updates the info panel WITHOUT clearing
 *     the overview markers (so the "click a location" overview survives).
 */

let _map = null;
let _markerLayer = null;
const _geoCache = {};       // name → [lat, lng]
let _onMarkerSelect = null; // callback(name) when a marker is clicked

// Register the click→select callback (called from ui.js)
function setMarkerSelectHandler(fn) { _onMarkerSelect = fn; }

// ── 1. Known coordinates ─────────────────────────────────────────────────────
const SUBSTATION_COORDS = {
  "22/11 KV MALE SUBSTAION": [18.4500, 73.4500],
  "33/11 KV EMBASSY PARK":   [12.9595, 77.6974],
  "EMBASSY PARK":            [12.9595, 77.6974],
  "MALWADI SUB STN":         [18.5100, 73.8600],
};

// ── 2. Geocode via Nominatim ─────────────────────────────────────────────────
async function _geocode(name) {
  if (_geoCache[name]) return _geoCache[name];

  const queries = [
    `${name} substation India`,
    `${name} India`,
    name,
  ];

  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      if (data && data.length > 0) {
        const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        _geoCache[name] = coords;
        return coords;
      }
    } catch (_) { /* try next query */ }
  }
  return null;
}

// ── 3. Deterministic fallback inside India ───────────────────────────────────
function _fallbackCoords(name) {
  const hash = [...(name || "X")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return [
    18.0 + (hash % 14) + (hash % 7) * 0.1,
    73.0 + ((hash * 13) % 24) + (hash % 5) * 0.1,
  ];
}

// resolve coords from cache/known/geocode/fallback
async function _resolve(name) {
  let coords = SUBSTATION_COORDS[name] || _geoCache[name] || null;
  if (!coords) coords = await _geocode(name);
  if (!coords) coords = _fallbackCoords(name);
  _geoCache[name] = coords;
  return coords;
}

// ── Map initialisation ───────────────────────────────────────────────────────
function initMap() {
  if (_map) return;
  _map = L.map("map", { zoomControl: true }).setView([22.5, 82.3], 5);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap © CARTO",
    maxZoom: 19,
  }).addTo(_map);
  _markerLayer = L.layerGroup().addTo(_map);
}

function _makeIcon(color = "#34c8d4") {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 0 10px ${color};
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ── Update the location-info panel for one substation ────────────────────────
function _writePanel(name, coords) {
  const panel = document.getElementById("location-info");
  if (!panel) return;
  panel.innerHTML = `
    <div><strong>Substation</strong><span>${name}</span></div>
    <div><strong>Latitude</strong><span>${coords[0].toFixed(6)}</span></div>
    <div><strong>Longitude</strong><span>${coords[1].toFixed(6)}</span></div>
  `;
}

// ── Show ALL substations as clickable overview markers ───────────────────────
async function updateMapAll(substations) {
  if (!_map) initMap();
  _markerLayer.clearLayers();
  if (!substations || substations.length === 0) return;

  const bounds = [];

  await Promise.all(substations.map(async (name) => {
    const coords = await _resolve(name);

    L.marker(coords, { icon: _makeIcon() })
      .bindPopup(`
        <div style="color:#0b0f14">
          <b style="color:#0f8a94">${name}</b><br>
          <b>Latitude:</b> ${coords[0].toFixed(6)}<br>
          <b>Longitude:</b> ${coords[1].toFixed(6)}<br>
          <span style="font-size:11px;opacity:.7">Click marker to load analytics</span>
        </div>
      `)
      .on("click", () => { if (_onMarkerSelect) _onMarkerSelect(name); })
      .addTo(_markerLayer);

    bounds.push(coords);
  }));

  if (bounds.length === 1) {
    _map.setView(bounds[0], 10);
  } else if (bounds.length > 1) {
    _map.fitBounds(bounds, { padding: [40, 40] });
  }
}

// ── Focus one substation (pan + panel) WITHOUT clearing overview ─────────────
async function focusSubstation(name) {
  if (!_map) initMap();
  if (!name) return;
  const coords = await _resolve(name);
  _writePanel(name, coords);
  _map.setView(coords, 11);
}

// ── (Kept for compatibility) single-substation view that clears markers ──────
async function updateMap(substation) {
  if (!_map) initMap();
  _markerLayer.clearLayers();
  const label = substation || "All Substations";
  const coords = substation ? await _resolve(substation) : [22.5, 82.3];

  if (substation) _writePanel(label, coords);

  L.marker(coords, { icon: _makeIcon() })
    .bindPopup(`
      <div style="color:#0b0f14">
        <b style="color:#0f8a94">${label}</b><br>
        Latitude: ${coords[0].toFixed(6)}<br>
        Longitude: ${coords[1].toFixed(6)}
      </div>
    `)
    .addTo(_markerLayer)
    .openPopup();

  _map.setView(coords, substation ? 10 : 5);
}

document.addEventListener("DOMContentLoaded", initMap);
