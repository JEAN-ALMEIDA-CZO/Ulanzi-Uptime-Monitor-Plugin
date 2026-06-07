import UlanzideckApi from '../libs/node/ulanzideckApi.js';
import http from 'http';
import https from 'https';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(__dirname, '..', 'assets', 'icons');
const PLUGIN_VERSION = '1.0.0';

// notification thumbnails (raster — required by Windows toast + macOS notifier)
const NOTIFY_ICONS = {
  down: path.join(ICON_DIR, 'notify-down.png'),
  up:   path.join(ICON_DIR, 'notify-up.png')
};
const NOTIFY_APP_ICON = NOTIFY_ICONS.up;
const NOTIFY_APP_ID = 'com.uptime.monitor.deck';

// Debug logging off by default (production). Enable with UPTIME_DEBUG=1.
const DEBUG = process.env.UPTIME_DEBUG === '1';
function dlog(msg) {
  if (!DEBUG) return;
  try { fs.appendFileSync(path.join(os.tmpdir(), 'uptime_debug.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (e) {}
}
dlog(`process start — v${PLUGIN_VERSION} (pid ${process.pid})`);

// ── themes ────────────────────────────────────────────────────────────────────
const THEMES = {
  midnight: { bg: '#0b1020', up: '#22c55e', slow: '#f59e0b', down: '#ef4444', track: '#1e293b', text: '#e2e8f0', muted: '#64748b' },
  carbon:   { bg: '#0a0a0a', up: '#34d399', slow: '#fbbf24', down: '#f87171', track: '#1f1f1f', text: '#f5f5f5', muted: '#737373' },
  ocean:    { bg: '#011627', up: '#2ec4b6', slow: '#ff9f1c', down: '#e71d36', track: '#0a2a3a', text: '#cde7f0', muted: '#5b7a8a' },
  grape:    { bg: '#1a1030', up: '#4ade80', slow: '#fb923c', down: '#fb7185', track: '#2e1f4a', text: '#ede9fe', muted: '#8b7aa8' },
  slate:    { bg: '#0f172a', up: '#10b981', slow: '#f97316', down: '#ef4444', track: '#243049', text: '#f8fafc', muted: '#6b7a90' },
  mono:     { bg: '#000000', up: '#ffffff', slow: '#bbbbbb', down: '#ff4d4d', track: '#222222', text: '#ffffff', muted: '#888888' },
  // ── light themes ──
  paper:    { bg: '#f5f7fa', up: '#16a34a', slow: '#ea580c', down: '#dc2626', track: '#dde3ea', text: '#0f172a', muted: '#64748b' },
  snow:     { bg: '#ffffff', up: '#15803d', slow: '#b45309', down: '#b91c1c', track: '#e5e7eb', text: '#111827', muted: '#6b7280' },
  daylight: { bg: '#eef4ff', up: '#0284c7', slow: '#d97706', down: '#dc2626', track: '#d6e4f5', text: '#0b1e33', muted: '#5b7088' },
  sand:     { bg: '#fbf6ec', up: '#2f855a', slow: '#c05621', down: '#c53030', track: '#ece1cd', text: '#3b2f1e', muted: '#8a7a5f' }
};

const STATUS_LABELS_DEFAULT = { up: 'UP', slow: 'SLOW', down: 'DOWN', checking: 'CHECK' };
const MAX_HISTORY = 32;

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function prettyHost(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch (e) { return (url || '').replace(/^https?:\/\//i, '').split('/')[0] || '—'; }
}

function normalizeUrl(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

// One reachability check via http/https (no external dependency — works on any
// Node version, Windows + macOS). Resolves { ok, ms, code }.
function checkUrl(rawUrl, timeoutMs) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(normalizeUrl(rawUrl)); }
    catch (e) { return resolve({ ok: false, ms: 0, code: 0, err: 'badurl' }); }

    const lib = u.protocol === 'https:' ? https : http;
    const start = Date.now();
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };

    const req = lib.request(
      u,
      { method: 'GET', timeout: timeoutMs, headers: { 'User-Agent': 'UlanziUptimeMonitor/1.0', 'Accept': '*/*' } },
      (res) => {
        const ms = Date.now() - start;
        const code = res.statusCode || 0;
        res.destroy();
        // any response under 400 = up; 4xx/5xx still "responding" but treated as down
        done({ ok: code > 0 && code < 400, ms, code });
      }
    );
    req.on('timeout', () => { req.destroy(); done({ ok: false, ms: timeoutMs, code: 0, err: 'timeout' }); });
    req.on('error', () => done({ ok: false, ms: Date.now() - start, code: 0, err: 'error' }));
    req.end();
  });
}

// ── OS desktop notifications (Windows toast + macOS notifier) ──────────────────
let _lastEnsuredTitle = '';

function psEscape(str) {
  return String(str).replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"');
}

const AUMID_CSHARP =
  `using System;\n` +
  `using System.Runtime.InteropServices;\n` +
  `namespace AumidLnk {\n` +
  `  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] public class CShellLink {}\n` +
  `  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]\n` +
  `  public interface IShellLinkW {\n` +
  `    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder f, int c, IntPtr p, uint fl);\n` +
  `    void GetIDList(out IntPtr ppidl); void SetIDList(IntPtr pidl);\n` +
  `    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c);\n` +
  `    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c);\n` +
  `    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c);\n` +
  `    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `    void GetHotkey(out short w); void SetHotkey(short w);\n` +
  `    void GetShowCmd(out int i); void SetShowCmd(int i);\n` +
  `    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder p, int c, out int i);\n` +
  `    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string p, int i);\n` +
  `    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string p, uint dw);\n` +
  `    void Resolve(IntPtr hwnd, uint fl);\n` +
  `    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string p);\n` +
  `  }\n` +
  `  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\n` +
  `  public interface IPersistFile {\n` +
  `    void GetClassID(out Guid id); [PreserveSig] int IsDirty();\n` +
  `    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, int m);\n` +
  `    void Save([MarshalAs(UnmanagedType.LPWStr)] string f, [MarshalAs(UnmanagedType.Bool)] bool r);\n` +
  `    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);\n` +
  `    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);\n` +
  `  }\n` +
  `  [StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid fmtid; public int pid; }\n` +
  `  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\n` +
  `  public interface IPropertyStore {\n` +
  `    void GetCount(out uint c); void GetAt(uint i, out PropertyKey k);\n` +
  `    void GetValue(ref PropertyKey k, out PropVariant pv);\n` +
  `    void SetValue(ref PropertyKey k, ref PropVariant pv); void Commit();\n` +
  `  }\n` +
  `  [StructLayout(LayoutKind.Explicit)] public struct PropVariant {\n` +
  `    [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p;\n` +
  `  }\n` +
  `  public static class Lnk {\n` +
  `    public static void Create(string lnkPath, string target, string aumid) {\n` +
  `      var link = (IShellLinkW)new CShellLink();\n` +
  `      link.SetPath(target);\n` +
  `      var store = (IPropertyStore)link;\n` +
  `      var key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };\n` +
  `      var pv = new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(aumid) };\n` +
  `      store.SetValue(ref key, ref pv); store.Commit();\n` +
  `      Marshal.FreeCoTaskMem(pv.p);\n` +
  `      ((IPersistFile)link).Save(lnkPath, true);\n` +
  `    }\n` +
  `  }\n` +
  `}\n`;

function winRunPs(script) {
  const tmp = path.join(os.tmpdir(), `uptime_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  try {
    fs.writeFileSync(tmp, '﻿' + script, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmp}"`,
      () => { try { fs.unlinkSync(tmp); } catch (e) {} });
  } catch (e) { /* ignore */ }
}

