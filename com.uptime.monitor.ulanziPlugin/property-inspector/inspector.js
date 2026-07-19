let ACTION_SETTING = {};
let form = null;

// localized status labels pushed to the key
let LABELS = { up: 'UP', slow: 'SLOW', down: 'DOWN', checking: 'CHECK', uptime: 'uptime', waiting: 'waiting…', pausedLabel: 'PAUSED' };
// localized notification title + messages pushed to the backend
let NOTIFY = { notifyTitle: 'Uptime Monitor', msgDown: '{host} is down', msgUp: '{host} is back online' };

// mirror of backend THEMES (for swatches + live preview)
const THEMES = {
  midnight: { bg: '#0b1020', up: '#22c55e', slow: '#f59e0b', down: '#ef4444', track: '#1e293b', text: '#e2e8f0', muted: '#64748b' },
  carbon:   { bg: '#0a0a0a', up: '#34d399', slow: '#fbbf24', down: '#f87171', track: '#1f1f1f', text: '#f5f5f5', muted: '#737373' },
  ocean:    { bg: '#011627', up: '#2ec4b6', slow: '#ff9f1c', down: '#e71d36', track: '#0a2a3a', text: '#cde7f0', muted: '#5b7a8a' },
  grape:    { bg: '#1a1030', up: '#4ade80', slow: '#fb923c', down: '#fb7185', track: '#2e1f4a', text: '#ede9fe', muted: '#8b7aa8' },
  slate:    { bg: '#0f172a', up: '#10b981', slow: '#f97316', down: '#ef4444', track: '#243049', text: '#f8fafc', muted: '#6b7a90' },
  mono:     { bg: '#000000', up: '#ffffff', slow: '#bbbbbb', down: '#ff4d4d', track: '#222222', text: '#ffffff', muted: '#888888' },
  paper:    { bg: '#f5f7fa', up: '#16a34a', slow: '#ea580c', down: '#dc2626', track: '#dde3ea', text: '#0f172a', muted: '#64748b' },
  snow:     { bg: '#ffffff', up: '#15803d', slow: '#b45309', down: '#b91c1c', track: '#e5e7eb', text: '#111827', muted: '#6b7280' },
  daylight: { bg: '#eef4ff', up: '#0284c7', slow: '#d97706', down: '#dc2626', track: '#d6e4f5', text: '#0b1e33', muted: '#5b7088' },
  sand:     { bg: '#fbf6ec', up: '#2f855a', slow: '#c05621', down: '#c53030', track: '#ece1cd', text: '#3b2f1e', muted: '#8a7a5f' }
};

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function prettyHost(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch (e) { return (url || 'example.com').replace(/^https?:\/\//i, '').split('/')[0] || 'example.com'; }
}

$UD.connect('com.uptime.monitor.deck.monitor');

$UD.onConnected(() => {
  form = document.querySelector('#property-inspector');
  document.querySelector('.udpi-wrapper').classList.remove('hidden');

  buildSwatches();
  buildSeg();
  buildTypeSeg();

  form.addEventListener('input', Utils.debounce(collectAndSend, 200));
  // selects/hidden don't always fire input in the webview
  ['intervalSec', 'warnMs', 'timeoutMs', 'url', 'notify', 'paused',
   'method', 'keywordMode', 'okCodes', 'keyword', 'header', 'basicAuth', 'sslWarnDays', 'webhookUrl', 'repeatAlertMin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', collectAndSend);
  });

  document.getElementById('btn-check').addEventListener('click', () => {
    $UD.sendParamFromPlugin({ forceCheck: Date.now() });
    pulseButton();
  });
  document.getElementById('btn-tutorial').addEventListener('click', () => {
    const lang = $UD.language || 'en';
    $UD.openUrl('./property-inspector/tutorial.html#lang=' + lang, true);
  });

  startPreviewLoop();
  loadTranslations();
});

