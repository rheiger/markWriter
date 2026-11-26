# PI 2.22 app baseline research — 26 November 2026

This is research against `6fd2c22e4acca40ef5318cc58c0a63747cf258a1`, not a production change or a PlantUML candidate. v2.21.1 has no PlantUML runtime: a `plantuml` fence is ordinary escaped code. None of these observations establishes resource blocking, deadline, concurrency or memory bounds for a PlantUML engine.

## Extracted released package Preview

Linux x86-64 Debian 13, Node 24.22.2, WebKitGTK, Xvfb and tauri-driver, isolated `MARKWRITER_PROFILE_DIR` and a generated fixture. Release `MarkWriter-2.21.1-ubuntu-26.04-x64.deb` SHA-256 `b58ea7e1d61f50e84e164da9c920cb934d2fed8cdac5f08a9ca2ddd5efbb24f3` matched the release SHA256SUMS; its extracted executable SHA-256 was `87e3818415b5c29708b01a843c8b88fe763d87f47af34428a563721998972122`. The executable was run **extracted, not installed**. It opened the synthetic file in WYSIWYG, then switched to Split. The WebDriver probe saw the unchanged source in Preview as ordinary code, no diagram SVG, and unchanged fixture bytes. It does not test actual installed package integration.

```sh
mkdir -p /tmp/markwriter-pi222-app-artifacts
gh release download v2.21.1 --repo rheiger/markWriter --pattern 'MarkWriter-2.21.1-ubuntu-26.04-x64.deb' --pattern SHA256SUMS --dir /tmp/markwriter-pi222-app-artifacts
cd /tmp/markwriter-pi222-app-artifacts
sha256sum --check --ignore-missing SHA256SUMS
dpkg-deb -x MarkWriter-2.21.1-ubuntu-26.04-x64.deb extracted
cd /path/to/research-worktree
MW_BINARY=/tmp/markwriter-pi222-app-artifacts/extracted/usr/bin/markwriter GDK_BACKEND=x11 xvfb-run -a -s '-screen 0 1920x1080x24' node tools/pi222-release-baseline.mjs
```

The probe requires tauri-driver and WebKitWebDriver on PATH and free loopback ports 24444/24445; it creates and removes its own profile and fixtures. Output: `result: pass`, `fixtureUnchanged: true`.

## Export function and standalone file

The separate Vitest research test invokes the existing `renderMarkdownHtml` and `createHtmlExport` functions. Eight synthetic inputs (sequence, class, malformed syntax, local include, HTTP include, missing theme, external image and 1,000-line over-budget example) were each checked in Preview markup and generated HTML: **16/16 passed**, retaining the exact source inside code and producing no script, image or diagram SVG; the HTML retained an ordinary active link. A seventeenth test writes the normal function output as a file for independent loading.

```sh
npm ci --prefix frontend
MW_PI222_EXPORT_PATH=/tmp/markwriter-pi222-export.html npm run test --prefix frontend -- src/lib/pi222BaselineResearch.test.ts
google-chrome --headless --no-sandbox --disable-gpu --disable-background-networking --host-resolver-rules='MAP * ~NOTFOUND' --user-data-dir=/tmp/mw-pi222-browser --dump-dom file:///tmp/markwriter-pi222-export.html
```

The local run reused the original checkout's lockfile-installed dependencies; the test reported **17/17 passed**. Chrome loaded the function-generated local HTML file with DNS resolution disabled. Parsing the resulting DOM confirmed the source, an ordinary `https://example.com/` link, and no script, stylesheet link, image or SVG. This is a browser load of HTML produced directly by the source function, **not a file exported by the packaged application**, and DNS suppression is not a network isolation proof. Attempts to operate the extracted app's GTK Save dialog under Xvfb did not produce an export file; the packaged-export gate remains unproven.

## Production candidate still needed

A PlantUML candidate needs a bounded renderer, worker response policy matching the existing strict CSP approach, a conservative supported grammar and fail-closed error-SVG detection, source-preserving failures including export, and host-level input/output/concurrency/deadline tests. The existing `htmlExport.ts` math path demonstrates per-block source fallback; DBML currently throws the overall export on error and is not evidence of this behavior. No runtime, layout selection, candidate bundle size, cold/warm performance, memory, resource isolation, editing/Undo/recovery or packaged export/Finder acceptance is established here.
