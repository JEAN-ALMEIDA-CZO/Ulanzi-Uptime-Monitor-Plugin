<p align="center">
  <img src="com.uptime.monitor.ulanziPlugin/assets/marketing/banner.png" alt="Uptime Monitor" width="100%">
</p>

<h1 align="center">📡 Uptime Monitor — Ulanzi Deck Plugin</h1>

<p align="center">
  <b>Watch any website, API or server live from a key.</b><br>
  Real-time latency graph, status colors, and a blinking red alert when it goes down.
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.0.0-22c55e">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0f172a">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-22c55e">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-10%20locales-3b82f6">
</p>

---

## ✨ What it does

Type a URL on a key and the plugin keeps pinging it on a schedule, turning the
key into a live status board:

- **Status color** — 🟢 **UP** (online), 🟠 **SLOW** (high latency / flapping), 🔴 **DOWN** (blinking alert), ⚪ **CHECK** (in flight).
- **Live latency graph** — a real-time bar chart of the last 32 checks; failed checks show a full-height red bar.
- **Current latency** in milliseconds, the **host** being watched, and the **uptime %** over the recent window.
- **Blinking red** when the site is down — impossible to miss.
- **Desktop notifications** (Windows + macOS) when a site goes **down** and when it **recovers** — fired only on transitions, no spam.
- **Press the key** to cycle the graph (Bars → Line → Minimal).

No API keys, no third-party service, no telemetry — checks are plain
HTTP/HTTPS requests straight to your URL.

---

## 🎛️ Settings

| Option | Description |
|--------|-------------|
| **URL / Domain** | The address to monitor (e.g. `example.com` or `https://api.site.com/health`). |
| **Check every** | Interval between checks, in seconds (min 5). |
| **Slow above** | Latency threshold (ms) above which the status turns orange. |
| **Timeout** | How long to wait before a check counts as down (ms). |
| **Theme** | 6 color themes (Midnight, Carbon, Ocean, Grape, Slate, Mono). |

A 4xx/5xx HTTP response counts as **down** (the server answered with an error).

---

## 🌍 Languages

English · Português (BR/PT) · Español · Français · Deutsch · 日本語 · 한국어 · 中文 (简体/繁體)

UI and the built-in **tutorial page** auto-detect the Ulanzi/system language.

---

## 💾 Installation

### From the Ulanzi Store
Search for **Uptime Monitor** in the UlanziDeck plugin store and install.

### Manual / from source
1. Clone or download this repository.
2. Run `npm install` (installs the single dependency, `ws`).
3. Copy the folder `com.uptime.monitor.ulanziPlugin` into:
   - **Windows:** `%AppData%\Roaming\Ulanzi\UlanziDeck\Plugins\`
   - **macOS:** `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/`
4. Restart **UlanziDeck Studio**.

> Requires UlanziDeck software **2.1.0+**.

---

## 🛠️ Tech & compatibility

- **Cross-platform** — pure Node `http`/`https` for checks, `os`/`path` for any paths. Windows + macOS.
- **No native binaries** — single pure-JS dependency (`ws`), fully portable.
- **Per-key instances** — each key monitors its own URL on its own interval.
- **Lightweight** — the key icon is a generated SVG; the animation loop only runs while a key is unstable.
- **Debug logging** off by default; enable with `UPTIME_DEBUG=1`.

---

## 📦 Project structure

```
com.uptime.monitor.ulanziPlugin/
├── manifest.json
├── plugin/app.js               # backend: per-key monitors + SVG renderer
├── property-inspector/
│   ├── inspector.html / .js     # settings panel + live preview
│   └── tutorial.html            # modern multi-language guide
├── libs/                        # Ulanzi SDK + css
├── assets/icons/                # brand / action / category icons
├── <locale>.json                # 10 localization files
├── LICENSE
└── THIRD-PARTY-LICENSES.md
```

---

## 📄 License

Released under the **MIT License** — see [LICENSE](com.uptime.monitor.ulanziPlugin/LICENSE).
The bundled `ws` library is credited in [THIRD-PARTY-LICENSES.md](com.uptime.monitor.ulanziPlugin/THIRD-PARTY-LICENSES.md).

---

<p align="center">Made by <b>Jean Almeida</b> for the Ulanzi Deck community.</p>
