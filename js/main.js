// 無線電追蹤三角定位工具 — main.js — UI state and event handling

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
addFitControl(fitPoints);
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
  const active = activeStations();
  if (active.length > 0) {
    lat = active.reduce((s, st) => s + st.lat, 0) / active.length;
    lon = active.reduce((s, st) => s + st.lon, 0) / active.length;
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
  recalculate();       // result + map popups follow the same order
});

btnCoordLonLat.addEventListener('click', () => {
  if (state.coordOrder === 'lonlat') return;
  state.coordOrder = 'lonlat';
  updateCoordUI();
  renderStationList();
  recalculate();
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

// ── Copy coords / share / snapshot ────────────────────────────────────────
let _shareUrl = '';
let _lastTarget = null;

// What the map's fit button frames: every checked station plus the latest
// target, so it reproduces the view recalculate() sets automatically.
function fitPoints() {
  const pts = activeStations().map(s => ({ lat: s.lat, lon: s.lon }));
  if (_lastTarget) pts.push(_lastTarget);
  return pts;
}

function flashButton(btn, msg, restore) {
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = restore; }, 1500);
}

// navigator.clipboard needs a secure, focused document; fall back to the
// old execCommand trick when it refuses so copying never silently fails.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

document.getElementById('btn-copy-coords').addEventListener('click', async () => {
  const btn = document.getElementById('btn-copy-coords');
  if (await copyText(resultTargetEl.textContent)) {
    flashButton(btn, '✓ 已複製', '📋 複製座標');
  } else {
    showError('無法複製，請手動選取座標');
  }
});

// Shares a Google Maps link to the target — the receiver opens it and sees the
// point pinned on Google Maps. Uses the native share sheet on mobile, and falls
// back to copying the link on desktop browsers without Web Share.
document.getElementById('btn-share').addEventListener('click', async () => {
  const btn = document.getElementById('btn-share');
  if (!_shareUrl) return;
  // Desktop share sheets are clunky; copying the link is the better default there.
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: '三角定位結果', text: `目標座標 ${resultTargetEl.textContent}`, url: _shareUrl });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;  // user dismissed the share sheet
    }
  }
  if (await copyText(_shareUrl)) {
    flashButton(btn, '✓ 已複製鏈接', '🔗 位置分享');
  } else {
    showError('無法複製鏈接，請手動選取座標後自行分享');
  }
});

// Builds a shareable PNG: the map view on top, and underneath every
// observation point's coordinates/azimuth plus the target coordinates — so a
// pasted image carries the numbers, not just a picture of the map.
const SNAP_FONT = '"Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif';

async function buildSnapshotCanvas() {
  const mapCanvas = captureMapCanvas();
  const stations = activeStations();
  const pad = 14;
  const rowH = 22;
  const W = Math.max(mapCanvas.width, 460);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = mapCanvas.height + 128 + stations.length * rowH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapCanvas, Math.round((W - mapCanvas.width) / 2), 0);

  let y = mapCanvas.height + pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#5f6368';
  ctx.font = `12px ${SNAP_FONT}`;
  ctx.fillText('目標座標', pad, y + 6);
  ctx.fillStyle = '#202124';
  ctx.font = `bold 18px ${SNAP_FONT}`;
  ctx.fillText(resultTargetEl.textContent, pad + 72, y);
  y += 30;

  ctx.fillStyle = '#5f6368';
  ctx.font = `12px ${SNAP_FONT}`;
  ctx.fillText('最小銳角', pad, y + 1);
  ctx.fillStyle = resultAngleEl.classList.contains('warn') ? '#c5221f' : '#202124';
  ctx.font = `13px ${SNAP_FONT}`;
  ctx.fillText(resultAngleEl.textContent, pad + 72, y);
  y += 22;

  ctx.fillStyle = '#5f6368';
  ctx.font = `12px ${SNAP_FONT}`;
  ctx.fillText(`觀測點（${state.coordOrder === 'lonlat' ? '經,緯' : '緯,經'}）`, pad, y);
  y += 20;

  stations.forEach(s => {
    const cy = y + rowH / 2;
    ctx.beginPath();
    ctx.arc(pad + 9, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = stationColorFor(s);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `bold 10px ${SNAP_FONT}`;
    ctx.fillText(String(s.id), pad + 9, cy);
    ctx.textAlign = 'left';
    let x = pad + 26;
    if (s.name) {
      ctx.fillStyle = '#202124';
      ctx.font = `bold 13px ${SNAP_FONT}`;
      ctx.fillText(s.name, x, cy);
      x += ctx.measureText(s.name).width + 10;
    }
    ctx.fillStyle = '#202124';
    ctx.font = `13px ${SNAP_FONT}`;
    ctx.fillText(`${formatLatLon(s.lat, s.lon)}　方位角 ${s.azimuth.toFixed(1)}°`, x, cy);
    ctx.textBaseline = 'top';
    y += rowH;
  });

  y += 6;
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y + 0.5);
  ctx.lineTo(W - pad, y + 0.5);
  ctx.stroke();
  y += 8;

  const north = state.northMode === 'magnetic' ? `磁北（${state.date}）` : '真北';
  const algo = state.lineAlgorithm === 'geodesic' ? 'Geodesic' : '平面';
  const est = state.estimator === 'mle' ? 'MLE' : 'Centroid';
  ctx.fillStyle = '#5f6368';
  ctx.font = `11px ${SNAP_FONT}`;
  ctx.fillText(`${north} · ${algo} · ${est}`, pad, y);
  ctx.textAlign = 'right';
  ctx.fillText('win-hs.github.io/triangulation', W - pad, y);
  ctx.textAlign = 'left';

  return canvas;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('btn-copy-shot').addEventListener('click', async () => {
  const btn = document.getElementById('btn-copy-shot');
  btn.disabled = true;
  btn.textContent = '產生中…';
  // Handing ClipboardItem a promise keeps the write inside the user gesture,
  // which Safari requires; the same promise feeds the download fallback.
  const shot = buildSnapshotCanvas()
    .then(c => new Promise(res => c.toBlob(res, 'image/png')));
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': shot })]);
      copied = true;
    }
  } catch (e) {
    copied = false;  // no clipboard permission / unsupported — fall through
  }
  try {
    const blob = await shot;
    if (!blob) throw new Error('無法產生圖片');
    btn.disabled = false;
    if (copied) {
      flashButton(btn, '✓ 已複製截圖', '📸 複製截圖');
    } else {
      downloadBlob(blob, `triangulation-${state.date}.png`);
      flashButton(btn, '✓ 已下載圖片', '📸 複製截圖');
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '📸 複製截圖';
    showError('截圖失敗：' + e.message);
  }
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
  return `${a.toFixed(6)}, ${b.toFixed(6)}`;
}