// ── theme swatches ────────────────────────────────────────────────────────────
function buildSwatches() {
  const wrap = document.getElementById('theme-swatches');
  wrap.innerHTML = '';
  Object.keys(THEMES).forEach(name => {
    const tm = THEMES[name];
    const el = document.createElement('div');
    el.className = 'theme-swatch';
    el.dataset.theme = name;
    el.title = name;
    el.innerHTML = `<i style="background:${tm.bg}"></i><i style="background:${tm.up}"></i><i style="background:${tm.slow}"></i><i style="background:${tm.down}"></i>`;
    el.addEventListener('click', () => selectTheme(name));
    wrap.appendChild(el);
  });
}
function selectTheme(name) {
  document.getElementById('theme').value = name;
  highlightTheme(name);
  collectAndSend();
}

// ── graph-mode segmented buttons ──────────────────────────────────────────────
function buildSeg() {
  document.querySelectorAll('#graph-seg button').forEach(b => {
    b.addEventListener('click', () => selectGraphMode(parseInt(b.dataset.mode)));
  });
  highlightSeg(parseInt(document.getElementById('graphMode').value) || 0);
}
function selectGraphMode(m) {
  document.getElementById('graphMode').value = m;
  highlightSeg(m);
  collectAndSend();
}
function highlightSeg(m) {
  document.querySelectorAll('#graph-seg button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.mode) === m));
}

// ── check-type segmented buttons (HTTP / TCP port) ────────────────────────────
function buildTypeSeg() {
  document.querySelectorAll('#type-seg button').forEach(b => {
    b.addEventListener('click', () => selectType(b.dataset.type));
  });
  highlightType(document.getElementById('checkType').value || 'http');
}
function selectType(t) {
  document.getElementById('checkType').value = t;
  highlightType(t);
  collectAndSend();
}
function highlightType(t) {
  document.querySelectorAll('#type-seg button').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  const inp = document.getElementById('url');
  if (inp) inp.placeholder = (t === 'tcp') ? 'db.example.com:5432' : 'example.com';
}
function highlightTheme(name) {
  document.querySelectorAll('.theme-swatch').forEach(el => el.classList.toggle('active', el.dataset.theme === name));
  const tm = THEMES[name] || THEMES.midnight;
  document.documentElement.style.setProperty('--accent', tm.up);
}

// ── live preview (cycles up → slow → down to showcase the states) ──────────────
const pv = { frame: 0, history: [], status: 'up', phaseFrame: 0, blink: false };
let previewTimer = null;

// Live animated preview removed: it ran a ~6.6 fps SVG loop that idled the CPU
// (~5% per open panel). The panel now shows no moving preview.
function startPreviewLoop() { /* disabled */ }
function _startPreviewLoop_DISABLED() {
  // seed some history
  pv.history = [];
  for (let i = 0; i < 24; i++) pv.history.push({ ok: true, ms: 120 + Math.round(Math.random() * 180) });
  if (previewTimer) clearInterval(previewTimer);
  previewTimer = setInterval(() => {
    pv.frame++; pv.phaseFrame++;
    // cycle states: up (40) → slow (24) → down (20) → up …
    if (pv.status === 'up' && pv.phaseFrame > 40) { pv.status = 'slow'; pv.phaseFrame = 0; }
    else if (pv.status === 'slow' && pv.phaseFrame > 24) { pv.status = 'down'; pv.phaseFrame = 0; }
    else if (pv.status === 'down' && pv.phaseFrame > 20) { pv.status = 'up'; pv.phaseFrame = 0; }

    // add a synthetic sample every ~4 frames
    if (pv.frame % 4 === 0) {
      let sample;
      if (pv.status === 'down') sample = { ok: false, ms: 8000 };
      else if (pv.status === 'slow') sample = { ok: true, ms: 850 + Math.round(Math.random() * 700) };
      else sample = { ok: true, ms: 110 + Math.round(Math.random() * 160) };
      pv.history.push(sample);
      if (pv.history.length > 32) pv.history.shift();
    }
    if (pv.status === 'down' || pv.status === 'slow') {
      if (pv.frame % 3 === 0) pv.blink = !pv.blink;
    } else pv.blink = false;

    renderPreview();
  }, 150);
}

function currentLastMs() {
  for (let i = pv.history.length - 1; i >= 0; i--) if (pv.history[i].ok) return pv.history[i].ms;
  return null;
}

function renderPreview() {
  const el = document.getElementById('preview');
  if (!el) return;
  const theme = document.getElementById('theme').value || 'midnight';
  const rawUrl = document.getElementById('url').value;
  const host = prettyHost(rawUrl);
  const urlText = (rawUrl || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') || host;
  const warnMs = parseInt(document.getElementById('warnMs').value) || 800;

  const graphMode = parseInt(document.getElementById('graphMode').value) || 0;
  const paused = document.getElementById('paused').checked;
  const status = paused ? 'paused' : pv.status;
  el.innerHTML = buildSVG({
    host, urlText, status, lastMs: status === 'down' || status === 'paused' ? null : currentLastMs(),
    history: pv.history, warnMs, theme, graphMode, labels: LABELS,
    blinkOn: paused ? false : pv.blink, animFrame: pv.frame
  });
}

// graph builder (mirror of backend buildGraph): bars = default, line = ping mode
function piBuildGraph(p) {
  const { hist, warn, okVals, peak, gx0, gx1, gy0, gy1, gw, gh, t, flash, statusColor, pingGraph, waiting } = p;
  if (!hist.length) return { graph: `<text x="128" y="${(gy0 + gh / 2 + 4).toFixed(0)}" text-anchor="middle" fill="${t.muted}" font-size="13" font-family="Arial, Helvetica, sans-serif">${waiting}</text>`, threshLine: '', peakLabel: '', gradDef: '' };
  if (pingGraph) {
    const hi = peak || (okVals.length ? Math.max(...okVals) : 1);
    const lo = okVals.length ? Math.min(...okVals) : 0;
    const pad = Math.max(hi - lo, 1) * 0.18 + 2;
    const lo2 = Math.max(0, lo - pad), hi2 = hi + pad;
    const range = Math.max(hi2 - lo2, 1);
    const yFor = (ms) => gy1 - Math.max(2, Math.min(gh, ((Math.max(lo2, Math.min(hi2, ms)) - lo2) / range) * gh));
    const n = hist.length, step = n > 1 ? gw / (n - 1) : 0;
    const pts = []; let dots = '', fails = '';
    for (let i = 0; i < n; i++) {
      const h = hist[i], x = gx0 + i * step;
      if (h.ok) { const y = yFor(h.ms); pts.push([x, y]); dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="${flash ? t.bg : (h.ms > warn ? t.slow : statusColor)}"/>`; }
      else { pts.push([x, gy0]); fails += `<circle cx="${x.toFixed(1)}" cy="${gy0}" r="3.6" fill="${t.down}"/>`; }
    }
    const lineColor = flash ? t.bg : statusColor;
    const ptStr = pts.map(pp => `${pp[0].toFixed(1)},${pp[1].toFixed(1)}`).join(' ');
    const area = `${gx0},${gy1} ${ptStr} ${(gx0 + (n - 1) * step).toFixed(1)},${gy1}`;
    const gradDef = `<linearGradient id="garea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lineColor}" stop-opacity="0.45"/><stop offset="1" stop-color="${lineColor}" stop-opacity="0.02"/></linearGradient>`;
    const graph = `<polygon points="${area}" fill="url(#garea)"/>` +
      `<polyline points="${ptStr}" fill="none" stroke="${lineColor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" opacity="0.18"/>` +
      `<polyline points="${ptStr}" fill="none" stroke="${lineColor}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` + dots + fails;
    const ty = yFor(warn);
    const threshLine = (!flash && warn > lo2 && warn < hi2)
      ? `<line x1="${gx0}" y1="${ty.toFixed(1)}" x2="${gx1}" y2="${ty.toFixed(1)}" stroke="${t.slow}" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.7"/><text x="${gx0 + 2}" y="${(ty - 3).toFixed(1)}" fill="${t.slow}" font-size="13" font-family="Arial, Helvetica, sans-serif" opacity="0.9">${warn}ms</text>` : '';
    const peakLabel = (peak > 0) ? `<text x="${gx1}" y="${gy0 - 4}" text-anchor="end" fill="${flash ? t.bg : t.muted}" font-size="15" font-family="Arial, Helvetica, sans-serif">▲ ${peak} ms</text>` : '';
    return { graph, threshLine, peakLabel, gradDef };
  }
  // bars
  const maxMs = Math.max(150, ...okVals, 1);
  const n = hist.length, bw = gw / n;
  let bars = '';
  for (let i = 0; i < n; i++) {
    const h = hist[i], x = (gx0 + i * bw).toFixed(1), w = Math.max(1.5, bw - 1.5).toFixed(1);
    if (!h.ok) bars += `<rect x="${x}" y="${gy0}" width="${w}" height="${gh}" rx="1" fill="${t.down}" opacity="${flash ? 0.35 : 0.9}"/>`;
    else { const bh = Math.max(2, (h.ms / maxMs) * gh), y = (gy1 - bh).toFixed(1); const c = h.ms > warn ? t.slow : t.up; bars += `<rect x="${x}" y="${y}" width="${w}" height="${bh.toFixed(1)}" rx="1" fill="${flash ? t.bg : c}" opacity="0.92"/>`; }
  }
  return { graph: bars, threshLine: '', peakLabel: '', gradDef: '' };
}

// JS port of the backend generateSVG (kept in sync for an accurate preview)
function buildSVG(o) {
  const t = THEMES[o.theme] || THEMES.midnight;
  const L = o.labels;
  const statusColor = o.status === 'down' ? t.down : o.status === 'slow' ? t.slow : o.status === 'up' ? t.up : t.muted;
  const flash = o.status === 'down' && o.blinkOn;
  const bg = flash ? t.down : t.bg;
  const fgMain = flash ? t.bg : t.text;
  const accent = flash ? t.bg : statusColor;
  const af = o.animFrame || 0;
  const slowPulse = o.status === 'slow' ? (0.65 + 0.35 * ((Math.sin(af * 0.25) + 1) / 2)) : 1;

  // domain marquee (scroll right→left when it doesn't fit) — mirrors the key
  const fullDom = esc(o.urlText || o.host || '—');
  const domColor = flash ? t.bg : t.muted;
  const DOMF = 17, BANDX = 22, BANDW = 212, DOMY = 70;
  const approxW = fullDom.length * (DOMF * 0.56);
  let domainSvg;
  if (approxW <= BANDW) {
    domainSvg = `<text x="128" y="${DOMY}" text-anchor="middle" fill="${domColor}" font-size="${DOMF}" font-family="Arial, Helvetica, sans-serif">${fullDom}</text>`;
  } else {
    const period = approxW + 40;
    const off = (((o.animFrame || 0) * 2.4) % period).toFixed(1);
    const x = (BANDX - off).toFixed(1), x2 = (BANDX - off + period).toFixed(1);
    domainSvg =
      `<text x="${x}" y="${DOMY}" fill="${domColor}" font-size="${DOMF}" font-family="Arial, Helvetica, sans-serif">${fullDom}</text>` +
      `<text x="${x2}" y="${DOMY}" fill="${domColor}" font-size="${DOMF}" font-family="Arial, Helvetica, sans-serif">${fullDom}</text>`;
  }
  const statusText = o.status === 'down' ? (L.down || 'DOWN') : o.status === 'slow' ? (L.slow || 'SLOW') : o.status === 'up' ? (L.up || 'UP') : o.status === 'paused' ? (L.pausedLabel || 'PAUSED') : (L.checking || 'CHECK');
  let bigText = o.status === 'down' ? (L.down || 'DOWN') : o.status === 'paused' ? (L.pausedLabel || 'PAUSED') : (o.lastMs == null ? '···' : `${o.lastMs} ms`);
  const bigFont = o.status === 'down' ? 40 : (o.status === 'paused' ? 28 : 44);

  const gx0 = 22, gx1 = 234, gy0 = 150, gy1 = 212, gw = gx1 - gx0, gh = gy1 - gy0;
  const hist = (o.history || []).slice(-32);
  const warn = o.warnMs || 800;
  const okVals = hist.filter(h => h.ok).map(h => h.ms);
  const peak = okVals.length ? Math.max(...okVals) : 0;
  const gm = (o.graphMode != null) ? o.graphMode : (o.pingGraph ? 1 : 0);
  let graph = '', threshLine = '', peakLabel = '', gradDef = '', baseline = '', minimalBody = '';
  if (gm === 2) {
    minimalBody = `<text x="128" y="190" text-anchor="middle" fill="${accent}" font-size="34" font-weight="bold" font-family="Arial, Helvetica, sans-serif" letter-spacing="1" opacity="${slowPulse.toFixed(2)}">${esc(statusText)}</text>`;
  } else {
    const gg = piBuildGraph({ hist, warn, okVals, peak, gx0, gx1, gy0, gy1, gw, gh, t, flash, statusColor, pingGraph: gm === 1, waiting: esc(L.waiting || 'waiting…') });
    graph = gg.graph; threshLine = gg.threshLine; peakLabel = gg.peakLabel; gradDef = gg.gradDef;
    baseline = `<line x1="${gx0}" y1="${gy1}" x2="${gx1}" y2="${gy1}" stroke="${flash ? t.bg : t.track}" stroke-width="2"/>`;
  }
  const okCount = hist.filter(h => h.ok).length;
  const upPct = hist.length ? Math.round((okCount / hist.length) * 100) : null;
  const okMs = hist.filter(h => h.ok).map(h => h.ms);
  const avg = okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : null;
  let p95 = null;
  if (okMs.length >= 5) { const s = [...okMs].sort((a, b) => a - b); p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; }
  const dot = `<circle cx="30" cy="34" r="7" fill="${accent}"/>`;
  const topRight = (upPct != null) ? `<text x="234" y="40" text-anchor="end" fill="${accent}" font-size="17" font-weight="bold" font-family="Arial, Helvetica, sans-serif">24h ${upPct}%</text>` : '';
  const botLeft = (avg != null) ? `~${avg} ms` : '';
  const botRight = (p95 != null) ? `p95 ${p95}` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  ${gradDef ? `<defs>${gradDef}</defs>` : ''}
  <rect width="256" height="256" rx="36" fill="${bg}"/>${dot}
  <text x="46" y="40" fill="${accent}" font-size="20" font-weight="bold" font-family="Arial, Helvetica, sans-serif" letter-spacing="1" opacity="${slowPulse.toFixed(2)}">${esc(statusText)}</text>
  ${topRight}
  ${domainSvg}
  <text x="128" y="120" text-anchor="middle" fill="${fgMain}" font-size="${bigFont}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${esc(bigText)}</text>
  ${baseline}${threshLine}${graph}${peakLabel}${minimalBody}
  <text x="22" y="240" fill="${flash ? t.bg : t.muted}" font-size="17" font-family="Arial, Helvetica, sans-serif">${esc(botLeft)}</text>
  <text x="234" y="240" text-anchor="end" fill="${flash ? t.bg : accent}" font-size="17" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${esc(botRight)}</text>
</svg>`;
}

function pulseButton() {
  const b = document.getElementById('btn-check');
  if (!b) return;
  b.style.transform = 'scale(0.96)';
  setTimeout(() => { b.style.transform = ''; }, 120);
}

// ── translations ──────────────────────────────────────────────────────────────
async function loadTranslations() {
  try {
    const data = await Utils.readJson(`${Utils.getPluginPath()}/${$UD.language}.json`);
    const loc = data?.Localization || {};
    LABELS = {
      up:       loc['UP']       || LABELS.up,
      slow:     loc['SLOW']     || LABELS.slow,
      down:     loc['DOWN']     || LABELS.down,
      checking: loc['CHECK']    || LABELS.checking,
      uptime:   loc['uptime']   || LABELS.uptime,
      waiting:  loc['waiting']  || LABELS.waiting,
      pausedLabel: loc['PAUSED'] || LABELS.pausedLabel
    };
    NOTIFY = {
      notifyTitle: data?.Name        || NOTIFY.notifyTitle,
      msgDown:     loc['msg_down']   || NOTIFY.msgDown,
      msgUp:       loc['msg_up']     || NOTIFY.msgUp
    };
    // Push the localized labels ONCE (not the settings — that would wipe the URL, and
    // not on every receive — that would loop). The backend renders default English
    // labels until this arrives.
    $UD.sendParamFromPlugin({ ...LABELS, ...NOTIFY });
  } catch (e) {
    console.warn('[Uptime] No translations for', $UD.language);
  }
}

// ── send / receive ────────────────────────────────────────────────────────────
function collectAndSend() {
  if (!form) return;
  const values = Utils.getFormValue(form);
  ACTION_SETTING = { ...ACTION_SETTING, ...values };
  ACTION_SETTING.graphMode = parseInt(document.getElementById('graphMode').value) || 0;
  ACTION_SETTING.checkType = document.getElementById('checkType').value || 'http';
  ACTION_SETTING.notify = !!document.getElementById('notify').checked;
  ACTION_SETTING.paused = !!document.getElementById('paused').checked;
  renderPreview();
  $UD.sendParamFromPlugin({ ...ACTION_SETTING, ...LABELS, ...NOTIFY });
}

function applySettings(params) {
  if (!params || params.forceCheck) return;
  ACTION_SETTING = { ...ACTION_SETTING, ...params };
  if (!form) return;
  // Don't repopulate the form while the user is typing — otherwise the echo of our
  // own debounced send arrives mid-edit and setFormValue reverts the URL field to the
  // value from 200 ms ago, making it feel like the URL can't be edited.
  const ae = document.activeElement;
  const editing = !!(ae && form.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT'));
  if (!editing) Utils.setFormValue(ACTION_SETTING, form);
  // graph mode (migrate the old pingGraph boolean if present)
  let gm = ACTION_SETTING.graphMode;
  if (gm == null && ACTION_SETTING.pingGraph != null) gm = (ACTION_SETTING.pingGraph === true || ACTION_SETTING.pingGraph === 'true' || ACTION_SETTING.pingGraph === 1 || ACTION_SETTING.pingGraph === '1') ? 1 : 0;
  gm = parseInt(gm) || 0;
  ACTION_SETTING.graphMode = gm;
  document.getElementById('graphMode').value = gm;
  highlightSeg(gm);
  document.getElementById('notify').checked = !!ACTION_SETTING.notify;
  document.getElementById('paused').checked = !!ACTION_SETTING.paused;
  const ct = (ACTION_SETTING.checkType === 'tcp') ? 'tcp' : 'http';
  document.getElementById('checkType').value = ct;
  highlightType(ct);
  const theme = ACTION_SETTING.theme || 'midnight';
  document.getElementById('theme').value = theme;
  highlightTheme(theme);
  renderPreview();
  // Send NOTHING here. applySettings runs on every received push, and any send would
  // be echoed straight back → an infinite panel↔deck loop that kept calling setConfig
  // on the backend, resetting the check timer (pinged once then froze) and flickering.
  // The backend already has the settings; labels are pushed once from loadTranslations.
}

$UD.onAdd((jsn) => { if (jsn.param) applySettings(jsn.param); });
$UD.onParamFromApp((jsn) => { if (jsn.param) applySettings(jsn.param); });
$UD.onParamFromPlugin((jsn) => { if (jsn.param && !jsn.param.forceCheck) applySettings(jsn.param); });
