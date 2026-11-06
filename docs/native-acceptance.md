> **Current qualification — 2.1.0-alpha1:** Core implementation and final-source three-platform evidence are recorded below and in [editing/navigation acceptance](editing-navigation-2.1.0-alpha1.md). Historical runs remain separate.

## 2.1 editing/navigation qualification

Source `2895d1c`, version `2.1.0-alpha1`; final [CI 42145312950](https://github.com/rheiger/markWriter/actions/runs/42145312950) passed all jobs; both downloaded Windows/Linux artifacts confirm 22 passing application cases. Harness now has 22 actual application cases per Windows/Linux, including new source caret, unequal-font content anchors, sync-off independence, rendered/source search scopes, ReplaceAll/Undo/native Save fidelity and mapping-free export. Builds remain isolated; production Rust commands/dependencies are unchanged. See [full acceptance](editing-navigation-2.1.0-alpha1.md) for exact results, ordinary macOS dialog/restart/Settings/search/picker/export checks, and remaining OS-dialog/IME/release limits. Older results below are chronological history.


# Native application acceptance

The current productivity harness extends the historical eight-case baseline below. It targets the active document owner before interacting with retained editors, exercises duplicate-path tabs, contextual table boundaries, Save All, actual preferences IPC, fold byte preservation, Mermaid ERD preview/export, a process restart after flushing an unnamed draft, and dirty Close Cancel/Discard. The restart uses an explicit exit only in the isolated acceptance bridge after confirmed persistence; ordinary Close/Quit protection remains tested separately. Native writes are real. OS path dialogs are bypassed with explicit generated paths on Windows/Linux; macOS dialogs/recovery are exercised directly.

Final alpha.2 evidence: [CI 42132949169](https://github.com/rheiger/markWriter/actions/runs/42132949169) passed at source `6c6eb56`, including 68 frontend tests and all three native jobs. The Windows and Linux artifacts each report all 16 application cases passed and were independently inspected. See [productivity report](productivity-increment-2026-11-06.md).

## Historical stabilization harness

The v2 CI runs `tools/native-acceptance.mjs` on Windows and Linux using real WebView2/WebKitGTK, real editor engines, real store actions and real Tauri file commands. No backend commands are mocked. OS path dialogs are bypassed using explicit temporary fixture paths; this does not establish OS dialog acceptance. macOS file/dialog/quit workflows were exercised separately through the native app.

The test checks the About dialog version, toolbar mode-switch operation, five unchanged mode cycles, byte-identical Save As, a WYSIWYG edit, three edited cycles, Save/reopen, export with three Mermaid SVGs/table/tasks, and Markdown table insertion becoming an editable WYSIWYG table. Failures retain page HTML, a screenshot when available, and driver logs as CI artifacts for seven days. Only generated fixture data is captured.

## Isolation

`npm run build` excludes the acceptance bridge. `npm run build:acceptance` includes it in a separate `dist-acceptance` output. CI checks both built outputs for the marker before any native test. The separate Tauri configuration gives the acceptance app a separate identity and embeds only the acceptance output. It installs no application-side driver/server plugin and changes no production capabilities.

The bridge exposes real store actions; it is not a fake backend. Keep it gated behind Vite's statically replaced acceptance mode. Do not enable that mode for release packaging.

## Running on Windows/Linux

From the repository root:

```sh
npm ci --prefix frontend
npm run build --prefix frontend
npm run build:acceptance --prefix frontend
node tools/native-acceptance.mjs --check-builds-only
cd src-tauri
node ../frontend/node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --ci --config tauri.acceptance.conf.json
cd ..
cargo install tauri-driver --version 2.1.0 --locked
node tools/native-acceptance.mjs
```

Linux requires `WebKitWebDriver` (package `webkitgtk-webdriver` on Ubuntu 26, or `webkit2gtk-driver` on older Debian/Ubuntu) and a display. CI runs under `xvfb-run -a` with `GDK_BACKEND=x11`. Windows needs a Microsoft Edge driver matching the actual WebView2 runtime's first three version components. The CI setup script downloads from Microsoft's official host and verifies that match. GitHub Windows runners are elevated; WebView2 150+ prevents the external driver from opening its debug port in that context. CI runs the test process tree at Medium integrity using a checksum-pinned portable gsudo, following the [verified upstream fix](https://github.com/webdriverio/desktop-mobile/pull/637). Only the existing runner user receives Modify access to the disposable workspace; no application security policy is relaxed.

Optional environment variables select an explicit driver/application: `MARKWRITER_TAURI_DRIVER`, `MARKWRITER_NATIVE_DRIVER`, `MARKWRITER_BINARY`. The protocol uses loopback ports 4444/4445; run one suite at a time on a machine. It only creates temporary fixture files and closes its own driver session/processes.

## Sources and choice

[Tauri manual WebDriver setup](https://v2.tauri.app/develop/tests/webdriver/manual-setup/) supports Windows/Linux. [Microsoft driver compatibility](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/#download-microsoft-edge-webdriver) requires matching the first three components. The small Node client follows the [W3C WebDriver script endpoints](https://www.w3.org/TR/webdriver2/#executing-script). [Vite modes](https://vite.dev/guide/env-and-mode) provide build-time isolation.

The alternative embedded WDIO driver currently requires Tauri >=2.10; this project locks 2.8.4. The external driver keeps test tooling separate from the application dependency graph. This compatibility choice is now verified: [CI 42092300007](https://github.com/rheiger/markWriter/actions/runs/42092300007) passed all seven application cases on Windows and Linux at code commit 4c18dda. macOS native tests/build passed in that run; macOS interactive acceptance is recorded in the stabilization report.

UI follow-up: [CI 42121100607](https://github.com/rheiger/markWriter/actions/runs/42121100607) passed at ba99ae9, with eight application cases each on Windows/Linux, including About version and the relocated toolbar mode switch. macOS native tests/build and direct UI control verification passed as well.