let _ensureTimer = null;
let _pendingTitle = '';
function ensureWinIdentity(title) {
  if (os.platform() !== 'win32' || !title) return;
  _pendingTitle = title;
  if (_ensureTimer) clearTimeout(_ensureTimer);
  _ensureTimer = setTimeout(() => { _ensureTimer = null; registerWinIdentity(_pendingTitle); }, 600);
}

function registerWinIdentity(title) {
  if (os.platform() !== 'win32' || !title || title === _lastEnsuredTitle) return;
  const display  = psEscape(title);
  const appIcon  = psEscape(NOTIFY_APP_ICON);
  const programs = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const safeName = (String(title).replace(/[<>:"/\\|?*\n\r]/g, '').trim()) || 'Uptime Monitor';
  const desiredLnk = path.join(programs, safeName + '.lnk');
  const recordFile = path.join(os.tmpdir(), 'com.uptime.monitor.deck.notify_lnk');
  let oldLnk = '';
  try { oldLnk = fs.readFileSync(recordFile, 'utf8').trim(); } catch (e) {}

  const lnkPs = psEscape(desiredLnk);
  const oldPs = psEscape(oldLnk);

  const script =
    `$AppId='${NOTIFY_APP_ID}'\n` +
    `$lnk="${lnkPs}"\n` +
    `$old="${oldPs}"\n` +
    `if($old -and ($old -ne $lnk) -and (Test-Path -LiteralPath $old)){Remove-Item -LiteralPath $old -Force -ErrorAction SilentlyContinue}\n` +
    `if(-not(Test-Path -LiteralPath $lnk)){\n` +
    `Add-Type -Language CSharp -TypeDefinition @'\n` + AUMID_CSHARP + `'@\n` +
    `[AumidLnk.Lnk]::Create($lnk,"${appIcon}",$AppId)\n` +
    `Start-Sleep -Milliseconds 300\n` +
    `}\n` +
    `$reg="HKCU:\\Software\\Classes\\AppUserModelId\\$AppId"\n` +
    `if(-not(Test-Path $reg)){New-Item -Path $reg -Force | Out-Null}\n` +
    `New-ItemProperty -Path $reg -Name DisplayName -Value "${display}" -PropertyType String -Force | Out-Null\n` +
    `New-ItemProperty -Path $reg -Name IconUri -Value "${appIcon}" -PropertyType String -Force | Out-Null\n` +
    `$cache="HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\$AppId"\n` +
    `if(Test-Path $cache){Remove-Item -Path $cache -Recurse -Force -ErrorAction SilentlyContinue}\n`;

  try { fs.writeFileSync(recordFile, desiredLnk, 'utf8'); } catch (e) {}
  _lastEnsuredTitle = title;
  winRunPs(script);
}

function showWinToast(title, message, iconPath) {
  const tt   = psEscape(title);
  const m    = psEscape(message);
  const icon = psEscape(iconPath || NOTIFY_APP_ICON);
  const script =
    `$AppId='${NOTIFY_APP_ID}'\n` +
    `$null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]\n` +
    `$xml=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02)\n` +
    `$tx=$xml.GetElementsByTagName('text')\n` +
    `$tx.Item(0).AppendChild($xml.CreateTextNode("${tt}"))|Out-Null\n` +
    `$tx.Item(1).AppendChild($xml.CreateTextNode("${m}"))|Out-Null\n` +
    `$img=$xml.GetElementsByTagName('image')\n` +
    `$img.Item(0).SetAttribute('src',"${icon}")|Out-Null\n` +
    `$img.Item(0).SetAttribute('placement','appLogoOverride')|Out-Null\n` +
    `$toast=[Windows.UI.Notifications.ToastNotification]::new($xml)\n` +
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)\n`;
  winRunPs(script);
}

const MAC_NOTIFIER_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'mac', 'terminal-notifier.app', 'Contents', 'MacOS', 'terminal-notifier'),
  '/opt/homebrew/bin/terminal-notifier',
  '/usr/local/bin/terminal-notifier',
  '/usr/bin/terminal-notifier'
];
function findMacNotifier() {
  for (const p of MAC_NOTIFIER_CANDIDATES) { try { if (fs.existsSync(p)) return p; } catch (e) {} }
  return null;
}

function macOsascript(title, message) {
  const e = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const ascript = `display notification "${e(message)}" with title "${e(title)}" sound name "Glass"`;
  execFile('osascript', ['-e', ascript], (err) => {
    if (err) console.log(`[Uptime] (notify) ${title}: ${message}`);
  });
}

function notifyOS(title, message, iconPath) {
  try {
    if (os.platform() === 'win32') {
      if (title && title !== _lastEnsuredTitle) {
        ensureWinIdentity(title);
        setTimeout(() => showWinToast(title, message, iconPath), 2500);
      } else {
        showWinToast(title, message, iconPath);
      }
    } else if (os.platform() === 'darwin') {
      const tn = findMacNotifier();
      if (tn) {
        const args = ['-title', String(title), '-message', String(message), '-sound', 'Glass'];
        if (iconPath) args.push('-contentImage', String(iconPath));
        execFile(tn, args, (err) => { if (err) macOsascript(title, message); });
      } else {
        macOsascript(title, message);
      }
    } else {
      console.log(`[Uptime] (notify, ${os.platform()}) ${title}: ${message}`);
    }
  } catch (e) { /* ignore */ }
}

// ── graph builder (bars = default, line = "ping/latency" mode) ─────────────────
function buildGraph(p) {
  const { hist, warn, okVals, peak, gx0, gx1, gy0, gy1, gw, gh, t, flash, statusColor, pingGraph, waiting } = p;
  if (!hist.length) {
    return { graph: `<text x="128" y="${(gy0 + gh / 2 + 4).toFixed(0)}" text-anchor="middle" fill="${t.muted}" font-size="13" font-family="Arial, Helvetica, sans-serif">${waiting}</text>`, threshLine: '', peakLabel: '', gradDef: '' };
  }

  if (pingGraph) {
    // auto-scale to the window's min→max (with headroom) so the rises and falls
    // fill the graph height and are clearly visible, instead of being flattened
    // against a fixed 0-based ceiling.
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
      if (h.ok) {
        const y = yFor(h.ms);
        pts.push([x, y]);
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="${flash ? t.bg : (h.ms > warn ? t.slow : statusColor)}"/>`;
      } else {
        pts.push([x, gy0]);
        fails += `<circle cx="${x.toFixed(1)}" cy="${gy0}" r="3.6" fill="${t.down}"/>`;
      }
    }
    const lineColor = flash ? t.bg : statusColor;
    const ptStr = pts.map(pp => `${pp[0].toFixed(1)},${pp[1].toFixed(1)}`).join(' ');
    const area = `${gx0},${gy1} ${ptStr} ${(gx0 + (n - 1) * step).toFixed(1)},${gy1}`;
    const gradDef = `<linearGradient id="garea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lineColor}" stop-opacity="0.45"/><stop offset="1" stop-color="${lineColor}" stop-opacity="0.02"/></linearGradient>`;
    const graph =
      `<polygon points="${area}" fill="url(#garea)"/>` +
      `<polyline points="${ptStr}" fill="none" stroke="${lineColor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" opacity="0.18"/>` + // soft glow
      `<polyline points="${ptStr}" fill="none" stroke="${lineColor}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
      dots + fails;
    const ty = yFor(warn);
    const threshLine = (!flash && warn > lo2 && warn < hi2)
      ? `<line x1="${gx0}" y1="${ty.toFixed(1)}" x2="${gx1}" y2="${ty.toFixed(1)}" stroke="${t.slow}" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.7"/>` +
        `<text x="${gx0 + 2}" y="${(ty - 3).toFixed(1)}" fill="${t.slow}" font-size="13" font-family="Arial, Helvetica, sans-serif" opacity="0.9">${warn}ms</text>`
      : '';
    const peakLabel = (peak > 0 && !flash)
      ? `<text x="${gx1}" y="${gy0 - 4}" text-anchor="end" fill="${t.muted}" font-size="15" font-family="Arial, Helvetica, sans-serif">▲ ${peak} ms</text>`
      : '';
    return { graph, threshLine, peakLabel, gradDef };
  }

  // ── bars graph (default) ──
  const maxMs = Math.max(150, ...okVals, 1);
  const n = hist.length, bw = gw / n;
  let bars = '';
  for (let i = 0; i < n; i++) {
    const h = hist[i], x = (gx0 + i * bw).toFixed(1), w = Math.max(1.5, bw - 1.5).toFixed(1);
    if (!h.ok) {
      bars += `<rect x="${x}" y="${gy0}" width="${w}" height="${gh}" rx="1" fill="${t.down}" opacity="${flash ? 0.35 : 0.9}"/>`;
    } else {
      const bh = Math.max(2, (h.ms / maxMs) * gh), y = (gy1 - bh).toFixed(1);
      const c = h.ms > warn ? t.slow : t.up;
      bars += `<rect x="${x}" y="${y}" width="${w}" height="${bh.toFixed(1)}" rx="1" fill="${flash ? t.bg : c}" opacity="0.92"/>`;
    }
  }
  return { graph: bars, threshLine: '', peakLabel: '', gradDef: '' };
}

