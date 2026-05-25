// main.js — UI state and event handling

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  stations: [],
  nextId: 1,
  northMode: 'true',        // 'true' | 'magnetic'
  coordOrder: 'latlon',     // 'latlon' | 'lonlat'
  lineAlgorithm: 'planar',  // 'planar' | 'geodesic'
  estimator: 'centroid',    // 'mle' | 'centroid'
  date: todayISO(),
  showAllAngles: false,
  showHelp: false,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const stationListEl    = document.getElementById('station-list');
const errorBannerEl    = document.getElementById('error-banner');
const resultTargetEl   = document.getElementById('result-target');
const resultAngleEl    = document.getElementById('result-min-angle');
const allAnglesEl      = document.getElementById('all-angles');
const allAnglesBodyEl  = document.getElementById('all-angles-body');
const dateInputEl      = document.getElementById('date-input');
const dateLabelEl      = document.getElementById('date-label');
const declEl           = document.getElementById('declination-display');

const btnNorthTrue     = document.getElementById('btn-north-true');
const btnNorthMag      = document.getElementById('btn-north-magnetic');
const btnCoordLatLon   = document.getElementById('btn-coord-latlon');
const btnCoordLonLat   = document.getElementById('btn-coord-lonlat');
const btnLinePlanar    = document.getElementById('btn-line-planar');
const btnLineGeodesic  = document.getElementById('btn-line-geodesic');
const btnEstMle        = document.getElementById('btn-est-mle');
const btnEstCentroid   = document.getElementById('btn-est-centroid');

const azPopupEl        = document.getElementById('az-popup');
const azPopupCoordsEl  = document.getElementById('az-popup-coords');
const azPopupInputEl   = document.getElementById('az-popup-input');
const azPopupConfirm   = document.getElementById('az-popup-confirm');
const azPopupCancel    = document.getElementById('az-popup-cancel');

// ── Init ───────────────────────────────────────────────────────────────────
initMap('map');
dateInputEl.value = state.date;
updateNorthUI();
updateCoordUI();
updateAlgoUI();

// ── North toggle ───────────────────────────────────────────────────────────
function updateNorthUI() {
  const mag = state.northMode === 'magnetic';
  btnNorthTrue.classList.toggle('active', !mag);
  btnNorthMag.classList.toggle('active', mag);
  dateLabelEl.hidden = !mag;
  updateDeclinationDisplay();
}

function updateDeclinationDisplay() {
  if (state.northMode !== 'magnetic') {
    declEl.hidden = true;
    return;
  }
  // Use average of station positions, or Taiwan center if no stations
  let lat = 23.97, lon = 121.0;
  if (state.stations.length > 0) {
    lat = state.stations.reduce((s, st) => s + st.lat, 0) / state.stations.length;
    lon = state.stations.reduce((s, st) => s + st.lon, 0) / state.stations.length;
  }
  const date = state.date ? new Date(state.date) : new Date();
  const { dec } = geoMag(lat, lon, 0, date);
  const sign = dec >= 0 ? '+' : '';
  declEl.textContent = `偏角 ${sign}${dec.toFixed(2)}°`;
  declEl.className = 'inline-note' + (Math.abs(dec) > 1 ? ' highlight' : '');
  declEl.hidden = false;
}

btnNorthTrue.addEventListener('click', () => {
  if (state.northMode === 'true') return;
  state.northMode = 'true';
  updateNorthUI();
  recalculate();
});

btnNorthMag.addEventListener('click', () => {
  if (state.northMode === 'magnetic') return;
  state.northMode = 'magnetic';
  updateNorthUI();
  recalculate();
});

dateInputEl.addEventListener('change', e => {
  state.date = e.target.value;
  updateDeclinationDisplay();
  recalculate();
});

// ── Coord order toggle ─────────────────────────────────────────────────────
function updateCoordUI() {
  const isLatLon = state.coordOrder === 'latlon';
  btnCoordLatLon.classList.toggle('active', isLatLon);
  btnCoordLonLat.classList.toggle('active', !isLatLon);
  // Update manual form placeholder
  const inputLatLon = document.getElementById('input-latlon');
  if (inputLatLon) {
    inputLatLon.placeholder = isLatLon ? '例：24.0, 120.5' : '例：120.5, 24.0';
  }
}

btnCoordLatLon.addEventListener('click', () => {
  if (state.coordOrder === 'latlon') return;
  state.coordOrder = 'latlon';
  updateCoordUI();
  renderStationList(); // re-display values in new order
});

btnCoordLonLat.addEventListener('click', () => {
  if (state.coordOrder === 'lonlat') return;
  state.coordOrder = 'lonlat';
  updateCoordUI();
  renderStationList();
});

