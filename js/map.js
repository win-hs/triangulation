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
}

/**
 * Draw station marker with label.
 */
function drawStation(lat, lon, label, color) {
  const icon = L.divIcon({
    className: '',
    html: `<div class="station-marker" style="background:${color}">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  L.marker([lat, lon], { icon }).addTo(overlayGroup);
}

/**
 * Draw bearing line from station toward azimuth, given length in km.
 * Adds intermediate points every ~2 km so the polyline approximates a
 * true straight line in lat/lon space, matching the planar intersection
 * calculation even at high zoom levels.
 */
function drawBearingLine(lat, lon, azimuth, lineLength, color) {
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
  const farLat = points[n][0];
  const farLon = points[n][1];
  L.polyline(points, {
    color,
    weight: 2,
    opacity: 0.85,
  }).addTo(overlayGroup);
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
    .bindPopup(`目標: ${lat.toFixed(5)}, ${lon.toFixed(5)}`)
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
 * Enable click-to-pick mode; calls callback({lat, lon}) once then disables.
 */
function enablePickMode(callback) {
  map.getContainer().style.cursor = 'crosshair';
  map.once('click', e => {
    map.getContainer().style.cursor = '';
    callback({ lat: e.latlng.lat, lon: e.latlng.lng });
  });
}