// ── Station management ─────────────────────────────────────────────────────
function addStation(lat, lon, azimuth) {
  const id = state.nextId++;
  state.stations.push({ id, lat, lon, azimuth, name: '', enabled: true });
  renderStationList();
  updateDeclinationDisplay();
  recalculate();
}

// Unchecked stations are kept in the list but excluded from the map, the
// calculation and the snapshot.
function activeStations() {
  return state.stations.filter(s => s.enabled);
}

// Colors follow a station's position in the full list, so unchecking one
// doesn't recolour the rest.
function stationColorFor(s) {
  return stationColor(state.stations.indexOf(s));
}

function escapeHtml(str) {
  return str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

function updateStationName(id, value) {
  const s = state.stations.find(s => s.id === id);
  if (!s) return;
  s.name = value.trim();
  recalculate();  // the map label and snapshot follow the name
}

function setStationEnabled(id, enabled) {
  const s = state.stations.find(s => s.id === id);
  if (!s) return;
  s.enabled = enabled;
  const row = stationListEl.querySelector(`[data-station-id="${id}"]`);
  if (row) row.classList.toggle('off', !enabled);
  updateDeclinationDisplay();
  recalculate();
}

function renderStationList() {
  const coordHint = state.coordOrder === 'lonlat' ? '經,緯' : '緯,經';
  stationListEl.innerHTML = '';
  state.stations.forEach((s, idx) => {
    const color = stationColor(idx);
    const row = document.createElement('div');
    row.className = 'station-row' + (s.enabled ? '' : ' off');
    row.dataset.stationId = s.id;
    row.innerHTML = `
      <input type="checkbox" class="station-toggle" title="取消勾選即從地圖與計算中排除"
             ${s.enabled ? 'checked' : ''} data-id="${s.id}">
      <span class="station-badge" style="background:${color}" title="在地圖上定位這一站">#${s.id}</span>
      <input type="text" class="name-input" placeholder="名稱" title="名稱（選填）"
             value="${escapeHtml(s.name)}"
             data-id="${s.id}" data-role="name">
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

  stationListEl.querySelectorAll('input[data-role]').forEach(input => {
    input.addEventListener('change', e => {
      const id = parseInt(e.target.dataset.id);
      const role = e.target.dataset.role;
      if (role === 'latlon') {
        updateStationLatLon(id, e.target.value);
      } else if (role === 'name') {
        updateStationName(id, e.target.value);
      } else {
        updateStationAzimuth(id, e.target.value);
      }
    });
  });

  stationListEl.querySelectorAll('.station-toggle').forEach(box => {
    box.addEventListener('change', e => {
      setStationEnabled(parseInt(e.target.dataset.id), e.target.checked);
    });
  });

  stationListEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      deleteStation(parseInt(e.target.dataset.id));
    });
  });

  stationListEl.querySelectorAll('.station-badge').forEach(badge => {
    badge.addEventListener('click', e => {
      const id = parseInt(e.target.closest('.station-row').dataset.stationId);
      selectStation(id);
      focusStation(id);
    });
  });
}

// ── Map ↔ list selection ────────────────────────────────────────────────────
// Clicking a station marker/line on the map highlights the matching row in
// the list; clicking a row's badge pans the map to that station and opens
// its popup. Keeps the two views in sync.
function selectStation(id) {
  stationListEl.querySelectorAll('.station-row').forEach(row => {
    row.classList.toggle('active', parseInt(row.dataset.stationId) === id);
  });
  const row = stationListEl.querySelector(`[data-station-id="${id}"]`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function openAzPopup(lat, lon) {
  _pendingPick = { lat, lon };
  azPopupCoordsEl.textContent = formatLatLon(lat, lon);
  azPopupInputEl.value = '';
  azPopupInputEl.style.borderColor = '';
  azPopupEl.hidden = false;
  azPopupInputEl.focus();
}

document.getElementById('btn-add-map').addEventListener('click', () => {
  enablePickMode(({ lat, lon }) => openAzPopup(lat, lon));
});

// ── Locate me: add an observation point at the device's GPS position ───────
document.getElementById('btn-locate').addEventListener('click', () => {
  const btn = document.getElementById('btn-locate');
  if (!navigator.geolocation) {
    showError('此瀏覽器不支援定位功能');
    return;
  }
  hideError();
  btn.disabled = true;
  btn.textContent = '定位中…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      btn.disabled = false;
      btn.textContent = '📍 定位';
      const { latitude, longitude } = pos.coords;
      centerMap(latitude, longitude, 15);
      openAzPopup(latitude, longitude);
    },
    err => {
      btn.disabled = false;
      btn.textContent = '📍 定位';
      const msgs = {
        1: '定位權限被拒絕，請在瀏覽器設定中允許存取位置',
        2: '無法取得位置訊號，請確認 GPS 已開啟',
        3: '定位逾時，請再試一次',
      };
      showError(msgs[err.code] || ('定位失敗：' + err.message));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
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
const confirmPopupEl  = document.getElementById('confirm-popup');
const confirmMsgEl    = document.getElementById('confirm-popup-msg');
const confirmOkBtn    = document.getElementById('confirm-popup-ok');
const confirmCancelBtn = document.getElementById('confirm-popup-cancel');

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!state.stations.length) return;
  confirmMsgEl.textContent = `確定要清空全部 ${state.stations.length} 個觀測點嗎？`;
  confirmPopupEl.hidden = false;
  confirmCancelBtn.focus();  // destructive action must not be one stray Enter away
});

function closeConfirm() { confirmPopupEl.hidden = true; }

confirmOkBtn.addEventListener('click', () => {
  closeConfirm();
  state.stations = [];
  state.nextId = 1;
  renderStationList();
  updateDeclinationDisplay();
  recalculate();
});

confirmCancelBtn.addEventListener('click', closeConfirm);

// Tapping the backdrop dismisses — dismissing is the safe direction here.
confirmPopupEl.addEventListener('click', e => {
  if (e.target === confirmPopupEl) closeConfirm();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !confirmPopupEl.hidden) closeConfirm();
});

// ── Recalculate & render ───────────────────────────────────────────────────
function recalculate() {
  clearOverlays();
  hideError();
  clearResults();

  const active = activeStations();
  if (active.length === 0) return;

  let stations = active;
  if (state.northMode === 'magnetic') {
    try {
      stations = applyMagneticCorrection(active, state.date);
    } catch (e) {
      showError('磁偏角計算失敗：' + e.message);
      return;
    }
  }

  const lineLength = computeLineLength(stations);
  active.forEach((s, idx) => {
    const color = stationColorFor(s);
    const nameHtml = s.name ? escapeHtml(s.name) : '';
    const info = `<b>觀測點 #${s.id}${nameHtml ? ' ' + nameHtml : ''}</b>` +
      `<br>座標：${formatLatLon(s.lat, s.lon)}` +
      `<br>方位角：${stations[idx].azimuth.toFixed(1)}°`;
    drawStation(s.lat, s.lon, `#${s.id}`, color, s.id, info, selectStation, nameHtml);
    drawBearingLine(s.lat, s.lon, stations[idx].azimuth, lineLength, color, s.id, info, selectStation);
  });

  if (active.length < 2) return;

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
    ...active.map(s => ({ lat: s.lat, lon: s.lon })),
    result.target,
  ]);

  resultTargetEl.textContent = formatLatLon(result.target.lat, result.target.lon);
  _lastTarget = result.target;

  // Copy / share / snapshot buttons
  _shareUrl = `https://www.google.com/maps?q=${result.target.lat.toFixed(6)},${result.target.lon.toFixed(6)}`;
  document.getElementById('result-actions').hidden = false;

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
  _shareUrl = '';
  _lastTarget = null;
  document.getElementById('result-actions').hidden = true;
  document.getElementById('btn-copy-coords').textContent = '📋 複製座標';
  document.getElementById('btn-share').textContent = '🔗 位置分享';
  document.getElementById('btn-copy-shot').textContent = '📸 複製截圖';
}
