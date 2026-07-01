/**
 * map.js — Leaflet map with automatic geocoding for substation names.
 *
 * Priority order for coordinates:
 *   1. SUBSTATION_COORDS lookup below  (add your real lat/lng here)
 *   2. Nominatim (OpenStreetMap) geocoder — fires automatically for unknowns
 *   3. Deterministic fallback inside India if geocoding fails
 */

let _map = null;
let _markerLayer = null;
const _geoCache = {};   // name → [lat, lng]

// ── 1. Known coordinates ─────────────────────────────────────────────────────
// Add entries here matching your exact substation names (case-sensitive).
// Example:
//   "Shahdara 220kV":  [28.6692, 77.2942],
//   "Mundka 66kV":     [28.6815, 76.9986],
const SUBSTATION_COORDS = {// ── 1. Known coordinates ─────────────────────────────────────────────────────
  // Pune district / Mulshi area (verify with actual GIS coordinates)
  "22/11 KV MALE SUBSTAION": [18.4500, 73.4500],

  // Embassy business park region
  "33/11 KV EMBASSY PARK": [12.9595, 77.6974],

  // Alias used by dashboard
  "EMBASSY PARK": [12.9595, 77.6974],

  // Malwadi substation
  "MALWADI SUB STN": [18.5100, 73.8600]
};

// ── 2. Geocode via Nominatim ─────────────────────────────────────────────────
async function _geocode(name) {
  if (_geoCache[name]) return _geoCache[name];

  // Try the raw name first, then append "substation India" for better hits
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
    } catch (_) { /* network error — try next query */ }
  }
  return null;
}

// ── 3. Deterministic fallback inside India ───────────────────────────────────
function _fallbackCoords(name) {
  const hash = [...(name || "X")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return [
    18.0 + (hash % 14) + (hash % 7) * 0.1,    // lat  18–32 N  (India range)
    73.0 + ((hash * 13) % 24) + (hash % 5) * 0.1, // lng 73–97 E
  ];
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

function _makeIcon(color = "#00e5d4") {
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

// ── Public: update map for a given substation ────────────────────────────────

async function updateMap(substation) {
  console.log("updateMap called with:", substation);

  if (!_map) initMap();

  _markerLayer.clearLayers();

  const label = substation || "All Substations";

  // 1. Try known coordinates
  let coords = SUBSTATION_COORDS[substation] || null;

  // 2. Try geocoding if not found
  if (!coords && substation) {
    const provisional = _fallbackCoords(substation);

    L.marker(provisional, { icon: _makeIcon("#888") })
      .bindPopup(
        `<b style="color:#aaa">${label}</b><br><i>Locating...</i>`
      )
      .addTo(_markerLayer);

    _map.setView(provisional, 6);

    coords = await _geocode(substation);

    _markerLayer.clearLayers();
  }

  // 3. Final fallback
  if (!coords) {
    coords = substation
      ? _fallbackCoords(substation)
      : [22.5, 82.3];
  }

  // Cache coordinates
  _geoCache[substation || "DEFAULT"] = coords;
  console.log("===== LOCATION PANEL DEBUG =====");

console.log(
    "loc-name:",
    document.getElementById("loc-name")
);

console.log(
    "loc-lat:",
    document.getElementById("loc-lat")
);

console.log(
    "loc-lng:",
    document.getElementById("loc-lng")
);

  console.log("MAP UPDATE:", label, coords);

  // Update location information panel
  const panel = document.getElementById("location-info");

  if (panel) {
    panel.innerHTML = `
      <div>
        <strong>Substation</strong>
        <span>${label}</span>
      </div>

      <div>
        <strong>Latitude</strong>
        <span>${coords[0].toFixed(6)}</span>
      </div>

      <div>
        <strong>Longitude</strong>
        <span>${coords[1].toFixed(6)}</span>
      </div>
    `;
  } else {
    console.warn("location-info panel not found");
  }

  // Create marker
  L.marker(coords, { icon: _makeIcon() })
    .bindPopup(`
      <div>
        <b style="color:#00e5d4">${label}</b><br>
        Latitude: ${coords[0].toFixed(6)}<br>
        Longitude: ${coords[1].toFixed(6)}
      </div>
    `)
    .addTo(_markerLayer)
    .openPopup();

  _map.setView(coords, substation ? 10 : 5);
}

// ── Show all substations at once ─────────────────────────────────────────────
async function updateMapAll(substations) {
  if (!_map) initMap();
  _markerLayer.clearLayers();
  if (!substations || substations.length === 0) return;

  const bounds = [];

  await Promise.all(substations.map(async (name) => {
    let coords = SUBSTATION_COORDS[name] || _geoCache[name] || null;
    if (!coords) {
      coords = await _geocode(name);
      if (!coords) coords = _fallbackCoords(name);
      _geoCache[name] = coords;
    }
    L.marker(coords, { icon: _makeIcon() })
      .bindPopup(`
      <div style="color:white">
      <b style="color:#00e5d4">${name}</b><br>
      <b>Latitude:</b> ${coords[0].toFixed(6)}<br>
      <b>Longitude:</b> ${coords[1].toFixed(6)}
      </div>
      `)
      .addTo(_markerLayer);
    bounds.push(coords);
  }));

  if (bounds.length === 1) {
    _map.setView(bounds[0], 10);
  } else if (bounds.length > 1) {
    _map.fitBounds(bounds, { padding: [40, 40] });
  }
}

document.addEventListener("DOMContentLoaded", initMap);