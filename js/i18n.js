// 無線電追蹤三角定位工具 — i18n.js — TW / EN strings
//
// tw = 台灣版：繁體中文介面，地圖鎖在台灣與周邊海域。
// en = international: English UI, the whole world.
//
// Placeholders are {name}; t('key', {name: value}) fills them in.

'use strict';

const STRINGS = {
  tw: {
    // ── App shell ──
    docTitle: 'Triangulation：野生動物 VHF 定位工具',
    appName: 'Triangulation：',
    appDesc: '野生動物 VHF 定位工具',
    metaDesc: 'Triangulation：野生動物 VHF 定位工具。輸入各觀測點的座標與方位角，自動交會計算目標位置，並在地圖上顯示方位線與交會點。支援真北／磁北、平面／Geodesic 交會、Centroid／MLE 估算。',
    backHome: '返回 Field-Box 首頁',
    report: '回報問題',
    visits: '總造訪次數',
    language: '語言',
    langTitle: '切換語言 / Switch language',

    // ── Settings ──
    north: '北向',
    trueNorth: '真北',
    magNorth: '磁北',
    date: '日期',
    decl: '偏角',
    coordOrder: '座標輸入順序',
    latLon: '緯,經',
    lonLat: '經,緯',
    lineAlgo: '交會算法',
    planar: '平面',
    estimator: '估算器',
    multiGroup: '多組別模式',
    darkMode: '深色模式',

    // ── Stations ──
    stations: '觀測點',
    snapshotAll: '📸 截圖所有組別',
    addGroup: '＋ 新增一組',
    groupNamePlaceholder: '目標名稱',
    targetNamePlaceholder: '目標名稱',
    timeSeries: '時間序列模式',
    timeSeriesTitle: '開啟後每次定位都會記錄在地圖上，最多保留 20 點',
    tsInterval: '更新間隔',
    legendShared: '（他人分享）',
    legendUnnamed: '未命名',
    tsIntervalTitle: '停止變動多久之後，這次定位就算完成；在這之前微調只會移動同一個點',
    tsShare: '分享追蹤目標',
    tsShareBtn: '分享追蹤目標',
    tsShareTitle: '產生一條含目前所有記錄點的連結；對方開啟後會併入他的地圖，不會覆蓋他原有的點或設定',
    tsShareNone: '目前沒有記錄點可以分享',
    tsMerged: '已併入 {n} 個記錄點',
    tsMergedNone: '連結中的記錄點你已經有了',
    secShort: '{n} 秒',
    minShort: '{n} 分',
    pinClearTitle: '刪除記錄點（可選全部或單一個體）',
    pinClearOk: '確定刪除',
    pinClearAll: '清空全部',
    confirmClearSeries: '確定要刪除「{g}」的 {n} 個記錄點？其他個體與設定不受影響。',
    tsTooManyDevices: '最多只能同時顯示 {max} 個人的記錄（含自己）。請先清掉一個個體再匯入。',
    confirmClearPins: '確定要刪除地圖上全部 {n} 個時間序列記錄點？測站與設定不受影響。',
    distTitle: '此測站到目標的距離',
    namePlaceholder: '名稱',
    nameTitle: '名稱（選填）',
    toggleStationTitle: '取消勾選即從地圖與計算中排除',
    toggleGroupTitle: '取消勾選即從地圖與計算中排除整組',
    badgeTitle: '在地圖上定位這一站',
    expand: '展開',
    collapse: '收合',
    delGroupTitle: '刪除整組',
    locate: '📍 定位',
    locating: '定位中…',
    pick: '＋ 地圖點選',
    manual: '＋ 手動新增',
    del: '刪除',
    delTitle: '刪除選取的觀測點',
    clear: '清空',
    coordLabel: '座標',
    bearingLabel: '方位角°',
    bearingPrompt: '方位角（0–360°）',
    ok: '確認',
    cancel: '取消',
    egLatLon: '例：24.0, 120.5',
    egLonLat: '例：120.5, 24.0',
    nPoints: '{n} 點',
    groupN: '組{n}',

    // ── Results ──
    result: '結果',
    target: '目標座標',
    minAngle: '最小銳角',
    angleWarn: ' ⚠ 夾角過小',
    allAngles: '▼ 全部夾角',
    hideAngles: '▲ 收合夾角',
    copyCoord: '📋 複製座標',
    share: '🔗 位置分享',
    snapshot: '📸 複製截圖',
    copied: '✓ 已複製',
    copiedLink: '✓ 已複製鏈接',
    copiedShot: '✓ 已複製截圖',
    downloaded: '✓ 已下載圖片',
    generating: '產生中…',
    outsideArea: '⚠ 交點落在台灣範圍外',

    // ── Help ──
    helpOpen: '❓ 使用說明 ▶',
    helpClose: '❓ 使用說明 ▼',
    helpNorthT: '真北 / 磁北',
    helpNorthD: '方位角基準。真北＝地圖北；磁北＝羅盤北。選磁北時需輸入日期，系統依各觀測點位置分別換算磁偏角，旁邊顯示範圍。',
    helpOrderT: '緯,經 / 經,緯',
    helpOrderD: '座標輸入順序。台灣常用「緯度, 經度」（如 24.0, 120.5）；部分 GPS 設備輸出「經度, 緯度」。',
    helpAlgoT: '平面 / Geodesic',
    helpAlgoD: '平面法：緯經視為 XY，速度快，＜100 km 誤差小。Geodesic：球面大圓交會，長距離更準確。',
    helpMultiT: '多組別模式',
    helpMultiD: '同時追蹤多個目標。每一組就是一個目標，組別名稱即目標名稱，各自有自己的觀測點與交會結果。關閉時只留一組，操作與沒有組別時相同。',
    helpTsT: '時間序列模式',
    helpTsD: '把每次定位結果留在地圖上，看得出目標的移動。每台裝置最多保留 20 點、最多 5 個人（含自己），超過時擠掉自己最舊的。停止調整達「更新間隔」後這次定位才算完成，在那之前微調只會移動同一個點。「分享追蹤目標」產生的連結只含記錄點，對方開啟後併入他的地圖，不會覆蓋他原有的點或設定。',
    helpEstT: 'Centroid / MLE',
    helpEstD: 'Centroid：所有交點平均，計算簡單但易受離群值影響。MLE（最大概似估計）：對方位誤差加權，精度較高。',

    // ── Errors ──
    errNeedTwo: '至少需要 2 個觀測點',
    errParallel: '觀測點 #{a} 與 #{b} 的方位線近乎平行，無法定位',
    errNoIntersection: '觀測點 #{a} 與 #{b} 的方位線無有效交會，請檢查角度',
    errDecl: '磁偏角計算失敗：{msg}',
    errBadCoord: '請輸入有效座標，例：{eg}',
    errBadBearing: '請輸入有效的方位角（0–360°）',
    errNoGeo: '此瀏覽器不支援定位功能',
    errGeoDenied: '定位權限被拒絕，請在瀏覽器設定中允許存取位置',
    errGeoUnavailable: '無法取得位置訊號，請確認 GPS 已開啟',
    errGeoTimeout: '定位逾時，請再試一次',
    errGeoOther: '定位失敗：{msg}',
    errCopy: '無法複製，請手動選取座標',
    errCopyLink: '無法複製鏈接，請手動選取座標後自行分享',
    errShot: '截圖失敗：{msg}',
    errNoImage: '無法產生圖片',
    notEnough: '觀測點不足',

    // ── Confirm dialogs ──
    confirmClear: '確定要清空「{g}」的 {n} 個觀測點嗎？',
    confirmClearOk: '確定清空',
    confirmDelGroup: '確定要刪除「{g}」整組（含 {n} 個觀測點）嗎？',
    confirmDelOk: '確定刪除',

    // ── Map ──
    fitTitle: '縮放到剛好看得見全部觀測點與目標',
    popupCoord: '座標',
    popupBearing: '方位角',
    popupTrueSuffix: '（真北）',
    popupMagLine: '磁北 {mag}°，偏角 {dec}',
    popupTarget: '目標',

    // ── Snapshot ──
    snapStations: '觀測點（{order}）',
    snapBearing: '方位角',
    shareTitle: '三角定位結果 {g}',
    shareText: '{g} 目標座標 {c}',
  },

  en: {
    docTitle: 'Triangulation: for wildlife VHF radio tracking',
    appName: 'Triangulation:',
    appDesc: 'for wildlife VHF radio tracking',
    metaDesc: 'Triangulation: for wildlife VHF radio tracking. Enter each station’s coordinates and bearing; the bearings are intersected on a map to estimate the target position. True or magnetic north, planar or geodesic intersection, centroid or MLE estimator.',
    backHome: 'Back to Field-Box',
    report: 'Report an issue',
    visits: 'Visits',
    language: 'Language',
    langTitle: '切換語言 / Switch language',

    north: 'North',
    trueNorth: 'True',
    magNorth: 'Magnetic',
    date: 'Date',
    decl: 'Decl.',
    coordOrder: 'Coordinate order',
    latLon: 'Lat,Lon',
    lonLat: 'Lon,Lat',
    lineAlgo: 'Intersection',
    planar: 'Planar',
    estimator: 'Estimator',
    multiGroup: 'Multi-group',
    darkMode: 'Dark mode',

    stations: 'Stations',
    snapshotAll: '📸 Snapshot all',
    addGroup: '＋ Add group',
    groupNamePlaceholder: 'Target name',
    targetNamePlaceholder: 'Target name',
    timeSeries: 'Time series',
    timeSeriesTitle: 'Records every fix on the map, keeping the latest 20.',
    tsInterval: 'Interval',
    legendShared: '(shared)',
    legendUnnamed: 'Unnamed',
    tsIntervalTitle: 'How long a fix must sit unchanged before it is committed; until then, tuning moves the same point.',
    tsShare: 'Share track',
    tsShareBtn: 'Share track',
    tsShareTitle: 'Makes a link holding every recorded point. Opening it merges them into the other map without replacing their points or settings.',
    tsShareNone: 'No recorded points to share yet',
    tsMerged: 'Merged {n} recorded points',
    tsMergedNone: 'You already have every point in that link',
    secShort: '{n}s',
    minShort: '{n}m',
    pinClearTitle: 'Delete recorded points — all, or one individual',
    pinClearOk: 'Delete',
    pinClearAll: 'Clear everything',
    confirmClearSeries: 'Delete the {n} recorded points for “{g}”? Other individuals and your settings are untouched.',
    tsTooManyDevices: 'At most {max} people’s records can share the map, your own included. Clear one individual first.',
    confirmClearPins: 'Delete all {n} recorded points from the map? Stations and settings are untouched.',
    distTitle: 'Distance from this station to the target',
    namePlaceholder: 'Name',
    nameTitle: 'Name (optional)',
    toggleStationTitle: 'Uncheck to drop this station from the map and the fix',
    toggleGroupTitle: 'Uncheck to drop the whole group from the map and the fix',
    badgeTitle: 'Show this station on the map',
    expand: 'Expand',
    collapse: 'Collapse',
    delGroupTitle: 'Delete this group',
    locate: '📍 Locate',
    locating: 'Locating…',
    pick: '＋ Pick on map',
    manual: '＋ Add manually',
    del: 'Delete',
    delTitle: 'Delete the selected station',
    clear: 'Clear',
    coordLabel: 'Coordinates',
    bearingLabel: 'Bearing°',
    bearingPrompt: 'Bearing (0–360°)',
    ok: 'OK',
    cancel: 'Cancel',
    egLatLon: 'e.g. 24.0, 120.5',
    egLonLat: 'e.g. 120.5, 24.0',
    nPoints: '{n} pts',
    groupN: 'Group {n}',

    result: 'Result',
    target: 'Target',
    minAngle: 'Min angle',
    angleWarn: ' ⚠ angle too small',
    allAngles: '▼ All angles',
    hideAngles: '▲ Hide angles',
    copyCoord: '📋 Copy',
    share: '🔗 Share',
    snapshot: '📸 Snapshot',
    copied: '✓ Copied',
    copiedLink: '✓ Link copied',
    copiedShot: '✓ Snapshot copied',
    downloaded: '✓ Image saved',
    generating: 'Working…',
    outsideArea: '⚠ Fix lies outside Taiwan',

    helpOpen: '❓ Help ▶',
    helpClose: '❓ Help ▼',
    helpNorthT: 'True / Magnetic north',
    helpNorthD: 'Bearing reference. True = map north; magnetic = compass north. In magnetic mode enter the date; declination is computed for each station’s own position and the range is shown beside it.',
    helpOrderT: 'Lat,Lon / Lon,Lat',
    helpOrderD: 'Coordinate input order. Most handhelds give latitude first (24.0, 120.5); some GPS units output longitude first.',
    helpAlgoT: 'Planar / Geodesic',
    helpAlgoD: 'Planar treats lat/lon as XY: fast, and accurate enough under 100 km. Geodesic intersects great circles and is better over long distances.',
    helpMultiT: 'Multiple targets',
    helpMultiD: 'Track several targets at once. Each group is one target — the group name is the target name — with its own stations and its own fix. Switched off, a single group remains and the app behaves as it did before groups existed.',
    helpTsT: 'Time series',
    helpTsD: 'Keeps every fix on the map so a movement is visible. Each device keeps its latest 20 points and at most 5 people share a map, your own records included; beyond that a device drops its own oldest. A fix is committed once it has sat unchanged for the chosen interval; until then, tuning moves the same point. Share track makes a link holding only the recorded points: opening it merges them into the other map without replacing their points or settings.',
    helpEstT: 'Centroid / MLE',
    helpEstD: 'Centroid averages every pairwise intersection — simple, but sensitive to outliers. MLE weights by bearing error and is generally more accurate.',

    errNeedTwo: 'At least 2 stations are needed',
    errParallel: 'Bearings from #{a} and #{b} are nearly parallel — no fix possible',
    errNoIntersection: 'Bearings from #{a} and #{b} do not intersect — check the angles',
    errDecl: 'Declination failed: {msg}',
    errBadCoord: 'Enter a valid coordinate, {eg}',
    errBadBearing: 'Enter a valid bearing (0–360°)',
    errNoGeo: 'This browser does not support geolocation',
    errGeoDenied: 'Location permission denied — allow location access in your browser settings',
    errGeoUnavailable: 'No position signal — check that GPS is on',
    errGeoTimeout: 'Location timed out — try again',
    errGeoOther: 'Location failed: {msg}',
    errCopy: 'Could not copy — select the coordinate by hand',
    errCopyLink: 'Could not copy the link — select the coordinate and share it yourself',
    errShot: 'Snapshot failed: {msg}',
    errNoImage: 'Could not produce an image',
    notEnough: 'Not enough stations',

    confirmClear: 'Clear the {n} stations in “{g}”?',
    confirmClearOk: 'Clear',
    confirmDelGroup: 'Delete “{g}” and its {n} stations?',
    confirmDelOk: 'Delete',

    fitTitle: 'Zoom to fit every station and target',
    popupCoord: 'Coordinates',
    popupBearing: 'Bearing',
    popupTrueSuffix: ' (true N)',
    popupMagLine: 'Magnetic {mag}°, declination {dec}',
    popupTarget: 'Target',

    snapStations: 'Stations ({order})',
    snapBearing: 'Bearing',
    shareTitle: 'Triangulation result {g}',
    shareText: '{g} target {c}',
  },
};

