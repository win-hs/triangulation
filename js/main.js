// 無線電追蹤三角定位工具 — main.js — UI state and event handling

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
// A group is one animal being tracked: its own observation points, its own
// target. Groups are drawn and calculated independently, and both the group
// and each station inside it can be unchecked to drop out of everything.
const state = {
  groups: [],               // { id, name, enabled, collapsed, showAngles, nextStationId, stations[] }
  nextGroupId: 1,
  multiGroup: false,        // off = the pre-groups single-list behaviour
  timeSeries: false,        // on = every fix is recorded on the map
  tsInterval: 30,           // seconds of no change before a fix is committed (see TS_INTERVALS)
  northMode: 'true',        // 'true' | 'magnetic'
  coordOrder: 'latlon',     // 'latlon' | 'lonlat'
  lineAlgorithm: 'planar',  // 'planar' | 'geodesic'
  estimator: 'centroid',    // 'mle' | 'centroid'
  date: todayISO(),
  showHelp: false,
};

// groupId -> { target, minAcuteAngle, allPairAngles } or { error }
let results = new Map();

// Deleting takes two steps — select a row, then press 刪除 in that group's
// action bar. A per-row ✕ sat right beside the azimuth field and was being
// hit by accident.
let _selected = null;  // { groupId, stationId }

// Closing the tab by accident mid-survey should not lose the points. Kept in
// this browser only — it does not follow the user to another device. Measured
// from the last save rather than the calendar day, so a survey running past
// midnight still picks up where it left off.
const STORE_KEY = 'triangulation.state.v1';
const STORE_MAX_AGE = 24 * 60 * 60 * 1000;
let _saveTimer = null;

// The theme is a standing preference, not survey data: it lives under its own
// key so it neither expires with the 24-hour window nor disappears when there
// is no saved survey. null = follow the system setting.
const THEME_KEY = 'triangulation.theme';
// Saved targets are an accumulating record, not work-in-progress, so they get
// their own key and never expire — a study can run for weeks.
const PIN_KEY = 'triangulation.pins.v1';
let darkMode = null;  // null | true | false
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Persistence ────────────────────────────────────────────────────────────
// Every write is wrapped: private browsing and a full quota both throw, and
// losing the convenience of a restore must never break the tool itself.
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 300);
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      savedAt: Date.now(),
      groups: state.groups,
      nextGroupId: state.nextGroupId,
      multiGroup: state.multiGroup,
      timeSeries: state.timeSeries,
      tsInterval: state.tsInterval,
      northMode: state.northMode,
      coordOrder: state.coordOrder,
      lineAlgorithm: state.lineAlgorithm,
      estimator: state.estimator,
      date: state.date,
    }));
  } catch (e) { /* storage unavailable — carry on without it */ }
}

const PIN_MAX = 20;   // oldest drops out once the map is full, per device
const PIN_MAX_DEVICES = 5;   // including your own — 100 points is already a lot to read
const PIN_RAMP = 6;   // how many of the newest carry the colour ramp

let pins = [];        // { id, lat, lon, t, color, name }
let pinSeq = 1;
// Record ids have to stay unique across devices: two people's series get
// merged when shared, and a colliding id would silently overwrite the other
// person's record instead of adding to it.
let deviceId = '';
// groupId -> id of the record currently being written. Not persisted: a fresh
// page load starts a new one.
let recIds = new Map();
let _pinSaveTimer = null;
let _settleTimer = null;
// A restored fix was already recorded in the session that made it. Without
// this, every reload — including a language switch — would drop another point
// on top of it, and a few reopenings would fill the whole history with copies
// of the same position.
let _suppressRecord = false;

// A fix stays open while it is still being worked on, so nudging a bearing
// moves the point instead of dropping another one beside it. Once nothing has
// changed for tsInterval seconds the fix is committed and the next change
// starts a new point — no need to press 清空 between rounds.
function scheduleSettle() {
  clearTimeout(_settleTimer);
  _settleTimer = setTimeout(() => recIds.clear(), state.tsInterval * 1000);
}

function schedulePinSave() {
  clearTimeout(_pinSaveTimer);
  _pinSaveTimer = setTimeout(savePins, 300);
}

function savePins() {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify({ deviceId, pinSeq, pins }));
  } catch (e) { /* storage unavailable — carry on without it */ }
}

function loadPins() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PIN_KEY)); } catch (e) { saved = null; }
  deviceId = (saved && saved.deviceId) || Math.random().toString(36).slice(2, 8);
  pinSeq = (saved && Number(saved.pinSeq)) || 1;
  pins = (saved && Array.isArray(saved.pins) ? saved.pins : []).filter(p =>
    p && typeof p.id === 'string' &&
    num(p.lat) !== null && num(p.lon) !== null && num(p.t) !== null);
  if (pins.length > PIN_MAX) pins = pins.slice(-PIN_MAX);
}

// Recency is ranked, not clocked: the newest PIN_RAMP fixes carry the colour
// ramp and everything older sits in one desaturated tone of the same hue.
// Ranking keeps the steps apart no matter how the times happen to fall — with
// age bands a whole afternoon's work could land in one band and show nothing.
// Fading opacity alone washed out against the basemap, so the ramp drops
// saturation instead: a blue series ends blue-grey rather than invisible.
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { h: 210, s: 0.5, l: 0.5 };
  const [r, g, b] = m.slice(1).map(v => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6)
          : max === g ? 60 * ((b - r) / d + 2)
                      : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h / 60) % 6];
  return '#' + seg.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// rank 0 = newest. Beyond the ramp everything shares one blue-grey, so a long
// history reads as background without competing with the recent points.
function pinStyle(baseHex, rank) {
  const { h, s, l } = hexToHsl(baseHex);
  if (rank >= PIN_RAMP) {
    return { fill: hslToHex(h, 0.18, 0.74), stroke: hslToHex(h, 0.18, 0.56) };
  }
  const k = rank / (PIN_RAMP - 1);                 // 0 newest → 1 oldest coloured
  const sat = s * (1 - 0.45 * k);
  const lit = l + (0.64 - l) * k;
  return { fill: hslToHex(h, sat, lit), stroke: hslToHex(h, sat, Math.max(0.2, lit - 0.16)) };
}

const pad2 = (n) => String(n).padStart(2, '0');

function formatPinTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// The caption is the crowded one, so it drops the date unless the point is
// from another day — most series run inside one, and a shorter caption is a
// caption that survives the overlap pass.
function formatPinClock(ms) {
  const d = new Date(ms), now = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth()
    && d.getFullYear() === now.getFullYear();
  return sameDay ? hm : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${hm}`;
}

function refreshPinControls() {
  if (tsShareBtn) tsShareBtn.disabled = !pins.length;
  setSweepEnabled(pins.length > 0);
}

// Which individual a point belongs to: who recorded it, and which target of
// theirs it is. Two people tracking with the same colour are still two series.
function seriesKey(p) {
  return pinDevice(p.id) + '|' + (p.color || '');
}

// Recency is counted inside each series, from that individual's own newest
// fix — not across the map. Ranking globally meant a series recorded earlier
// in the day came out uniformly grey, with its own movement invisible, just
// because another individual had been located more recently.
function seriesRanks() {
  const bySeries = new Map();
  pins.forEach(p => {
    const k = seriesKey(p);
    if (!bySeries.has(k)) bySeries.set(k, []);
    bySeries.get(k).push(p);
  });
  const rank = new Map();
  bySeries.forEach(list => {
    list.sort((a, b) => a.t - b.t);
    const last = list.length - 1;
    list.forEach((p, i) => rank.set(p.id, last - i));
  });
  return rank;
}

function drawPinLayer() {
  const rank = seriesRanks();
  drawPins(pins.map(p => ({
    id: p.id,
    lat: p.lat,
    lon: p.lon,
    // Ownership is its own visual channel: hue is already spoken for by which
    // target this is, and lightness by how recent.
    shared: pinDevice(p.id) !== deviceId,
    baseColor: p.color || '#1a73e8',
    series: seriesKey(p),
    name: p.name || '',
    ...pinStyle(p.color || '#1a73e8', rank.get(p.id)),
    label: formatPinClock(p.t),
    popupHtml:
      (p.name ? `<b>${escapeHtml(p.name)}</b><br>` : '') +
      `${formatLatLon(p.lat, p.lon)}<br>${formatPinTime(p.t)}` +
      `<div class="pin-popup-actions">` +
      `<button class="pin-del btn-action danger">${t('del')}</button></div>`,
  })), deletePin);
  renderLegend(t('legendShared'), t('legendUnnamed'));
  refreshPinControls();
}

// Called after every recalculation while 時間序列模式 is on. One fix lasts
// until 清空: while stations are still being added and bearings tuned, the
// same record moves, so adjusting a bearing does not leave a trail of
// near-duplicates behind it. 清空 is what starts the next one.
function recordFixes() {
  let changed = false;
  activeGroups().forEach(group => {
    const r = results.get(group.id);
    if (!r || !r.target) return;
    const open = pins.find(p => p.id === recIds.get(group.id));
    if (open) {
      if (open.lat === r.target.lat && open.lon === r.target.lon) return;
      // The timestamp stays at the moment the fix first resolved — tuning a
      // bearing afterwards refines that same fix, it does not make a later one.
      open.lat = r.target.lat;
      open.lon = r.target.lon;
      open.name = targetLabel(group);
    } else {
      const pin = { id: deviceId + '-' + pinSeq++, lat: r.target.lat, lon: r.target.lon,
                    t: Date.now(), color: groupColor(group), name: targetLabel(group),
                    g: group.id };   // so a later rename can find its points
      pins.push(pin);
      recIds.set(group.id, pin.id);
      capPins();
    }
    changed = true;
  });
  if (changed) { scheduleSettle(); schedulePinSave(); drawPinLayer(); }
}

// The cap is per device, not per map: your own recording only ever evicts your
// own oldest point, so merging someone else's series can never push their
// records — or yours — off the map.
function pinDevice(id) {
  return String(id).split('-')[0];
}

function capPins() {
  const byDevice = new Map();
  pins.forEach(p => {
    const d = pinDevice(p.id);
    if (!byDevice.has(d)) byDevice.set(d, []);
    byDevice.get(d).push(p);
  });
  const keep = new Set();
  byDevice.forEach(list => list.slice(-PIN_MAX).forEach(p => keep.add(p.id)));
  if (keep.size === pins.length) return;
  pins.forEach(p => {
    // A record still being written must not be evicted out from under us, or
    // the next keystroke starts a duplicate beside it.
    if (!keep.has(p.id)) recIds.forEach((v, k) => { if (v === p.id) recIds.delete(k); });
  });
  pins = pins.filter(p => keep.has(p.id));
}

// Points are kept in time order: the colour ramp reads rank off the array, and
// a merged-in series interleaves with your own by when it was recorded.
function sortPins() {
  pins.sort((a, b) => a.t - b.t);
}

const TS_INTERVALS = [
  { s: 5,    label: () => t('secShort', { n: 5 }) },
  { s: 30,   label: () => t('secShort', { n: 30 }) },
  { s: 300,  label: () => t('minShort', { n: 5 }) },
  { s: 600,  label: () => t('minShort', { n: 10 }) },
  { s: 900,  label: () => t('minShort', { n: 15 }) },
  { s: 1800, label: () => t('minShort', { n: 30 }) },
  { s: 3600, label: () => t('minShort', { n: 60 }) },
];

function buildIntervalOptions() {
  tsIntervalEl.innerHTML = TS_INTERVALS
    .map(o => `<option value="${o.s}">${o.label()}</option>`).join('');
  tsIntervalEl.value = String(state.tsInterval);
}

// ── Sharing ────────────────────────────────────────────────────────────────
// The payload rides in the hash, so the coordinates never reach a server log —
// these are animal locations and some of the species are poaching-sensitive.
function encodePins(list) {
  const payload = { v: 1, p: list.map(p =>
    [p.id, +p.lat.toFixed(5), +p.lon.toFixed(5), Math.round(p.t / 1000), p.name || '', p.color || '']) };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .split('+').join('-').split('/').join('_').replace(/=+$/, '');
}

function decodePins(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!obj || obj.v !== 1 || !Array.isArray(obj.p)) return [];
    return obj.p
      .map(r => ({ id: String(r[0]), lat: num(r[1]), lon: num(r[2]),
                   t: num(r[3]) * 1000, name: String(r[4] || ''), color: String(r[5] || '') }))
      .filter(p => p.id && p.lat !== null && p.lon !== null && p.t !== null);
  } catch (e) { return []; }
}

function tsShareUrl() {
  const base = location.origin + location.pathname;
  return base + '#ts=' + encodePins(pins);
}

// Merge, never replace: ids carry the device that made them, so two people's
// series add together and re-opening the same link changes nothing.
function mergePins(incoming) {
  const have = new Set(pins.map(p => p.id));
  const added = incoming.filter(p => !have.has(p.id));
  if (!added.length) return 0;
  // The cap is on people, not points: silently dropping a colleague's whole
  // series would look like the link had failed.
  const devices = new Set(pins.map(p => pinDevice(p.id)));
  devices.add(deviceId);
  added.forEach(p => devices.add(pinDevice(p.id)));
  if (devices.size > PIN_MAX_DEVICES) {
    showError(t('tsTooManyDevices', { max: PIN_MAX_DEVICES }));
    return -1;   // refused, not merged
  }
  pins = pins.concat(added);
  sortPins();
  capPins();
  savePins();
  drawPinLayer();
  return added.length;
}

window.addEventListener('hashchange', () => importPinsFromHash());

function importPinsFromHash() {
  const m = /[#&]ts=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  // Drop it from the address bar either way, so a refresh does not re-announce
  // an import and the coordinates stop riding along in a shared screenshot.
  history.replaceState(null, '', location.pathname + location.search);
  const incoming = decodePins(m[1]);
  if (!incoming.length) return;
  const n = mergePins(incoming);
  if (n < 0) return;   // refused; mergePins has already said why
  showNotice(n ? t('tsMerged', { n }) : t('tsMergedNone'));
}

function deletePin(id) {
  pins = pins.filter(p => p.id !== id);
  recIds.forEach((v, k) => { if (v === id) recIds.delete(k); });
  savePins();
  drawPinLayer();
}

function clearPins(series, name) {
  if (!pins.length) return;
  if (!series) {
    askConfirm(t('confirmClearPins', { n: pins.length }), t('pinClearOk'), () => {
      pins = [];
      recIds.clear();
      savePins();
      drawPinLayer();
    });
    return;
  }
  const doomed = pins.filter(p => seriesKey(p) === series);
  if (!doomed.length) return;
  askConfirm(t('confirmClearSeries', { g: name || t('legendUnnamed'), n: doomed.length }),
    t('pinClearOk'), () => {
      const gone = new Set(doomed.map(p => p.id));
      pins = pins.filter(p => !gone.has(p.id));
      recIds.forEach((v, k) => { if (gone.has(v)) recIds.delete(k); });
      savePins();
      drawPinLayer();
    });
}

function forgetState() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing to do */ }
}

// ── Theme ──────────────────────────────────────────────────────────────────
function isDark() {
  return darkMode === null ? darkQuery.matches : darkMode;
}

function applyTheme() {
  const dark = isDark();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  swDark.classList.toggle('on', dark);
  swDark.setAttribute('aria-checked', String(dark));
}

function loadTheme() {
  let v = null;
  try { v = localStorage.getItem(THEME_KEY); } catch (e) { v = null; }
  darkMode = v === 'dark' ? true : v === 'light' ? false : null;
}

// Until the switch is touched the app tracks the system setting live.
darkQuery.addEventListener('change', () => { if (darkMode === null) applyTheme(); });

// ── Language ───────────────────────────────────────────────────────────────
// The URL is the only source of language: the root is Chinese, /en/ is English.
// Nothing is remembered, so a link always opens in the language it names.
function loadLang() {
  setLang(window.PAGE_LANG === 'en' ? 'en' : 'tw');
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// Anything stored could be from an older build or hand-edited, so rebuild the
// groups field by field and drop whatever does not make sense.
function reviveGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(g => {
    const stations = (Array.isArray(g.stations) ? g.stations : []).map(s => {
      const lat = num(s.lat), lon = num(s.lon), azimuth = num(s.azimuth);
      if (lat === null || lon === null || azimuth === null) return null;
      return {
        id: num(s.id) || 1,
        lat, lon, azimuth,
        name: typeof s.name === 'string' ? s.name : '',
        enabled: s.enabled !== false,
      };
    }).filter(Boolean);
    return {
      id: num(g.id) || 1,
      name: typeof g.name === 'string' ? g.name : '',
      enabled: g.enabled !== false,
      collapsed: g.collapsed === true,
      showAngles: g.showAngles === true,
      nextStationId: num(g.nextStationId) ||
        stations.reduce((m, s) => Math.max(m, s.id), 0) + 1,
      stations,
    };
  });
}

function loadState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { saved = null; }
  if (!saved || typeof saved !== 'object') return false;

  if (!num(saved.savedAt) || Date.now() - saved.savedAt > STORE_MAX_AGE) {
    forgetState();
    return false;
  }

  const groups = reviveGroups(saved.groups);
  if (!groups.length) return false;

  state.groups = groups;
  state.nextGroupId = num(saved.nextGroupId) ||
    groups.reduce((m, g) => Math.max(m, g.id), 0) + 1;
  state.multiGroup = saved.multiGroup === true;
  state.timeSeries = saved.timeSeries === true;
  state.tsInterval = TS_INTERVALS.some(o => o.s === saved.tsInterval) ? saved.tsInterval : 30;
  if (saved.northMode === 'magnetic') state.northMode = 'magnetic';
  if (saved.coordOrder === 'lonlat') state.coordOrder = 'lonlat';
  if (saved.lineAlgorithm === 'geodesic') state.lineAlgorithm = 'geodesic';
  if (saved.estimator === 'mle') state.estimator = 'mle';
  if (typeof saved.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.date)) {
    state.date = saved.date;
  }
  return true;
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const groupListEl      = document.getElementById('group-list');
const resultListEl     = document.getElementById('result-list');
const errorBannerEl    = document.getElementById('error-banner');
const dateInputEl      = document.getElementById('date-input');
const dateLabelEl      = document.getElementById('date-label');
const northColEl       = document.getElementById('north-col');
const declEl           = document.getElementById('declination-display');

const btnNorthTrue     = document.getElementById('btn-north-true');
const btnNorthMag      = document.getElementById('btn-north-magnetic');
const btnCoordLatLon   = document.getElementById('btn-coord-latlon');
const btnCoordLonLat   = document.getElementById('btn-coord-lonlat');
const btnLinePlanar    = document.getElementById('btn-line-planar');
const btnLineGeodesic  = document.getElementById('btn-line-geodesic');
const btnEstMle        = document.getElementById('btn-est-mle');
const btnEstCentroid   = document.getElementById('btn-est-centroid');
const swMultiGroup     = document.getElementById('sw-multi-group');
const swDark           = document.getElementById('sw-dark');
const swTimeSeries     = document.getElementById('sw-time-series');
const tsIntervalEl     = document.getElementById('ts-interval');
const tsIntervalCol    = document.getElementById('ts-interval-col');
const tsShareCol       = document.getElementById('ts-share-col');
const tsShareBtn       = document.getElementById('btn-ts-share');
const btnLangEl        = document.getElementById('btn-lang');
const langCodeEl       = document.getElementById('lang-code');

const azPopupEl        = document.getElementById('az-popup');
const azPopupCoordsEl  = document.getElementById('az-popup-coords');
const azPopupInputEl   = document.getElementById('az-popup-input');
const azPopupConfirm   = document.getElementById('az-popup-confirm');
const azPopupCancel    = document.getElementById('az-popup-cancel');

// ── Init ───────────────────────────────────────────────────────────────────
initMap('map');
loadTheme();
applyTheme();
loadLang();
// The map controls bake their labels in at construction, so they have to wait
// for the language to be settled — built any earlier they come out Chinese on
// the /en/ page. Switching language reloads the page, so this runs again.
addFitControl(fitPoints);
addSweepControl(clearPins, () => ({
  all: t('pinClearAll'), shared: t('legendShared'), unnamed: t('legendUnnamed'),
}));
addLegendControl();
applyStaticStrings();
langCodeEl.textContent = currentLang().toUpperCase();
document.getElementById('help-toggle').textContent = t('helpOpen');
setMapArea(currentLang() === 'tw' ? TW_BOUNDS : null);
loadPins();
importPinsFromHash();   // a shared link merges in before anything is drawn
drawPinLayer();
const restored = loadState();  // before the UI reads state, so it shows what was saved
dateInputEl.value = state.date;
updateNorthUI();
updateCoordUI();
updateAlgoUI();
updateMultiGroupUI();
buildIntervalOptions();
updateTimeSeriesUI();
_suppressRecord = true;   // the first pass is restoring, not recording
if (restored) {
  renderGroupList();
  recalculate();
} else {
  addGroup();  // start with one group so the buttons are there to use
}
_suppressRecord = false;

// ── North toggle ───────────────────────────────────────────────────────────
function updateNorthUI() {
  const mag = state.northMode === 'magnetic';
  btnNorthTrue.classList.toggle('active', !mag);
  btnNorthMag.classList.toggle('active', mag);
  dateLabelEl.hidden = !mag;
  // The date sits beside 磁北, so the column needs the full width while it is
  // showing; the other settings drop to the next line.
  northColEl.classList.toggle('magnetic', mag);
  northColEl.parentElement.classList.toggle('magnetic', mag);
  updateDeclinationDisplay();
}

// The date field can be cleared, and new Date('') is Invalid Date.
function surveyDate() {
  return state.date ? new Date(state.date) : new Date();
}

function formatDec(dec) {
  return `${dec >= 0 ? '+' : ''}${dec.toFixed(2)}°`;
}

// Declination is not one number for the whole survey — it drifts across the
// island (about 0.7° from 台北 to 屏東). Each station is corrected with its
// own value; averaging them for the readout would show a figure that belongs
// to no actual observation point, so show the span whenever they disagree.
function updateDeclinationDisplay() {
  if (state.northMode !== 'magnetic') {
    declEl.hidden = true;
    return;
  }
  const date = surveyDate();
  const active = activeGroups().flatMap(activeStationsIn);
  const decs = active.length
    ? active.map(s => geoMag(s.lat, s.lon, 0, date).dec)
    : [geoMag(23.97, 121.0, 0, date).dec];  // Taiwan centre until there are points

  const min = Math.min(...decs);
  const max = Math.max(...decs);
  // Ordered by how much correction it is rather than by sign, so the span
  // reads from the smallest adjustment to the largest: 屏東 -4.38° 到 台北 -5.06°.
  const [from, to] = Math.abs(min) <= Math.abs(max) ? [min, max] : [max, min];
  declEl.textContent = t('decl') + ' ' +
    (max - min >= 0.05 ? `${formatDec(from)}～${formatDec(to)}` : formatDec(from));
  declEl.className = 'inline-note' +
    (Math.max(Math.abs(min), Math.abs(max)) > 1 ? ' highlight' : '');
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
    inputLatLon.placeholder = t(isLatLon ? 'egLatLon' : 'egLonLat');
  }
}

btnCoordLatLon.addEventListener('click', () => {
  if (state.coordOrder === 'latlon') return;
  state.coordOrder = 'latlon';
  updateCoordUI();
  renderGroupList();  // re-display values in new order
  recalculate();      // result + map popups follow the same order
});

btnCoordLonLat.addEventListener('click', () => {
  if (state.coordOrder === 'lonlat') return;
  state.coordOrder = 'lonlat';
  updateCoordUI();
  renderGroupList();
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
// What the map's fit button frames: every checked station of every checked
// group plus their targets, so it reproduces the view recalculate() sets.
function fitPoints() {
  const pts = [];
  activeGroups().forEach(g => {
    activeStationsIn(g).forEach(s => pts.push({ lat: s.lat, lon: s.lon }));
    const r = results.get(g.id);
    if (r && r.target) pts.push(r.target);
  });
  return pts;
}

function shareUrlFor(target) {
  return `https://www.google.com/maps?q=${target.lat.toFixed(6)},${target.lon.toFixed(6)}`;
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

// Per-group copy and share, delegated because the result list is rebuilt on
// every recalculation. Share puts the group's own target on Google Maps —
// one link pins one point, which is why it lives per group and not globally.
resultListEl.addEventListener('click', async e => {
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const group = findGroup(parseInt(act.closest('.result-group').dataset.groupId));
  const r = group && results.get(group.id);
  if (!r || !r.target) return;

  if (act.dataset.act === 'copy') {
    if (await copyText(formatLatLon(r.target.lat, r.target.lon))) {
      flashButton(act, t('copied'), t('copyCoord'));
    } else {
      showError(t('errCopy'));
    }
    return;
  }

  if (act.dataset.act === 'share') {
    const url = shareUrlFor(r.target);
    // Desktop share sheets are clunky; copying the link is the better default there.
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({
          title: t('shareTitle', { g: groupLabel(group) }),
          text: t('shareText', { g: groupLabel(group), c: formatLatLon(r.target.lat, r.target.lon) }),
          url,
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;  // user dismissed the share sheet
      }
    }
    if (await copyText(url)) {
      flashButton(act, t('copiedLink'), t('share'));
    } else {
      showError(t('errCopyLink'));
    }
    return;
  }

  if (act.dataset.act === 'shot') {
    captureSnapshot(act, () => buildSnapshotFor(group),
      `triangulation-${groupLabel(group)}-${state.date}.png`);
    return;
  }

  if (act.dataset.act === 'angles') {
    group.showAngles = !group.showAngles;
    renderResults();
  }
});

// Builds a shareable PNG: the map view on top, and underneath every
// observation point's coordinates/azimuth plus the target coordinates — so a
// pasted image carries the numbers, not just a picture of the map.
const SNAP_FONT = '"Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif';

// The exported panel follows the theme. Fixed values rather than the CSS
// tokens because canvas cannot resolve var(), and these must stay in step with
// the palette at the top of style.css.
function snapColors() {
  return isDark()
    ? { bg: '#202124', fg: '#e8eaed', dim: '#9aa0a6', rule: '#3c4043', soft: '#2e3134', warn: '#f28b82' }
    : { bg: '#ffffff', fg: '#202124', dim: '#5f6368', rule: '#e0e0e0', soft: '#eeeeee', warn: '#c5221f' };
}

// Only checked groups, and inside them only checked stations, reach the image.
function snapshotSections(groups) {
  return (groups || activeGroups()).map(g => ({
    group: g,
    stations: activeStationsIn(g),
    result: results.get(g.id),
  })).filter(sec => sec.stations.length > 0);
}

// A single group's snapshot shows only that group's lines and target. The map
// view is left alone — only the overlays are swapped, so no tiles need to
// reload and the image frames whatever the user is already looking at.
async function buildSnapshotFor(group) {
  drawGroups([group]);
  try {
    return await buildSnapshotCanvas([group]);
  } finally {
    drawGroups(activeGroups());
  }
}

async function buildSnapshotCanvas(groups) {
  const mapCanvas = captureMapCanvas();
  const snap = snapColors();
  const sections = snapshotSections(groups);
  const pad = 14;
  const rowH = 22;
  const headH = 46;       // group name + target line
  const W = Math.max(mapCanvas.width, 460);

  // Single-group mode prints a name only when the user gave one, so the height
  // has to be worked out per section rather than once for the whole panel.
  const nameH = (sec) => targetLabel(sec.group) ? 20 : 0;
  const panelH = pad * 2 + 34 +
    sections.reduce((h, sec) => h + nameH(sec) + headH + 18 + sec.stations.length * rowH + 10, 0);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = mapCanvas.height + panelH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = snap.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapCanvas, Math.round((W - mapCanvas.width) / 2), 0);

  let y = mapCanvas.height + pad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  sections.forEach((sec, i) => {
    const { group, stations, result } = sec;
    const color = groupColor(group);

    if (i > 0) {
      ctx.strokeStyle = snap.soft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y + 0.5);
      ctx.lineTo(W - pad, y + 0.5);
      ctx.stroke();
      y += 10;
    }

    // The name stays dark so it does not read as one of the observation
    // points. The colour dot keys it to the map, but single-group mode colours
    // its points individually, so there the dot would key to nothing.
    const label = targetLabel(group);
    if (label) {
      if (state.multiGroup) {
        ctx.beginPath();
        ctx.arc(pad + 5, y + 8, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.fillStyle = snap.fg;
      ctx.font = `bold 14px ${SNAP_FONT}`;
      ctx.fillText(label, state.multiGroup ? pad + 16 : pad, y);
      y += 20;
    }

    ctx.fillStyle = snap.dim;
    ctx.font = `12px ${SNAP_FONT}`;
    ctx.fillText(t('target'), pad, y + 5);
    if (result && result.target) {
      ctx.fillStyle = snap.fg;
      ctx.font = `bold 17px ${SNAP_FONT}`;
      ctx.fillText(formatLatLon(result.target.lat, result.target.lon), pad + 72, y);
      const minA = result.minAcuteAngle;
      const warn = minA.value < 30;
      ctx.fillStyle = warn ? snap.warn : snap.dim;
      ctx.font = `11px ${SNAP_FONT}`;
      ctx.fillText(`${t('minAngle')} ${minA.value.toFixed(1)}° (#${minA.stationPair[0]}–#${minA.stationPair[1]})` +
        (warn ? t('angleWarn') : ''), pad + 72, y + 20);
    } else {
      ctx.fillStyle = snap.warn;
      ctx.font = `13px ${SNAP_FONT}`;
      ctx.fillText(result && result.error ? result.error : t('notEnough'), pad + 72, y + 2);
    }
    y += headH;

    ctx.fillStyle = snap.dim;
    ctx.font = `12px ${SNAP_FONT}`;
    ctx.fillText(t('snapStations', { order: t(state.coordOrder === 'lonlat' ? 'lonLat' : 'latLon') }), pad, y);
    y += 18;

    stations.forEach(s => {
      const cy = y + rowH / 2;
      ctx.beginPath();
      ctx.arc(pad + 9, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = stationColorOf(group, s);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = `bold 10px ${SNAP_FONT}`;
      ctx.fillText(String(s.id), pad + 9, cy);
      ctx.textAlign = 'left';
      let x = pad + 26;
      if (s.name) {
        ctx.fillStyle = snap.fg;
        ctx.font = `bold 13px ${SNAP_FONT}`;
        ctx.fillText(s.name, x, cy);
        x += ctx.measureText(s.name).width + 10;
      }
      ctx.fillStyle = snap.fg;
      ctx.font = `13px ${SNAP_FONT}`;
      const line = `${formatLatLon(s.lat, s.lon)}　${t('snapBearing')} ${s.azimuth.toFixed(1)}°`;
      ctx.fillText(line, x, cy);
      const lineW = ctx.measureText(line).width;   // measured before the font shrinks
      // The distance rides along in the shared image too, but stays dim: it is
      // context, not one of the measured values.
      if (result && result.target) {
        ctx.fillStyle = snap.dim;
        ctx.font = `12px ${SNAP_FONT}`;
        ctx.fillText('　' + formatDistance(
          distanceMeters(s.lat, s.lon, result.target.lat, result.target.lon)), x + lineW, cy);
      }
      ctx.textBaseline = 'top';
      y += rowH;
    });
    y += 10;
  });

  ctx.strokeStyle = snap.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y + 0.5);
  ctx.lineTo(W - pad, y + 0.5);
  ctx.stroke();
  y += 8;

  const north = state.northMode === 'magnetic' ? `${t('magNorth')}（${state.date}）` : t('trueNorth');
  const algo = state.lineAlgorithm === 'geodesic' ? 'Geodesic' : t('planar');
  const est = state.estimator === 'mle' ? 'MLE' : 'Centroid';
  ctx.fillStyle = snap.dim;
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

// Shared by the all-groups button and every per-group button.
async function captureSnapshot(btn, build, filename) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('generating');
  // Handing ClipboardItem a promise keeps the write inside the user gesture,
  // which Safari requires; the same promise feeds the download fallback.
  const shot = build().then(c => new Promise(res => c.toBlob(res, 'image/png')));
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
    if (!blob) throw new Error(t('errNoImage'));
    btn.disabled = false;
    if (copied) {
      flashButton(btn, t('copiedShot'), label);
    } else {
      downloadBlob(blob, filename);
      flashButton(btn, t('downloaded'), label);
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    showError(t('errShot', { msg: e.message }));
  }
}

document.getElementById('btn-copy-shot').addEventListener('click', e => {
  captureSnapshot(e.currentTarget, () => buildSnapshotCanvas(), `triangulation-${state.date}.png`);
});

// ── Help toggle ────────────────────────────────────────────────────────────
document.getElementById('help-toggle').addEventListener('click', () => {
  state.showHelp = !state.showHelp;
  document.getElementById('help-body').hidden = !state.showHelp;
  document.getElementById('help-toggle').textContent =
    t(state.showHelp ? 'helpClose' : 'helpOpen');
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

// ── Group & station lookup ─────────────────────────────────────────────────
// Unchecked groups and stations stay in the list but drop out of the map, the
// calculation, the copy buttons and the snapshot.
// With 多組別模式 off the app behaves as it did before groups existed: only
// the first group is shown, drawn and calculated. Any further groups keep
// their data and come back the moment the mode is switched on again.
function visibleGroups() {
  return state.multiGroup ? state.groups : state.groups.slice(0, 1);
}

function activeGroups() {
  return state.multiGroup ? state.groups.filter(g => g.enabled) : visibleGroups();
}

function activeStationsIn(group) {
  return group.stations.filter(s => s.enabled);
}

// Every station in a group shares the group's colour — that is what makes it
// possible to see which bearing lines belong to which target. Within a group
// they are told apart by the #n badge and the name label.
function groupColor(group) {
  return stationColor(state.groups.indexOf(group));
}

// With 多組別模式 on, colour separates the groups. With it off there is only
// one group and nothing to separate, so colour goes back to telling the
// observation points apart. Indexed against the full list either way, so
// unchecking one does not recolour the rest.
function stationColorOf(group, s) {
  return state.multiGroup ? groupColor(group) : stationColor(group.stations.indexOf(s));
}

function groupLabel(group) {
  return group.name || t('groupN', { n: state.groups.indexOf(group) + 1 });
}

// Multi-group always needs a label to tell the cards apart; single-group mode
// has nothing to distinguish, so it shows a name only when the user gave one.
function targetLabel(group) {
  return state.multiGroup ? groupLabel(group) : group.name;
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

function findGroup(id) {
  return state.groups.find(g => g.id === id);
}

function findStation(groupId, stationId) {
  const g = findGroup(groupId);
  return g ? g.stations.find(s => s.id === stationId) : null;
}

function escapeHtml(str) {
  return str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Group management ───────────────────────────────────────────────────────
function addGroup() {
  const group = {
    id: state.nextGroupId++,
    name: '',
    enabled: true,
    collapsed: false,
    showAngles: false,
    nextStationId: 1,
    stations: [],
  };
  state.groups.push(group);
  renderGroupList();
  recalculate();
  return group;
}

function deleteGroup(id) {
  state.groups = state.groups.filter(g => g.id !== id);
  renderGroupList();
  updateDeclinationDisplay();
  recalculate();
}

function updateGroupName(id, value) {
  const g = findGroup(id);
  if (!g) return;
  g.name = value.trim();
  // Points recorded before the target had a name would otherwise stay nameless
  // and show up as a separate, unnamed series alongside the named one.
  const label = targetLabel(g);
  let touched = false;
  pins.forEach(p => {
    if (p.g === id && pinDevice(p.id) === deviceId && p.name !== label) {
      p.name = label;
      touched = true;
    }
  });
  if (touched) { schedulePinSave(); drawPinLayer(); }
  recalculate();  // the map's target label and the snapshot follow the name
}

function setGroupEnabled(id, enabled) {
  const g = findGroup(id);
  if (!g) return;
  g.enabled = enabled;
  const card = groupListEl.querySelector(`[data-group-id="${id}"]`);
  if (card) card.classList.toggle('off', !enabled);
  updateDeclinationDisplay();
  recalculate();
}

function toggleGroupCollapsed(id) {
  const g = findGroup(id);
  if (!g) return;
  g.collapsed = !g.collapsed;
  renderGroupList();
}

// ── Station management ─────────────────────────────────────────────────────
// Station numbers restart at #1 in each group, so a group reads as its own
// small survey rather than a slice of one long list.
function addStation(groupId, lat, lon, azimuth) {
  const g = findGroup(groupId);
  if (!g) return;
  g.stations.push({ id: g.nextStationId++, lat, lon, azimuth, name: '', enabled: true });
  renderGroupList();
  updateDeclinationDisplay();
  recalculate();
}

function deleteStation(groupId, stationId) {
  const g = findGroup(groupId);
  if (!g) return;
  g.stations = g.stations.filter(s => s.id !== stationId);
  renderGroupList();
  updateDeclinationDisplay();
  recalculate();
}

function updateStationLatLon(groupId, stationId, str) {
  const parsed = parseLatLon(str);
  if (!parsed) return;
  const s = findStation(groupId, stationId);
  if (!s) return;
  s.lat = parsed.lat;
  s.lon = parsed.lon;
  updateDeclinationDisplay();
  recalculate();
}

function updateStationAzimuth(groupId, stationId, value) {
  const s = findStation(groupId, stationId);
  if (!s) return;
  s.azimuth = parseFloat(value);
  recalculate();
}

function updateStationName(groupId, stationId, value) {
  const s = findStation(groupId, stationId);
  if (!s) return;
  s.name = value.trim();
  recalculate();  // the map label and snapshot follow the name
}

function setStationEnabled(groupId, stationId, enabled) {
  const s = findStation(groupId, stationId);
  if (!s) return;
  s.enabled = enabled;
  const row = groupListEl.querySelector(
    `[data-group-id="${groupId}"] [data-station-id="${stationId}"]`);
  if (row) row.classList.toggle('off', !enabled);
  updateDeclinationDisplay();
  recalculate();
}

function stationRowHtml(group, s, coordHint) {
  return `
    <div class="station-row${s.enabled ? '' : ' off'}" data-station-id="${s.id}">
      <input type="checkbox" class="station-toggle" title="${t('toggleStationTitle')}"
             ${s.enabled ? 'checked' : ''}>
      <span class="station-badge" style="background:${stationColorOf(group, s)}"
            title="${t('badgeTitle')}">#${s.id}</span>
      <input type="text" class="name-input" placeholder="${t('namePlaceholder')}" title="${t('nameTitle')}"
             value="${escapeHtml(s.name)}" data-role="name">
      <input type="text" class="latlon-input" value="${formatLatLon(s.lat, s.lon)}"
             placeholder="${coordHint}" data-role="latlon">
      <input type="number" class="az-input" step="0.1" min="0" max="360"
             value="${s.azimuth}" data-role="azimuth">
      <span class="az-label">°</span>
      <span class="dist-label" title="${t('distTitle')}"></span>
    </div>`;
}

// Collapsed groups shrink to their header line so a screen full of groups
// still fits the panel; the header keeps the count and target visible.
function groupSummary(group) {
  const r = results.get(group.id);
  const n = activeStationsIn(group).length;
  if (r && r.target) return `${t('nPoints', { n })} · ${formatLatLon(r.target.lat, r.target.lon)}`;
  return t('nPoints', { n });
}

function renderGroupList() {
  const coordHint = t(state.coordOrder === 'lonlat' ? 'lonLat' : 'latLon');
  groupListEl.innerHTML = '';
  document.getElementById('btn-add-group').hidden = !state.multiGroup;
  document.getElementById('btn-copy-shot').hidden = !state.multiGroup;

  visibleGroups().forEach(group => {
    const card = document.createElement('div');
    // The collapse button lives in the header, which single-group mode hides —
    // rendering it collapsed there would leave no way to open it again. The
    // flag itself is kept, so returning to 多組別模式 restores the state.
    // Both flags belong to 多組別模式 only: single mode calculates the group
    // whatever the enabled flag says, and it hides the header holding the two
    // controls that set them — rendering either would leave no way back. The
    // flags stay in the data, so switching the mode on restores what was set.
    const collapsed = state.multiGroup && group.collapsed;
    const off = state.multiGroup && !group.enabled;
    card.className = 'group-card' + (state.multiGroup ? '' : ' single') +
      (off ? ' off' : '') + (collapsed ? ' collapsed' : '');
    card.dataset.groupId = group.id;
    card.innerHTML = `
      <div class="group-head">
        <button class="group-collapse" data-act="collapse"
                title="${t(collapsed ? 'expand' : 'collapse')}">${collapsed ? '▶' : '▼'}</button>
        <input type="checkbox" class="group-toggle" title="${t('toggleGroupTitle')}"
               ${group.enabled ? 'checked' : ''}>
        <span class="group-swatch" style="background:${groupColor(group)}"></span>
        <input type="text" class="group-name"
               placeholder="${t(state.multiGroup ? 'groupNamePlaceholder' : 'targetNamePlaceholder')}"
               value="${escapeHtml(group.name)}">
        <span class="group-summary">${escapeHtml(groupSummary(group))}</span>
        <button class="btn-delete" data-act="del-group" title="${t('delGroupTitle')}">✕</button>
      </div>
      <div class="group-body">
        ${group.stations.map(s => stationRowHtml(group, s, coordHint)).join('')}
        <div class="group-actions">
          <button class="btn-action" data-act="locate">${t('locate')}</button>
          <button class="btn-action" data-act="pick">${t('pick')}</button>
          <button class="btn-action" data-act="manual">${t('manual')}</button>
          <button class="btn-action danger" data-act="del-station"
                  title="${t('delTitle')}" disabled>${t('del')}</button>
          <button class="btn-action danger" data-act="clear">${t('clear')}</button>
        </div>
      </div>`;
    groupListEl.appendChild(card);
  });

  applySelection();  // rows were rebuilt, so restore the highlight and 刪除 state
  renderStationDistances();
  scheduleSave();
}

// Distance from each station to its group's target. Patched into the existing
// rows like the summaries are, so typing in a field never loses focus. Shown
// for excluded stations too — it is a geometric fact, not a calculation input,
// and the greyed-out row already says the station is not contributing.
function renderStationDistances() {
  state.groups.forEach(group => {
    const r = results.get(group.id);
    group.stations.forEach(s => {
      const el = groupListEl.querySelector(
        `[data-group-id="${group.id}"] [data-station-id="${s.id}"] .dist-label`);
      if (!el) return;
      el.textContent = r && r.target
        ? formatDistance(distanceMeters(s.lat, s.lon, r.target.lat, r.target.lon))
        : '';
    });
  });
}

// One delegated listener for the whole group list — the cards are rebuilt on
// every render, so per-element listeners would have to be rewired each time.
groupListEl.addEventListener('change', e => {
  const card = e.target.closest('.group-card');
  if (!card) return;
  const groupId = parseInt(card.dataset.groupId);
  const row = e.target.closest('.station-row');

  if (e.target.classList.contains('group-toggle')) {
    setGroupEnabled(groupId, e.target.checked);
  } else if (e.target.classList.contains('group-name')) {
    updateGroupName(groupId, e.target.value);
  } else if (e.target.classList.contains('station-toggle')) {
    setStationEnabled(groupId, parseInt(row.dataset.stationId), e.target.checked);
  } else if (row && e.target.dataset.role) {
    const stationId = parseInt(row.dataset.stationId);
    const value = e.target.value;
    if (e.target.dataset.role === 'latlon') updateStationLatLon(groupId, stationId, value);
    else if (e.target.dataset.role === 'name') updateStationName(groupId, stationId, value);
    else updateStationAzimuth(groupId, stationId, value);
  }
});

groupListEl.addEventListener('click', e => {
  const card = e.target.closest('.group-card');
  if (!card) return;
  const groupId = parseInt(card.dataset.groupId);
  const row = e.target.closest('.station-row');
  const act = e.target.closest('[data-act]');

  // Touching a row anywhere makes it the one 刪除 acts on.
  if (row) selectStation(groupId, parseInt(row.dataset.stationId), false);

  if (e.target.classList.contains('station-badge')) {
    focusStation(stationKey(groupId, parseInt(row.dataset.stationId)));
    return;
  }
  if (!act) return;
  switch (act.dataset.act) {
    case 'collapse':    toggleGroupCollapsed(groupId); break;
    case 'del-group':   confirmDeleteGroup(groupId); break;
    case 'del-station':
      if (_selected && _selected.groupId === groupId) {
        deleteStation(groupId, _selected.stationId);
      }
      break;
    case 'locate':      locateInto(groupId); break;
    case 'pick':        enablePickMode(({ lat, lon }) => openAzPopup(groupId, lat, lon)); break;
    case 'manual':      openManualForm(groupId); break;
    case 'clear':       confirmClearGroup(groupId); break;
  }
});

// Tabbing or tapping into a field selects its row too, so 刪除 always acts on
// the row the user is actually working in.
groupListEl.addEventListener('focusin', e => {
  const row = e.target.closest('.station-row');
  if (!row) return;
  selectStation(parseInt(row.closest('.group-card').dataset.groupId),
    parseInt(row.dataset.stationId), false);
});

document.getElementById('btn-add-group').addEventListener('click', () => addGroup());

// Registered here, not up in the Language section: everything above the DOM
// refs block runs before those consts exist.
// Switching language moves to that language's page rather than swapping strings
// in place, so the address bar always matches what is on screen and a shared
// link opens in the language the sender saw. Relative targets keep this working
// on a project Pages path and on a local server alike. The survey survives the
// reload through localStorage, but the pending debounced write would not.
btnLangEl.addEventListener('click', () => {
  saveState();
  savePins();   // recorded points are debounced too, and on their own key
  location.href = currentLang() === 'tw' ? 'en/' : '../';
});

swDark.addEventListener('click', () => {
  darkMode = !isDark();  // first touch turns the system default into a choice
  try { localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light'); } catch (e) { /* not fatal */ }
  applyTheme();
});

// ── 多組別模式 toggle ──────────────────────────────────────────────────────

function updateMultiGroupUI() {
  swMultiGroup.classList.toggle('on', state.multiGroup);
  swMultiGroup.setAttribute('aria-checked', String(state.multiGroup));
}

function updateTimeSeriesUI() {
  swTimeSeries.classList.toggle('on', state.timeSeries);
  swTimeSeries.setAttribute('aria-checked', String(state.timeSeries));
  // The interval and the share button only mean anything while the mode is on,
  // so they appear with it rather than sitting there inert.
  tsIntervalCol.hidden = !state.timeSeries;
  tsShareCol.hidden = !state.timeSeries;
  tsIntervalEl.value = String(state.tsInterval);
  // Shown but greyed with nothing to share, rather than appearing and
  // disappearing as points come and go.
  tsShareBtn.disabled = !pins.length;
  setSweepEnabled(pins.length > 0);
}

tsShareBtn.addEventListener('click', async () => {
  if (!pins.length) { showError(t('tsShareNone')); return; }
  const url = tsShareUrl();
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: t('tsShare'), url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;  // user dismissed the share sheet
    }
  }
  if (await copyText(url)) flashButton(tsShareBtn, t('copiedLink'), t('tsShareBtn'));
  else showError(t('errCopyLink'));
});

tsIntervalEl.addEventListener('change', () => {
  state.tsInterval = Number(tsIntervalEl.value) || 30;
  scheduleSettle();   // the fix in hand follows the new setting straight away
  scheduleSave();
});

swTimeSeries.addEventListener('click', () => {
  state.timeSeries = !state.timeSeries;
  updateTimeSeriesUI();
  // Switching on starts a fresh record rather than reopening whatever was
  // last written, so the points either side of the gap stay distinct.
  recIds.clear();
  if (state.timeSeries) recordFixes();
  scheduleSave();
});

swMultiGroup.addEventListener('click', () => {
  state.multiGroup = !state.multiGroup;
  updateMultiGroupUI();
  renderGroupList();
  updateDeclinationDisplay();
  recalculate();
});

// ── Map ↔ list selection ────────────────────────────────────────────────────
// Clicking a station marker/line on the map highlights the matching row in
// the list; clicking a row's badge pans the map to that station and opens
// its popup. Station numbers repeat across groups, so markers are keyed by
// both ids.
function stationKey(groupId, stationId) {
  return `${groupId}:${stationId}`;
}

function selectStation(groupId, stationId, scroll) {
  _selected = { groupId, stationId };
  applySelection();
  if (scroll !== false) {
    const row = stationRowEl(groupId, stationId);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function stationRowEl(groupId, stationId) {
  return groupListEl.querySelector(
    `[data-group-id="${groupId}"] [data-station-id="${stationId}"]`);
}

// Re-applied after every render, since the rows are rebuilt each time.
function applySelection() {
  if (_selected && !findStation(_selected.groupId, _selected.stationId)) _selected = null;
  groupListEl.querySelectorAll('.station-row').forEach(row => row.classList.remove('active'));
  if (_selected) {
    const row = stationRowEl(_selected.groupId, _selected.stationId);
    if (row) row.classList.add('active');
  }
  groupListEl.querySelectorAll('.group-card').forEach(card => {
    const btn = card.querySelector('[data-act="del-station"]');
    if (btn) btn.disabled = !_selected || _selected.groupId !== parseInt(card.dataset.groupId);
  });
}

// ── Adding stations: manual form, map pick, locate ────────────────────────
// All three flows are shared by every group, so they remember which group
// asked. The manual form is a single element moved under the asking group.
let _formGroupId = null;
let _pendingPick = null;

const manualFormEl = document.getElementById('manual-form');

function openManualForm(groupId) {
  const card = groupListEl.querySelector(`[data-group-id="${groupId}"] .group-body`);
  if (!card) return;
  const reopening = manualFormEl.hidden || _formGroupId !== groupId;
  card.appendChild(manualFormEl);
  manualFormEl.hidden = !reopening;
  _formGroupId = reopening ? groupId : null;
  if (reopening) {
    updateCoordUI();  // refresh placeholder
    document.getElementById('input-latlon').focus();
  }
}

document.getElementById('btn-manual-cancel').addEventListener('click', () => {
  manualFormEl.hidden = true;
  _formGroupId = null;
});

document.getElementById('btn-manual-confirm').addEventListener('click', confirmManual);

document.getElementById('input-az').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmManual();
});

function confirmManual() {
  if (_formGroupId == null) return;
  const latlonStr = document.getElementById('input-latlon').value;
  const az = parseFloat(document.getElementById('input-az').value);
  const parsed = parseLatLon(latlonStr);

  if (!parsed) {
    const ex = t(state.coordOrder === 'lonlat' ? 'egLonLat' : 'egLatLon');
    showError(t('errBadCoord', { eg: ex }));
    return;
  }
  if (isNaN(az) || az < 0 || az > 360) {
    showError(t('errBadBearing'));
    return;
  }

  hideError();
  manualFormEl.hidden = true;
  document.getElementById('input-latlon').value = '';
  document.getElementById('input-az').value = '';
  const groupId = _formGroupId;
  _formGroupId = null;
  addStation(groupId, parsed.lat, parsed.lon, az);
}

function openAzPopup(groupId, lat, lon) {
  _pendingPick = { groupId, lat, lon };
  azPopupCoordsEl.textContent = formatLatLon(lat, lon);
  azPopupInputEl.value = '';
  azPopupInputEl.style.borderColor = '';
  azPopupEl.hidden = false;
  azPopupInputEl.focus();
}

// Locate me: add an observation point at the device's GPS position.
function locateInto(groupId) {
  const btn = groupListEl.querySelector(`[data-group-id="${groupId}"] [data-act="locate"]`);
  if (!navigator.geolocation) {
    showError(t('errNoGeo'));
    return;
  }
  hideError();
  btn.disabled = true;
  btn.textContent = t('locating');
  const restore = () => { btn.disabled = false; btn.textContent = t('locate'); };
  navigator.geolocation.getCurrentPosition(
    pos => {
      restore();
      const { latitude, longitude } = pos.coords;
      centerMap(latitude, longitude, 15);
      openAzPopup(groupId, latitude, longitude);
    },
    err => {
      restore();
      const msgs = {
        1: t('errGeoDenied'),
        2: t('errGeoUnavailable'),
        3: t('errGeoTimeout'),
      };
      showError(msgs[err.code] || t('errGeoOther', { msg: err.message }));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

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
  const { groupId, lat, lon } = _pendingPick;
  _pendingPick = null;
  addStation(groupId, lat, lon, az);
}

// ── Destructive actions: clear a group, delete a group ────────────────────
const confirmPopupEl   = document.getElementById('confirm-popup');
const confirmMsgEl     = document.getElementById('confirm-popup-msg');
const confirmOkBtn     = document.getElementById('confirm-popup-ok');
const confirmCancelBtn = document.getElementById('confirm-popup-cancel');
let _confirmAction = null;

function askConfirm(msg, okLabel, action) {
  confirmMsgEl.textContent = msg;
  confirmOkBtn.textContent = okLabel;
  _confirmAction = action;
  confirmPopupEl.hidden = false;
  confirmCancelBtn.focus();  // destructive action must not be one stray Enter away
}

function confirmClearGroup(groupId) {
  const g = findGroup(groupId);
  if (!g || !g.stations.length) return;
  askConfirm(t('confirmClear', { g: groupLabel(g), n: g.stations.length }), t('confirmClearOk'), () => {
    g.stations = [];
    g.nextStationId = 1;
    recIds.delete(groupId);   // the next fix is a new one, not this one moved
    renderGroupList();
    updateDeclinationDisplay();
    recalculate();
  });
}

function confirmDeleteGroup(groupId) {
  const g = findGroup(groupId);
  if (!g) return;
  if (!g.stations.length) { deleteGroup(groupId); return; }
  askConfirm(t('confirmDelGroup', { g: groupLabel(g), n: g.stations.length }),
    t('confirmDelOk'), () => deleteGroup(groupId));
}

function closeConfirm() {
  confirmPopupEl.hidden = true;
  _confirmAction = null;
}

confirmOkBtn.addEventListener('click', () => {
  const action = _confirmAction;
  closeConfirm();
  if (action) action();
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
// Every checked group is solved on its own: its own bearing lines, its own
// target, its own minimum angle. Nothing crosses between groups.
//
// Solving and drawing are separate so the per-group snapshot can redraw the
// map with one group's overlays only, without recomputing anything.
function solveGroup(group) {
  const active = activeStationsIn(group);
  if (active.length === 0) return null;

  let stations = active;
  if (state.northMode === 'magnetic') {
    try {
      stations = applyMagneticCorrection(active, state.date || todayISO());
    } catch (e) {
      return { error: t('errDecl', { msg: e.message }), stations, lineLength: 0 };
    }
  }

  const lineLength = computeLineLength(stations);
  if (active.length < 2) {
    return { error: t('errNeedTwo'), stations, lineLength };
  }

  try {
    const result = calculateTarget(stations, {
      lineAlgorithm: state.lineAlgorithm,
      estimator: state.estimator,
    });
    return Object.assign(result, { stations, lineLength });
  } catch (e) {
    // core.js reports a message key plus the station ids, never prose.
    return { error: e.key ? t(e.key, { a: e.a, b: e.b }) : e.message, stations, lineLength };
  }
}

// Draws the given groups' overlays, replacing whatever was on the map.
function drawGroups(groups) {
  clearOverlays();
  groups.forEach(group => {
    const r = results.get(group.id);
    if (!r) return;
    activeStationsIn(group).forEach((s, idx) => {
      const color = stationColorOf(group, s);
      const nameHtml = s.name ? escapeHtml(s.name) : '';
      // In magnetic mode show this point's own declination — it differs from
      // the next observer's, and the panel can only show one figure or a span.
      const azLine = state.northMode === 'magnetic'
        ? `<br>${t('popupBearing')}：${r.stations[idx].azimuth.toFixed(1)}°${t('popupTrueSuffix')}` +
          '<br>' + t('popupMagLine', { mag: s.azimuth.toFixed(1),
            dec: formatDec(geoMag(s.lat, s.lon, 0, surveyDate()).dec) })
        : `<br>${t('popupBearing')}：${r.stations[idx].azimuth.toFixed(1)}°`;
      const info = `<b>${escapeHtml(groupLabel(group))} #${s.id}` +
        `${nameHtml ? ' ' + nameHtml : ''}</b>` +
        `<br>${t('popupCoord')}：${formatLatLon(s.lat, s.lon)}` + azLine;
      const key = stationKey(group.id, s.id);
      drawStation(s.lat, s.lon, `#${s.id}`, color, key, info, onMarkerSelect, nameHtml);
      drawBearingLine(s.lat, s.lon, r.stations[idx].azimuth, r.lineLength, color, key, info, onMarkerSelect);
    });
    if (!r.target) return;
    // Unnamed single-group mode leaves the cross uncaptioned — there is
    // nothing to tell it apart from.
    drawTarget(r.target.lat, r.target.lon, escapeHtml(targetLabel(group)));
    r.pairIntersections.forEach(p => drawIntersection(p.lat, p.lon));
  });
}

function recalculate() {
  hideError();
  results.clear();
  activeGroups().forEach(group => {
    const r = solveGroup(group);
    if (r) results.set(group.id, r);
  });
  drawGroups(activeGroups());
  fitToPoints(fitPoints());
  if (state.timeSeries && !_suppressRecord) recordFixes();
  renderResults();
  renderGroupSummaries();
  renderStationDistances();
  scheduleSave();
}

// The map keys markers by "groupId:stationId"; unpack it to sync the list.
function onMarkerSelect(key) {
  const [groupId, stationId] = String(key).split(':').map(Number);
  selectStation(groupId, stationId);
}

// Keep the collapsed-group headers showing the current point count and target
// without rebuilding the whole list (which would drop input focus).
function renderGroupSummaries() {
  state.groups.forEach(group => {
    const el = groupListEl.querySelector(`[data-group-id="${group.id}"] .group-summary`);
    if (el) el.textContent = groupSummary(group);
  });
}

function renderResults() {
  resultListEl.innerHTML = '';
  const groups = activeGroups().filter(g => activeStationsIn(g).length > 0);
  // Unnamed single-group mode reads like it did before groups existed.
  const head = (g) => state.multiGroup
    ? `<span class="group-swatch" style="background:${groupColor(g)}"></span>
       <span class="result-label">${escapeHtml(groupLabel(g))}</span>`
    : `<span class="result-label">${escapeHtml(g.name || t('target'))}</span>`;

  groups.forEach(group => {
    const r = results.get(group.id);
    const block = document.createElement('div');
    block.className = 'result-group';
    block.dataset.groupId = group.id;

    if (!r || !r.target) {
      block.innerHTML = `
        <div class="result-row">
          ${head(group)}
          <span class="result-value muted">${escapeHtml(r && r.error ? r.error : '—')}</span>
        </div>`;
      resultListEl.appendChild(block);
      return;
    }

    const minA = r.minAcuteAngle;
    const warn = minA.value < 30;
    // The coordinate is still given; only the map declines to follow it there.
    const outside = !inMapArea(r.target.lat, r.target.lon)
      ? `<div class="result-sub"><span class="result-value warn">${t('outsideArea')}</span></div>`
      : '';
    block.innerHTML = `
      <div class="result-row">
        ${head(group)}
        <span class="result-value">${formatLatLon(r.target.lat, r.target.lon)}</span>
      </div>
      ${outside}
      <div class="result-sub">
        <span class="result-label">${t('minAngle')}</span>
        <span class="result-value${warn ? ' warn' : ''}">
          ${minA.value.toFixed(1)}° (#${minA.stationPair[0]}–#${minA.stationPair[1]})${warn ? t('angleWarn') : ''}
        </span>
        <button class="link-btn" data-act="angles">${t(group.showAngles ? 'hideAngles' : 'allAngles')}</button>
      </div>
      <div class="all-angles"${group.showAngles ? '' : ' hidden'}>
        <table><tbody>${r.allPairAngles
          .map(p => `<tr><td>#${p.stations[0]}–#${p.stations[1]}</td><td>${p.angle.toFixed(1)}°</td></tr>`)
          .join('')}</tbody></table>
      </div>
      <div class="result-actions-row">
        <button class="btn-result-action" data-act="copy">${t('copyCoord')}</button>
        <button class="btn-result-action" data-act="share">${t('share')}</button>
        <button class="btn-result-action" data-act="shot">${t('snapshot')}</button>
      </div>`;
    resultListEl.appendChild(block);
  });

  if (!groups.length) {
    resultListEl.innerHTML = '<div class="result-row"><span class="result-value muted">—</span></div>';
  }
  // 截圖所有組別 covers every checked group, so one solved group is enough.
  document.getElementById('btn-copy-shot').disabled = !groups.length;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showError(msg) {
  errorBannerEl.classList.remove('notice');
  errorBannerEl.textContent = msg;
  errorBannerEl.hidden = false;
}

// A merge succeeding is news, not a fault — same banner, but it should not sit
// there in alarm colours, and it clears itself rather than needing dismissal.
function showNotice(msg) {
  errorBannerEl.classList.add('notice');
  errorBannerEl.textContent = msg;
  errorBannerEl.hidden = false;
  setTimeout(() => {
    if (errorBannerEl.classList.contains('notice')) hideError();
  }, 5000);
}

function hideError() {
  errorBannerEl.hidden = true;
  errorBannerEl.classList.remove('notice');
}
