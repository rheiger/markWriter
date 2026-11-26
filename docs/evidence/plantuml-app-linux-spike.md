# PlantUML application spike — Linux evidence

This is a research candidate, not a published release or an approval to ship. It retains the `2.21.1` version metadata because no patch has been allocated. Do not install this research package alongside the published release. The application source started at `6fd2c22e4acca40ef5318cc58c0a63747cf258a1`; the production package was built from candidate commit `23cf84d0afcb99c09b55b3724cd54f7ffac25760`. Later commit `531a4af60be432646ffe26b941f5e9a0560900eb` adds only the package-export test harness; the `frontend/` and `src-tauri/` trees are identical between those commits.

## Target and artifacts

- Debian 13.8 x86-64, WebKitGTK 2.54.0, Node 24.22.2, Rust 1.90.0, tauri-driver 2.1.0. Xvfb was used with a temporary `MARKWRITER_PROFILE_DIR` and synthetic files. No package was installed or registered.
- Local unsigned `MarkWriter_2.21.1_amd64.deb`: **10,082,944 bytes**, SHA-256 `da6b2e5bc3a957a4c33fe0670353c8c09875a0a5942de8e015104b1d80c16044`. The extracted `usr/bin/markwriter` SHA-256 is `4971c688e1a59698875b62967b4996a66d63acdb6915da154a7f42a6162c63be`.
- Pinned `@plantuml/core@1.2026.10`, Smetana fallback, no installed Java or runtime download. The production worker is **2,965,743 bytes**, SHA-256 `9fbde91eed0fc747a9570daefd0a2b0bc622519a42bf3170788e1dd55fd6c8bf`. MIT text is in the bundled notices. No controlled comparison establishes a startup, fidelity or size advantage over Viz.
- The instrumented native acceptance binary is separate from the package binary; SHA-256 `fcebb12a06ad8ce86df6d516642ea7fd83acbdc078e148db28d628e0ad15faee`. Its test-only probes are excluded from production output by the release-metadata marker guard.

## Extracted package and actual HTML export

`tools/plantuml-package-spike.mjs` launched the executable **extracted from the DEB**, not an installed app. It used real WebKitGTK, tauri-driver and a synthetic document with sequence, class and missing-theme fences. WYSIWYG and Preview showed the expected Alice, Bob, Request, User, Order, field and relationship labels; the unsupported theme retained readable source. The native File → Export as HTML flow and GTK Save File dialog wrote a 7,280-byte HTML file. Its parsed contents had two static SVGs, readable failure source, an active ordinary link, and no script, external stylesheet link or image. The original fixture bytes were unchanged.

One observed run measured **3,751 ms** from process/session start to two WYSIWYG diagrams, and **2,981 ms** from switching to Preview to two diagrams. This is a cold process start followed by a warm app view, not a cold operating-system cache or a distribution-wide latency guarantee. Sampled summed RSS for the app and its descendant processes peaked at **851,864 KiB** across 38 samples; shared pages may be counted more than once and short peaks can be missed. The actual `tauri://localhost/assets/plantUmlWorker-*.js` response matched the worker hash above, `text/javascript`, and the restrictive local-worker CSP.

## Native acceptance and controls

The acceptance-only build exercised real application/store/IPC export, WebKitGTK and a separate synthetic input corpus. It rendered sequence and class in WYSIWYG and Preview; kept malformed, local/HTTP include, missing-theme, external-image and >8 KiB input as readable source; exported static HTML with fallback and an active ordinary link; and left the fixture bytes unchanged. Real WebDriver keyboard input, Undo, checkpoint and process restart restored the isolated dirty synthetic buffer. The acceptance binary contains a test bridge and is not the shipped binary.

