// 無線電追蹤三角定位工具 — map.js — Leaflet map wrapper

'use strict';

const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac',
];

const BASE_LAYERS = {
  'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap contributors',
    maxZoom: 17,
  }),
  'Esri Imagery': L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri', maxZoom: 19 }
  ),
};

let map = null;
let layerControl = null;
let overlayGroup = null;  // holds all drawn features
let stationMarkers = new Map();  // stationId -> Leaflet marker
let stationLines = new Map();    // stationId -> Leaflet polyline

function initMap(containerId) {
  map = L.map(containerId, {
    center: [23.5, 121.0],
    zoom: 8,
    layers: [BASE_LAYERS['OpenStreetMap']],
  });

  layerControl = L.control.layers(BASE_LAYERS, {}, { position: 'topright' }).addTo(map);
  overlayGroup = L.layerGroup().addTo(map);
  return map;
}

/**
 * Color for station index (0-based).
 */
function stationColor(index) {
  return PALETTE[index % PALETTE.length];
}

/**
 * Clear all drawn overlays (markers, lines, target).
 */
function clearOverlays() {
  overlayGroup.clearLayers();
  stationMarkers.clear();
  stationLines.clear();
}

/**
 * Draw station marker with label. If stationId/onSelect given, the marker
 * becomes clickable: shows an info popup and notifies onSelect(stationId)
 * so the UI can highlight the matching row in the station list.
 */
function drawStation(lat, lon, label, color, stationId, infoHtml, onSelect) {
  const icon = L.divIcon({
    className: '',
    html: `<div class="station-marker" style="background:${color}">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = L.marker([lat, lon], { icon }).addTo(overlayGroup);
  if (infoHtml) marker.bindPopup(infoHtml);
  if (stationId != null) {
    stationMarkers.set(stationId, marker);
    marker.on('click', () => onSelect && onSelect(stationId));
  }
  return marker;
}

/**
 * Draw bearing line from station toward azimuth, given length in km.
 * Adds intermediate points every ~2 km so the polyline approximates a
 * true straight line in lat/lon space, matching the planar intersection
 * calculation even at high zoom levels.
 */
function drawBearingLine(lat, lon, azimuth, lineLength, color, stationId, infoHtml, onSelect) {
  const azRad = azimuth * Math.PI / 180;
  const sinAz = Math.sin(azRad);
  const cosAz = Math.cos(azRad);
  const stepKm = 2;
  const n = Math.max(2, Math.ceil(lineLength / stepKm));
  const stepDeg = lineLength / n / 111;
  const points = [];
  for (let i = 0; i <= n; i++) {
    const d = stepDeg * i;
    points.push([lat + d * cosAz, lon + d * sinAz]);
  }
  const line = L.polyline(points, {
    color,
    weight: 2,
    opacity: 0.85,
  }).addTo(overlayGroup);
  // Wider invisible line underneath makes the thin bearing line easier to click.
  L.polyline(points, { color, weight: 14, opacity: 0 })
    .addTo(overlayGroup)
    .on('click', () => onSelect && onSelect(stationId))
    .bindPopup(infoHtml || '');
  if (infoHtml) line.bindPopup(infoHtml);
  if (stationId != null) {
    stationLines.set(stationId, line);
    line.on('click', () => onSelect && onSelect(stationId));
  }
  return line;
}

/**
 * Open a station's popup and pan the map to it (used when the matching
 * row is selected from the right-hand list).
 */
function focusStation(stationId) {
  const marker = stationMarkers.get(stationId);
  if (marker) {
    map.panTo(marker.getLatLng());
    marker.openPopup();
  }
}

/**
 * Draw estimated target as a cross marker.
 */
function drawTarget(lat, lon) {
  const icon = L.divIcon({
    className: '',
    html: '<div class="target-marker">✕</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  L.marker([lat, lon], { icon })
    .bindPopup(`目標: ${lat.toFixed(6)}, ${lon.toFixed(6)}`)
    .addTo(overlayGroup);
}

/**
 * Draw pairwise intersection small dots.
 */
function drawIntersection(lat, lon) {
  L.circleMarker([lat, lon], {
    radius: 4,
    color: '#555',
    fillColor: '#aaa',
    fillOpacity: 0.6,
    weight: 1,
  }).addTo(overlayGroup);
}

/**
 * Fit map view to all visible points.
 */
function fitToPoints(points) {
  if (!points.length) return;
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
  map.fitBounds(bounds, { padding: [40, 40] });
}

/**
 * Center the map on a point at the given zoom.
 */
function centerMap(lat, lon, zoom) {
  map.setView([lat, lon], zoom);
}

/**
 * Enable click-to-pick mode; calls callback({lat, lon}) once then disables.
 */
function enablePickMode(callback) {
  map.getContainer().style.cursor = 'crosshair';
  map.once('click', e => {
    map.getContainer().style.cursor = '';
    callback({ lat: e.latlng.lat, lon: e.latlng.lng });
  });
}
