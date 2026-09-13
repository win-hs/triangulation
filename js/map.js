// 無線電追蹤三角定位工具 — map.js — Leaflet map wrapper

'use strict';

const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac',
];

// crossOrigin lets captureMapCanvas() read the tiles back out of the DOM —
// without it the snapshot canvas is tainted and cannot be exported as PNG.
// All three tile hosts send Access-Control-Allow-Origin: *.
// tiles-dimmable marks the street basemaps that invert cleanly in dark mode.
// Esri's imagery is left out: inverted aerial photography is unreadable.
const BASE_LAYERS = {
  'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    crossOrigin: 'anonymous',
    className: 'tiles-dimmable',
  }),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap contributors',
    maxZoom: 17,
    crossOrigin: 'anonymous',
    className: 'tiles-dimmable',
  }),
  'Esri Imagery': L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri', maxZoom: 19, crossOrigin: 'anonymous' }
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
 * nameHtml, when given, is drawn as a halo'd caption beside the marker;
 * like infoHtml it is pre-escaped by the caller.
 */
function drawStation(lat, lon, label, color, stationId, infoHtml, onSelect, nameHtml) {
  const icon = L.divIcon({
    className: '',
    html: `<div class="station-marker" style="background:${color}">${label}</div>` +
      (nameHtml ? `<span class="station-label">${nameHtml}</span>` : ''),
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
 * Draw estimated target as a cross marker. labelHtml (pre-escaped, like
 * infoHtml) names the group it belongs to — with several groups on the map
 * the crosses are otherwise indistinguishable.
 */
function drawTarget(lat, lon, labelHtml) {
  const icon = L.divIcon({
    className: '',
    html: '<div class="target-marker">✕</div>' +
      (labelHtml ? `<span class="station-label target-label">${labelHtml}</span>` : ''),
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  L.marker([lat, lon], { icon })
    .bindPopup(`${labelHtml ? labelHtml + ' ' : ''}目標: ${lat.toFixed(6)}, ${lon.toFixed(6)}`)
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
  // A single point has no extent — fitBounds would slam to max zoom.
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lon], 14);
    return;
  }
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
  map.fitBounds(bounds, { padding: [40, 40] });
}

/**
 * Add a "fit everything in view" button under the zoom control. getPoints()
 * supplies the stations and target to frame. The map auto-fits on every
 * recalculation, so this is the way back after panning or zooming by hand.
 */
function addFitControl(getPoints) {
  const Fit = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const a = L.DomUtil.create('a', 'fit-control', div);
      a.href = '#';
      a.title = '縮放到剛好看得見全部觀測點與目標';
      a.setAttribute('role', 'button');
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, 'click', L.DomEvent.stop);
      L.DomEvent.on(a, 'click', () => fitToPoints(getPoints()));
      return div;
    },
  });
  new Fit().addTo(map);
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

/**
 * Rasterise the current map view into a canvas: base tiles, then the vector
 * overlay (bearing lines, intersection dots), then the station/target
 * markers redrawn from their DOM positions. Used by the snapshot button.
 */
function captureMapCanvas() {
  const container = map.getContainer();
  const box = container.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width);
  canvas.height = Math.round(box.height);
  const ctx = canvas.getContext('2d');
  // Shows through wherever a tile has not loaded; follow the map's own backdrop
  // so it is not a light patch in dark mode.
  ctx.fillStyle = getComputedStyle(container).backgroundColor || '#e8e8e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tiles. Leaflet keeps one container per zoom level while zooming; paint
  // them in z-index order so the current level lands on top.
  const levels = Array.from(container.querySelectorAll('.leaflet-tile-container'))
    .sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));
  levels.forEach(level => {
    // A CSS filter applies to the rendered page, not to the image data, so the
    // dark-mode inversion has to be re-applied here. Reading it back off the
    // layer keeps the snapshot identical to what is on screen.
    const layer = level.closest('.tiles-dimmable');
    const filter = layer ? getComputedStyle(layer).filter : 'none';
    ctx.filter = filter && filter !== 'none' ? filter : 'none';
    level.querySelectorAll('img.leaflet-tile-loaded').forEach(img => {
      const r = img.getBoundingClientRect();
      try {
        ctx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height);
      } catch (e) { /* tile not decodable — leave the background showing */ }
    });
    ctx.filter = 'none';
  });

  // Bearing lines and intersection dots. Redrawn through Leaflet's own
  // projection rather than by rasterising the SVG pane: that pane carries its
  // own transform and viewBox, which get applied a second time when it is
  // serialised into a standalone image, shifting every line off the markers.
  overlayGroup.eachLayer(layer => {
    const o = layer.options;
    if (o.opacity === 0) return;  // the invisible wide click-target line
    ctx.globalAlpha = o.opacity == null ? 1 : o.opacity;
    ctx.lineWidth = o.weight;
    ctx.strokeStyle = o.color;
    if (layer instanceof L.CircleMarker) {
      const p = map.latLngToContainerPoint(layer.getLatLng());
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.radius, 0, Math.PI * 2);
      ctx.globalAlpha = o.fillOpacity;
      ctx.fillStyle = o.fillColor;
      ctx.fill();
      ctx.globalAlpha = o.opacity == null ? 1 : o.opacity;
      ctx.stroke();
    } else if (layer instanceof L.Polyline) {
      ctx.beginPath();
      layer.getLatLngs().forEach((ll, i) => {
        const p = map.latLngToContainerPoint(ll);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      });
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  // Markers are divIcons (HTML), so redraw them rather than rasterising DOM.
  container.querySelectorAll('.station-marker, .target-marker').forEach(el => {
    const r = el.getBoundingClientRect();
    const cx = r.left - box.left + r.width / 2;
    const cy = r.top - box.top + r.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (el.classList.contains('target-marker')) {
      const d = 8;
      ctx.lineCap = 'round';
      const halo = getComputedStyle(el).getPropertyValue('--label-halo').trim() || '#fff';
      [[halo, 6], ['#e00', 3]].forEach(([color, width]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
        ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
        ctx.stroke();
      });
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r.width / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = el.style.background || '#555';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px "Noto Sans TC", system-ui, sans-serif';
      ctx.fillText(el.textContent, cx, cy);
    }
  });

  // Station name captions, with the same white halo the map uses so they stay
  // readable over satellite imagery.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px "Noto Sans TC", system-ui, sans-serif';
  ctx.lineJoin = 'round';
  container.querySelectorAll('.station-label').forEach(el => {
    const r = el.getBoundingClientRect();
    const x = r.left - box.left;
    const y = r.top - box.top + r.height / 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = getComputedStyle(el).getPropertyValue('--label-halo').trim() || '#fff';
    ctx.strokeText(el.textContent, x, y);
    // Take the colour from the DOM so target captions stay distinct from
    // observation-point captions in the image too.
    ctx.fillStyle = getComputedStyle(el).color || '#202124';
    ctx.fillText(el.textContent, x, y);
  });

  return canvas;
}