The app page fetched the synthetic `http://localhost:5173/page-positive` endpoint twice under the **unchanged** app CSP; the server recorded two requests. An acceptance-instrumented worker attempted HTTP, local `file:` and same-origin asset fetches under the real worker response CSP; all three promises rejected and the server observed no worker request. The page also successfully fetched the exact same-origin worker asset. A separate OS-level HTTP positive control passed. Document-supplied includes and the external image were rejected by the strict grammar before worker creation. These tests do not establish a general OS filesystem sandbox or cover other platforms.

For a controlled timeout, one exact acceptance-only synthetic request deliberately blocked its worker. The application showed its readable source fallback after **5,306 ms** and then rendered a new preview successfully. This is an induced delay, not normal-load latency or Finder evidence. The acceptance run observed WYSIWYG **2,400 ms**, Preview **2,998 ms**, export **2,514 ms**, and a sampled RSS sum of **896,184 KiB** (102 samples; shared-page and short-peak limitations apply).

Input bytes, lines, entities, members, relationships, output size, active worker count, queue length and admitted job deadlines are explicitly bounded. A fresh Worker is terminated after every job; callback SVG is checked against the captured source before strict, resource-free sanitization. The checker and sanitizer execute synchronously on the document thread: their bounded inputs and post-validation deadline check do **not** establish a preemptible hard UI-thread time or memory limit. Platform fidelity and inaccessible/unsupported diagram constructs remain open; unsupported input must stay source. This evidence does not qualify macOS, Windows, installed-package integration or Finder.

## Verification and reproduction

The frontend suite passed **64 files / 667 tests** on `3b0cc83`; the subsequent narrow monotonic-clock change passed its **21 focused renderer tests** and frontend lint. Rust `cargo test --locked` passed **60 tests** on the candidate tree. A focused semantic/sanitizer suite passed, including error SVGs returned through success callbacks, incorrect endpoints and geometry, hidden marks, a genuine private field, and source/owner mismatches. The production frontend build and release-metadata guard passed. The root convenience command `npm run frontend:test -- --maxWorkers=1` did not actually forward the flag through nested npm on this host; the direct frontend invocation below did.

From a checkout of the research branch with Node 24, Rust 1.90, WebKitGTK development dependencies, tauri-driver, WebKitWebDriver, Xvfb, Python 3 and X11/XTest available:

```sh
npm ci --prefix frontend
npm --prefix frontend run test -- --maxWorkers=1
npm run lint --prefix frontend
npm run build --prefix frontend
node tools/release-metadata.mjs --check-frontend
node --test tools/acceptance-marker-guard.test.mjs

export CARGO_TARGET_DIR=/absolute/path/to/isolated-cargo-target
(cd src-tauri && cargo test --locked)
node frontend/node_modules/@tauri-apps/cli/tauri.js build --bundles deb --ci
mkdir -p /absolute/path/to/empty-extracted-package
dpkg-deb -x "$CARGO_TARGET_DIR/release/bundle/deb/MarkWriter_2.21.1_amd64.deb" /absolute/path/to/empty-extracted-package
MARKWRITER_BINARY=/absolute/path/to/empty-extracted-package/usr/bin/markwriter GDK_BACKEND=x11 xvfb-run -a -s '-screen 0 1920x1080x24' node tools/plantuml-package-spike.mjs

npm run build:acceptance --prefix frontend
node frontend/node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --ci --config src-tauri/tauri.acceptance.conf.json
MARKWRITER_BINARY="$CARGO_TARGET_DIR/debug/markwriter" GDK_BACKEND=x11 xvfb-run -a -s '-screen 0 1920x1080x24' node tools/plantuml-native-spike.mjs
```

Both test harnesses use loopback ports 24446/24447. The acceptance control also requires port 5173 to be free; it binds only `::1` and never terminates an existing listener. The GTK save-dialog helper is specific to the isolated Xvfb geometry above. Build packages from the exact package commit for hash comparisons: rebuilding later evidence-only commits is not guaranteed byte-for-byte identical. Synthetic host-generated profile, file and canary paths differ each run.