// ── Algorithm toggles ──────────────────────────────────────────────────────
function updateAlgoUI() {
  btnLinePlanar.classList.toggle('active', state.lineAlgorithm === 'planar');
  btnLineGeodesic.classList.toggle('active', state.lineAlgorithm === 'geodesic');
  btnEstMle.classList.toggle('active', state.estimator === 'mle');
  btnEstCentroid.classList.toggle('active', state.estimator === 'centroid');
}

btnLinePlanar.addEventListener('click', () => {
  if (state.lineAlgorithm === 'planar') return;
  state.lineAlgorithm = 'planar';
  updateAlgoUI();
  recalculate();
});

btnLineGeodesic.addEventListener('click', () => {
  if (state.lineAlgorithm === 'geodesic') return;
  state.lineAlgorithm = 'geodesic';
  updateAlgoUI();
  recalculate();
});

btnEstMle.addEventListener('click', () => {
  if (state.estimator === 'mle') return;
  state.estimator = 'mle';
  updateAlgoUI();
  recalculate();
});

btnEstCentroid.addEventListener('click', () => {
  if (state.estimator === 'centroid') return;
  state.estimator = 'centroid';
  updateAlgoUI();
  recalculate();
});

// ── Angles toggle ──────────────────────────────────────────────────────────
document.getElementById('toggle-angles').addEventListener('click', () => {
  state.showAllAngles = !state.showAllAngles;
  allAnglesEl.hidden = !state.showAllAngles;
  document.getElementById('toggle-angles').textContent =
    state.showAllAngles ? '▲ 收合全部夾角' : '▼ 展開全部夾角';
});

// ── Help toggle ────────────────────────────────────────────────────────────
document.getElementById('help-toggle').addEventListener('click', () => {
  state.showHelp = !state.showHelp;
  document.getElementById('help-body').hidden = !state.showHelp;
  document.getElementById('help-toggle').textContent =
    state.showHelp ? '❓ 使用說明 ▼' : '❓ 使用說明 ▶';
});

// ── Lat/lon parsing ────────────────────────────────────────────────────────
function parseLatLon(str) {
  const parts = str.trim().split(/[,，\s　]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const a = parseFloat(parts[0]);
  const b = parseFloat(parts[1]);
  if (isNaN(a) || isNaN(b)) return null;
  // Interpret based on current coordOrder
  const lat = state.coordOrder === 'lonlat' ? b : a;
  const lon = state.coordOrder === 'lonlat' ? a : b;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function formatLatLon(lat, lon) {
  const a = state.coordOrder === 'lonlat' ? lon : lat;
  const b = state.coordOrder === 'lonlat' ? lat : lon;
  return `${a}, ${b}`;
}

// ── Station management ─────────────────────────────────────────────────────
function addStation(lat, lon, azimuth) {
  const id = state.nextId++;
  state.stations.push({ id, lat, lon, azimuth });
  renderStationList();
  updateDeclinationDisplay();
  recalculate();
}

function deleteStation(id) {
  state.stations = state.stations.filter(s => s.id !== id);
  renderStationList();
  updateDeclinationDisplay();
  recalculate();
}

function updateStationLatLon(id, str) {
  const parsed = parseLatLon(str);
  if (!parsed) return;
  const s = state.stations.find(s => s.id === id);
  if (!s) return;
  s.lat = parsed.lat;
  s.lon = parsed.lon;
  updateDeclinationDisplay();
  recalculate();
}

function updateStationAzimuth(id, value) {
  const s = state.stations.find(s => s.id === id);
  if (!s) return;
  s.azimuth = parseFloat(value);
  recalculate();
}

function renderStationList() {
  const coordHint = state.coordOrder === 'lonlat' ? '經,緯' : '緯,經';
  stationListEl.innerHTML = '';
  state.stations.forEach((s, idx) => {
    const color = stationColor(idx);
    const row = document.createElement('div');
    row.className = 'station-row';
    row.innerHTML = `
      <span class="station-badge" style="background:${color}">#${s.id}</span>
      <input type="text" class="latlon-input"
             value="${formatLatLon(s.lat, s.lon)}"
             placeholder="${coordHint}"
             data-id="${s.id}" data-role="latlon">
      <span class="az-label">°</span>
      <input type="number" class="az-input" step="0.1" min="0" max="360"
             value="${s.azimuth}"
             data-id="${s.id}" data-role="azimuth">
      <button class="btn-delete" data-id="${s.id}">✕</button>
    `;
    stationListEl.appendChild(row);
  });

  stationListEl.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', e => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.dataset.role === 'latlon') {
        updateStationLatLon(id, e.target.value);
      } else {
        updateStationAzimuth(id, e.target.value);
      }
    });
  });

  stationListEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      deleteStation(parseInt(e.target.dataset.id));
    });
  });
}

// ── Manual input form ──────────────────────────────────────────────────────
document.getElementById('btn-add-manual').addEventListener('click', () => {
  const form = document.getElementById('manual-form');
  form.hidden = !form.hidden;
  if (!form.hidden) {
    updateCoordUI(); // refresh placeholder
    document.getElementById('input-latlon').focus();
  }
});