// ── SVG renderer ──────────────────────────────────────────────────────────────
function generateSVG(o) {
  const t = THEMES[o.theme] || THEMES.midnight;
  const L = o.labels || STATUS_LABELS_DEFAULT;

  const statusColor = o.status === 'down' ? t.down
                    : o.status === 'slow' ? t.slow
                    : o.status === 'up'   ? t.up
                    : t.muted; // checking

  // down → invert (full-bleed alert); slow → gentle pulse
  const flash = o.status === 'down' && o.blinkOn;
  const bg = flash ? t.down : t.bg;
  const fgMain = flash ? t.bg : t.text;
  const accent = flash ? t.bg : statusColor;

  const af = o.animFrame || 0;
  const slowPulse = o.status === 'slow' ? (0.65 + 0.35 * ((Math.sin(af * 0.25) + 1) / 2)) : 1;

  // domain / URL — scrolls right→left (marquee) when it doesn't fit the key
  const fullDom = esc(o.urlText || o.host || '—');
  const domColor = flash ? t.bg : t.muted;
  const DOMF = 17, BANDX = 22, BANDW = 212, DOMY = 70;
  const approxW = fullDom.length * (DOMF * 0.56);
  let domainSvg;
  if (approxW <= BANDW) {
    domainSvg = `<text x="128" y="${DOMY}" text-anchor="middle" fill="${domColor}" font-size="${DOMF}" font-family="Arial, Helvetica, sans-serif">${fullDom}</text>`;
  } else {
    // no clipPath (the deck rasterizer draws the clip rect as a black bar) — the
    // 256-wide viewBox already clips the text at the key edges as it scrolls.
    const period = approxW + 40;
    const off = (((o.animFrame || 0) * 2.4) % period).toFixed(1);
    const x = (BANDX - off).toFixed(1);
    const x2 = (BANDX - off + period).toFixed(1);
    domainSvg =
      `<text x="${x}" y="${DOMY}" fill="${domColor}" font-size="${DOMF}" font-family="Arial, Helvetica, sans-serif">${fullDom}</text>` +
      `<text x="${x2}" y="${DOMY}" fill="${domColor}" font-size="${DOMF}" font-family="Arial, Helvetica, sans-serif">${fullDom}</text>`;
  }

  const statusText = o.status === 'down' ? (L.down || 'DOWN')
                   : o.status === 'slow' ? (L.slow || 'SLOW')
                   : o.status === 'up'   ? (L.up || 'UP')
                   : (L.checking || 'CHECK');

  // central value
  let bigText;
  if (o.status === 'down') bigText = (L.down || 'DOWN');
  else if (o.status === 'checking' || o.lastMs == null) bigText = '···';
  else bigText = `${o.lastMs} ms`;

  // ── graph (real-time latency history) ──
  const gx0 = 22, gx1 = 234, gy0 = 150, gy1 = 212;
  const gw = gx1 - gx0, gh = gy1 - gy0;
  const hist = (o.history || []).slice(-MAX_HISTORY);
  const warn = o.warnMs || 800;
  const okVals = hist.filter(h => h.ok).map(h => h.ms);
  const peak = okVals.length ? Math.max(...okVals) : 0;

  // graph mode: 0 = bars, 1 = line/ping, 2 = minimal (no chart)
  const gm = (o.graphMode != null) ? o.graphMode : (o.pingGraph ? 1 : 0);
  let graph = '', threshLine = '', peakLabel = '', gradDef = '', baseline = '', minimalBody = '';
  if (gm === 2) {
    // minimal: drop the chart, show a big status word in its place
    minimalBody = `<text x="128" y="190" text-anchor="middle" fill="${accent}" font-size="34" font-weight="bold" font-family="Arial, Helvetica, sans-serif" letter-spacing="1" opacity="${slowPulse.toFixed(2)}">${esc(statusText)}</text>`;
  } else {
    const g = buildGraph({ hist, warn, okVals, peak, gx0, gx1, gy0, gy1, gw, gh, t, flash, statusColor, pingGraph: gm === 1, waiting: esc(L.waiting || 'waiting…') });
    graph = g.graph; threshLine = g.threshLine; peakLabel = g.peakLabel; gradDef = g.gradDef;
    baseline = `<line x1="${gx0}" y1="${gy1}" x2="${gx1}" y2="${gy1}" stroke="${flash ? t.bg : t.track}" stroke-width="2"/>`;
  }

  // uptime %
  const up = (o.uptimePct != null) ? `${o.uptimePct}%` : '—';
  const upLabel = esc(L.uptime || 'uptime');

  // status dot
  const dot = `<circle cx="30" cy="34" r="7" fill="${accent}">${o.status === 'up' || o.status === 'slow' ? `<animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite"/>` : ''}</circle>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  ${gradDef ? `<defs>${gradDef}</defs>` : ''}
  <rect width="256" height="256" rx="36" fill="${bg}"/>
  ${dot}
  <text x="46" y="40" fill="${accent}" font-size="20" font-weight="bold" font-family="Arial, Helvetica, sans-serif" letter-spacing="1" opacity="${slowPulse.toFixed(2)}">${esc(statusText)}</text>
  ${domainSvg}
  <text x="128" y="120" text-anchor="middle" fill="${fgMain}" font-size="${o.status === 'down' ? 40 : 44}" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${esc(bigText)}</text>
  ${baseline}
  ${threshLine}
  ${graph}
  ${peakLabel}
  ${minimalBody}
  <text x="22" y="240" fill="${flash ? t.bg : t.muted}" font-size="18" font-family="Arial, Helvetica, sans-serif">${upLabel}</text>
  <text x="234" y="240" text-anchor="end" fill="${flash ? t.bg : accent}" font-size="20" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${esc(up)}</text>
</svg>`;
}

// ── monitor instance (per key context) ────────────────────────────────────────
class UptimeMonitor {
  constructor(context, $UD) {
    this.context = context;
    this.$UD = $UD;
    this.config = {
      url: '',
      intervalSec: 5,      // real-time default (min 3s)
      timeoutMs: 8000,
      warnMs: 800,
      theme: 'midnight',
      graphMode: 0,        // 0 = bars · 1 = line/ping · 2 = minimal
      notify: false,       // desktop alert on down/recover transitions
      notifyTitle: 'Uptime Monitor',
      msgDown: '{host} is down',
      msgUp: '{host} is back online',
      labels: { ...STATUS_LABELS_DEFAULT }
    };
    this.urlText = '';
    this.needsMarquee = false;
    this.wasDown = null;   // last known up/down state (for transition detection)
    this.history = [];          // [{ ok, ms }] — last 32, for the graph
    this.totalChecks = 0;       // cumulative, for the real uptime %
    this.okChecks = 0;
    this.status = 'checking';
    this.lastMs = null;
    this.lastCode = 0;
    this.animFrame = 0;
    this.blinkOn = false;

    this.checkTimer = null;
    this.animTimer = null;
    this._busy = false;
  }

  setConfig(param) {
    // PI "Check now" button → immediate re-check
    if (param.forceCheck) { this.checkNow(); return; }

    const prevUrl = this.config.url;
    const prevInterval = this.config.intervalSec;

    if (param.url != null) this.config.url = String(param.url).trim();
    if (param.intervalSec != null) this.config.intervalSec = Math.max(3, parseInt(param.intervalSec) || 5);
    if (param.timeoutMs != null) this.config.timeoutMs = Math.max(1000, parseInt(param.timeoutMs) || 8000);
    if (param.warnMs != null) this.config.warnMs = Math.max(50, parseInt(param.warnMs) || 800);
    if (param.theme != null) this.config.theme = param.theme;
    if (param.graphMode != null) {
      const gm = parseInt(param.graphMode);
      this.config.graphMode = (gm >= 0 && gm <= 2) ? gm : 0;
    } else if (param.pingGraph != null) {
      // backward-compat with the old boolean toggle
      this.config.graphMode = (param.pingGraph === true || param.pingGraph === 'true' || param.pingGraph === 1 || param.pingGraph === '1') ? 1 : 0;
    }

    // notifications
    if (param.notify != null) this.config.notify = (param.notify === true || param.notify === 'true' || param.notify === 1 || param.notify === '1');
    if (param.notifyTitle != null) this.config.notifyTitle = String(param.notifyTitle);
    if (param.msgDown != null) this.config.msgDown = String(param.msgDown);
    if (param.msgUp != null) this.config.msgUp = String(param.msgUp);
    // pre-register the Windows toast identity (localized name) ahead of the first alert
    if (this.config.notify) ensureWinIdentity(this.config.notifyTitle);

    // localized status labels (pushed from the PI)
    ['up', 'slow', 'down', 'checking', 'uptime', 'waiting'].forEach(k => {
      if (param[k] != null) this.config.labels[k] = param[k];
    });

    this.host = prettyHost(this.config.url);
    // full URL (no protocol / trailing slash) for the marquee
    this.urlText = (this.config.url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '') || this.host;
    this.needsMarquee = (this.urlText.length * (17 * 0.56)) > 212;

    // url changed → reset history + cumulative stats and re-check immediately
    if (this.config.url !== prevUrl) {
      this.history = [];
      this.totalChecks = 0;
      this.okChecks = 0;
      this.status = 'checking';
      this.lastMs = null;
      this.wasDown = null;
    }

    this._startLoops();
    if (this.config.url && (this.config.url !== prevUrl || this.config.intervalSec !== prevInterval || this.history.length === 0)) {
      this.checkNow();
    } else {
      this.render();
    }
  }

  _startLoops() {
    const ms = Math.max(3, this.config.intervalSec) * 1000;
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(() => this.checkNow(), ms);

    if (!this.animTimer) {
      // ~6 fps loop (cheap; only rebuilds the icon). Runs continuously while the
      // status is unstable (blink/pulse) OR the URL needs to scroll (marquee).
      this.animTimer = setInterval(() => {
        this.animFrame++;
        const unstable = this.status === 'down' || this.status === 'slow';
        if (unstable && this.animFrame % 3 === 0) this.blinkOn = !this.blinkOn;
        if (unstable || this.needsMarquee) this.render();
      }, 150);
    }
  }

  async checkNow() {
    if (!this.config.url) { this.status = 'checking'; this.render(); return; }
    if (this._busy) return;
    this._busy = true;
    try {
      const r = await checkUrl(this.config.url, this.config.timeoutMs);
      this.lastMs = r.ok ? r.ms : null;
      this.lastCode = r.code;
      this.history.push({ ok: r.ok, ms: r.ms });
      if (this.history.length > MAX_HISTORY) this.history.shift();
      this.totalChecks++;
      if (r.ok) this.okChecks++;

      // recent instability window (last 5 checks)
      const recent = this.history.slice(-5);
      const recentFails = recent.filter(h => !h.ok).length;

      if (!r.ok) {
        this.status = 'down';
      } else if (r.ms > this.config.warnMs || recentFails > 0) {
        this.status = 'slow';   // responding but high latency or flapping
      } else {
        this.status = 'up';
      }
      dlog(`check ${this.config.url} → ${r.ok ? 'ok' : 'fail'} ${r.ms}ms code=${r.code} status=${this.status}`);
    } catch (e) {
      this.status = 'down';
      this.history.push({ ok: false, ms: this.config.timeoutMs });
      if (this.history.length > MAX_HISTORY) this.history.shift();
      this.totalChecks++;
      dlog(`check error: ${e.message}`);
    } finally {
      this._busy = false;
      this._maybeNotify();
      this.render();
    }
  }

  // fire a desktop alert only on an up↔down transition (not every check)
  _maybeNotify() {
    const isDown = this.status === 'down';
    if (this.wasDown === null) { this.wasDown = isDown; return; }  // first check: baseline, no alert
    if (isDown === this.wasDown) return;                          // no transition
    this.wasDown = isDown;
    if (!this.config.notify) return;
    const host = this.host || this.urlText || '';
    if (isDown) {
      notifyOS(this.config.notifyTitle, (this.config.msgDown || '{host} is down').replace('{host}', host), NOTIFY_ICONS.down);
    } else {
      notifyOS(this.config.notifyTitle, (this.config.msgUp || '{host} is back online').replace('{host}', host), NOTIFY_ICONS.up);
    }
  }

  cycleGraph() {
    this.config.graphMode = (this.config.graphMode + 1) % 3;
    this.render();
    // persist the new mode back to the action settings (survives reload)
    try { this.$UD.sendParamFromPlugin({ graphMode: this.config.graphMode }, this.context); } catch (e) {}
  }

  get uptimePct() {
    if (!this.totalChecks) return null;
    // cumulative real uptime since monitoring started (1 decimal, not stuck at 100)
    return Math.round((this.okChecks / this.totalChecks) * 1000) / 10;
  }

  render() {
    try {
      const svg = generateSVG({
        host: this.host,
        urlText: this.urlText,
        status: this.status,
        lastMs: this.lastMs,
        code: this.lastCode,
        history: this.history,
        uptimePct: this.uptimePct,
        warnMs: this.config.warnMs,
        theme: this.config.theme,
        graphMode: this.config.graphMode,
        labels: this.config.labels,
        animFrame: this.animFrame,
        blinkOn: this.blinkOn
      });
      // setBaseDataIcon expects a base64 data-URI, not raw SVG (raw → black key)
      const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
      this.$UD.setBaseDataIcon(this.context, dataUri);
    } catch (e) {
      console.error('[Uptime] render error:', e.message);
    }
  }

  destroy() {
    if (this.checkTimer) { clearInterval(this.checkTimer); this.checkTimer = null; }
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
  }
}

// ── bootstrap ─────────────────────────────────────────────────────────────────
const $UD = new UlanzideckApi();
const CACHES = {};

$UD.connect('com.uptime.monitor.deck');
$UD.onConnected(() => dlog('connected to Ulanzi'));
$UD.onError((e) => console.error('[Uptime] Error:', typeof e === 'string' ? e : ''));

$UD.onAdd((jsn) => {
  const ctx = jsn.context;
  if (!CACHES[ctx]) CACHES[ctx] = new UptimeMonitor(ctx, $UD);
  if (jsn.param) CACHES[ctx].setConfig(jsn.param);
  else CACHES[ctx].render();
});

$UD.onParamFromApp((jsn) => {
  const inst = CACHES[jsn.context];
  if (inst && jsn.param) inst.setConfig(jsn.param);
});

$UD.onParamFromPlugin((jsn) => {
  const inst = CACHES[jsn.context];
  if (inst && jsn.param) inst.setConfig(jsn.param);
});

// press the key → cycle the graph mode (bars → line → minimal) and persist it
$UD.onRun((jsn) => {
  const ctx = jsn.context;
  if (!CACHES[ctx]) CACHES[ctx] = new UptimeMonitor(ctx, $UD);
  CACHES[ctx].cycleGraph();
});

$UD.onSetActive((jsn) => {
  const inst = CACHES[jsn.context];
  if (inst) inst.render();
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) {
    const inst = CACHES[item.context];
    if (inst) { inst.destroy(); delete CACHES[item.context]; }
  }
});

console.log('[Uptime] Main Service started');