// Taiwan version keeps the map over Taiwan and its surrounding waters —
// generous enough to reach 金門, 馬祖, 澎湖, 蘭嶼 and open sea, so comparing an
// offshore bearing still works.
const TW_BOUNDS = { south: 20.5, west: 117.5, north: 26.5, east: 123.5 };

let lang = 'tw';

function t(key, vars) {
  const table = STRINGS[lang] || STRINGS.tw;
  let s = table[key];
  if (s == null) s = STRINGS.tw[key];
  if (s == null) return key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

function currentLang() {
  return lang;
}

function setLang(next) {
  lang = STRINGS[next] ? next : 'tw';
}

// Elements carry data-i18n (text), data-i18n-title or data-i18n-placeholder.
function applyStaticStrings() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-TW';
  document.title = t('docTitle');

  // Link-preview crawlers read the served HTML and never run this, so the
  // markup keeps the Traditional Chinese defaults; this only keeps the live
  // DOM consistent for anything reading the page after load.
  const meta = (sel, value) => {
    const el = document.querySelector(sel);
    if (el) el.content = value;
  };
  meta('meta[name="description"]', t('metaDesc'));
  meta('meta[property="og:title"]', t('docTitle'));
  meta('meta[property="og:description"]', t('metaDesc'));
  meta('meta[property="og:locale"]', lang === 'en' ? 'en_US' : 'zh_TW');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(el.dataset.i18nTitle));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