document.getElementById('btn-manual-cancel').addEventListener('click', () => {
  document.getElementById('manual-form').hidden = true;
});

document.getElementById('btn-manual-confirm').addEventListener('click', confirmManual);

document.getElementById('input-az').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmManual();
});

function confirmManual() {
  const latlonStr = document.getElementById('input-latlon').value;
  const az = parseFloat(document.getElementById('input-az').value);
  const parsed = parseLatLon(latlonStr);

  if (!parsed) {
    const ex = state.coordOrder === 'lonlat' ? '120.5, 24.0' : '24.0, 120.5';
    showError(`請輸入有效座標，例：${ex}`);
    return;
  }
  if (isNaN(az) || az < 0 || az > 360) {
    showError('請輸入有效的方位角（0–360°）');
    return;
  }

  hideError();
  addStation(parsed.lat, parsed.lon, az);
  document.getElementById('manual-form').hidden = true;
  document.getElementById('input-latlon').value = '';
  document.getElementById('input-az').value = '';
}

// ── Map-click flow with inline popup ──────────────────────────────────────
let _pendingPick = null;

document.getElementById('btn-add-map').addEventListener('click', () => {
  enablePickMode(({ lat, lon }) => {
    _pendingPick = { lat, lon };
    azPopupCoordsEl.textContent = formatLatLon(lat, lon);
    azPopupInputEl.value = '';
    azPopupInputEl.style.borderColor = '';
    azPopupEl.hidden = false;
    azPopupInputEl.focus();
  });
});

azPopupConfirm.addEventListener('click', confirmAzPopup);

azPopupCancel.addEventListener('click', () => {
  azPopupEl.hidden = true;
  _pendingPick = null;
});

azPopupInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmAzPopup();
  if (e.key === 'Escape') azPopupCancel.click();
});

function confirmAzPopup() {
  if (!_pendingPick) return;
  const az = parseFloat(azPopupInputEl.value);
  if (isNaN(az) || az < 0 || az > 360) {
    azPopupInputEl.style.borderColor = '#e00';
    azPopupInputEl.focus();
    return;
  }
  azPopupInputEl.style.borderColor = '';
  azPopupEl.hidden = true;
  addStation(_pendingPick.lat, _pendingPick.lon, az);
  _pendingPick = null;
}

// ── Clear all ──────────────────────────────────────────────────────────────
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!state.stations.length) return;
  state.stations = [];
  state.nextId = 1;
  renderStationList();
  updateDeclinationDisplay();
  recalculate();
});

// ── Recalculate & render ───────────────────────────────────────────────────
function recalculate() {
  clearOverlays();
  hideError();
  clearResults();

  if (state.stations.length === 0) return;

  let stations = state.stations;
  if (state.northMode === 'magnetic') {
    try {
      stations = applyMagneticCorrection(state.stations, state.date);
    } catch (e) {
      showError('磁偏角計算失敗：' + e.message);
      return;
    }
  }

  const lineLength = computeLineLength(stations);
  state.stations.forEach((s, idx) => {
    const color = stationColor(idx);
    drawStation(s.lat, s.lon, `#${s.id}`, color);
    drawBearingLine(s.lat, s.lon, stations[idx].azimuth, lineLength, color);
  });

  if (state.stations.length < 2) return;

  let result;
  try {
    result = calculateTarget(stations, {
      lineAlgorithm: state.lineAlgorithm,
      estimator: state.estimator,
    });
  } catch (e) {
    showError(e.message);
    return;
  }

  drawTarget(result.target.lat, result.target.lon);
  result.pairIntersections.forEach(p => drawIntersection(p.lat, p.lon));

  fitToPoints([
    ...state.stations.map(s => ({ lat: s.lat, lon: s.lon })),
    result.target,
  ]);

  resultTargetEl.textContent = formatLatLon(result.target.lat, result.target.lon);

  const minA = result.minAcuteAngle;
  const warn = minA.value < 30;
  resultAngleEl.textContent =
    `${minA.value.toFixed(1)}° (#${minA.stationPair[0]}–#${minA.stationPair[1]})` +
    (warn ? ' ⚠ 夾角過小' : '');
  resultAngleEl.className = 'result-value' + (warn ? ' warn' : '');

  allAnglesBodyEl.innerHTML = result.allPairAngles
    .map(p => `<tr><td>#${p.stations[0]}–#${p.stations[1]}</td><td>${p.angle.toFixed(1)}°</td></tr>`)
    .join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showError(msg) {
  errorBannerEl.textContent = msg;
  errorBannerEl.hidden = false;
}

function hideError() {
  errorBannerEl.hidden = true;
}

function clearResults() {
  resultTargetEl.textContent = '—';
  resultAngleEl.textContent = '—';
  resultAngleEl.className = 'result-value';
  allAnglesBodyEl.innerHTML = '';
}
