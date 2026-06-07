# Third-Party Licenses

This plugin bundles the following third-party library. It is the property of its
respective authors and is distributed under its own license.

| Component | Use | License | Copyright |
|-----------|-----|---------|-----------|
| `ws` (`node_modules/ws`) | WebSocket client for the Ulanzi SDK channel | MIT | © 2011 Einar Otto Stangvik and contributors |
| `libs/node/*`, `libs/js/*` | Ulanzi UlanziDeck SDK | © Ulanzi | © Ulanzi Technology |

No external online services are used. Uptime checks are plain HTTP/HTTPS requests
made directly to the URL the user configures, via Node's built-in `http`/`https`
modules — no third-party API, no telemetry, no API keys.

## Desktop notifications

Notifications use the operating system's own tools via `child_process`:
- **Windows:** PowerShell + the Windows Toast API (no bundled binary).
- **macOS:** [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) (MIT, © Julien Blanchard) when available on PATH/Homebrew, otherwise the built-in `osascript`. `terminal-notifier` is **not** bundled; see `assets/mac/README.md` for the optional install that enables branded banners.

---

## MIT License (ws)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the above copyright notice and this permission
notice being included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```
