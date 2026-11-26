# Validation-worker application qualification on Linux

This is research evidence, not a release or an approval to ship. The independently reviewed application and lockfile revision is `328ecdbe89e903f0eae0e9112a5bfddf822e6fd8`. The tested candidate is `c8c843091c95cc03b16a9d22b62ec8b95d1ed36c`: its only changes after that reviewed revision are regenerated bundled notices and the native test harness. No version fields were changed. The frontend and `src-tauri` Git trees are `bef2bb580d3b7713c14b56090948195ac14f99b7` and `5cbaa6980624317920a7c3a98da711ddf69fbc6f` at both the notice commit and this candidate.

The target was Debian 13.8 x86-64, WebKitGTK 2.54.0, Node 24.22.2, Rust 1.90.0 and tauri-driver 2.1.0. Native tests used Xvfb, a temporary `MARKWRITER_PROFILE_DIR`, synthetic files and loopback canaries. This is neither an installed-package check nor macOS/Windows/Finder acceptance. No user document or profile was used.

## Pinned workers and notices

- The PlantUML renderer is `@plantuml/core@1.2026.10` using Smetana. Its production Worker was 2,965,743 bytes, SHA-256 `9fbde91eed0fc747a9570daefd0a2b0bc622519a42bf3170788e1dd55fd6c8bf`.
- The isolated validation Worker contains `@xmldom/xmldom@0.9.12`; its production and acceptance bytes were identical at 106,602 bytes, SHA-256 `7fe23cf46e89551ef80f6ef1517547a27d963d89f0ca629f6a5a7dcbc6325bd4`. Regeneration collected 792 third-party notices with zero missing, including the pinned XML dependency and its MIT text.
- Production frontend build and `tools/release-metadata.mjs --check-frontend` passed, including the guard excluding acceptance-only markers. The acceptance binary was a separate debug build with an explicit test bridge; its SHA-256 was `407c9b4259e5d88085aaaca1ba22bcf30676e6925d2e9083ca3c31b2cd1824ca`.

## Extracted release-mode package and native export

The unsigned amd64 research DEB was built from `c8c843091c95cc03b16a9d22b62ec8b95d1ed36c` on the named Debian host. It was **10,114,972 bytes**, SHA-256 `e0008be48938e1c9099fefb2d0a2dd94fdf118639ee16214da2aea6480e99aa0`; its extracted executable SHA-256 was `ca6f774480a88a0ea01c4c7ebed77b354205cd6bba6299b7067953d9429cc17a`. Its inherited `2.21.1` metadata does not identify a release of this research candidate. The DEB was extracted into a temporary task directory and **not installed**. A copy and SHA256SUMS are retained outside the checkout.

The [package result](pi-2.22-validation-package-linux.json) records a real WebKitGTK session from that extracted executable. WYSIWYG and Preview rendered the expected sequence/class labels; a missing theme retained its readable source. The actual File → Export as HTML and GTK Save File dialog produced a 7,280-byte standalone file with two static SVGs, readable fallback source, an active ordinary link and no script, image or external stylesheet link. Fixture bytes were unchanged. Both production Worker responses matched the hashes and restrictive CSP above.

This one observation measured 4,780 ms from process/session start to the two WYSIWYG diagrams and 3,546 ms for the subsequent Preview. Sampled summed RSS for the app and descendants peaked at 852,744 KiB over 48 samples; shared pages may be counted more than once and short peaks can be missed. A process start is not a cold operating-system cache, and these measurements are not a performance guarantee or a controlled comparison with the earlier renderer-only package.

## Native application acceptance

The exact synthetic results are in [the native log](pi-2.22-validation-native-linux.txt). The real Tauri WebView served both Worker assets with byte hashes matching the acceptance build and the same narrow policy: `default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'`. The app page reached `http://localhost:5173` under its unchanged CSP; the synthetic server recorded two positive-control requests. The acceptance-instrumented renderer Worker rejected HTTP, `file:` and same-origin fetches. The actual validation Worker rejected synthetic external-network-image, local-file-image and error-SVG-success cases; the server received no validator image request. Document includes and external images were rejected by the strict source grammar. These observations do not establish an OS-wide filesystem sandbox.

WYSIWYG and Preview rendered synthetic sequence and class diagrams. Malformed, include, missing-theme, external-image and >8 KiB source remained readable. The acceptance build produced self-contained HTML with two static SVGs, readable failure source, an active ordinary link and no script, image or external stylesheet link. Real WebDriver keyboard input, Undo, a recovery checkpoint and restart preserved the isolated dirty buffer; the source file bytes remained unchanged.

A unique acceptance-only renderer Worker request deliberately blocked synchronously: source fallback appeared after 5,318 ms and a fresh Preview succeeded. Separately, the harness withheld a unique message only after the real validation Worker signaled ready. Its active Preview owner, job ID and Worker URL were recorded; the corresponding Worker was terminated after the 5,348 ms timeout and readable source appeared. A second withheld validator request was terminated when switching documents; its source was visible while pending and the next Preview succeeded. The validation test induces a **message-delivery delay**, not a busy-validator execution-time measurement.

Observed acceptance times were WYSIWYG 3,044 ms, Preview 3,587 ms and HTML export 3,369 ms. The sampled sum of app and child-process RSS peaked at 918,936 KiB over 159 samples. Shared pages may be double-counted and short peaks can be missed; this is not an enforced memory bound or a latency guarantee.

## Direct validator probe

[The direct WebKitGTK result](pi-2.22-validation-direct-linux.json) records 16/16 synthetic cases passing against the exact 106,602-byte validator bundle. A separate test wrapper around those bytes signaled entry and then deliberately blocked. During a 51 ms hold, the page recorded eight timer ticks; after worker termination the source remained visible and a fresh request succeeded. The wrapper is distinct from production bytes, and this is a direct renderer probe, not packaged-app acceptance. EGL reported denied access to `/dev/dri/renderD128` and `/dev/dri/renderD129`; no GPU qualification is implied. The XML/native-parser differential corpus is finite and does not prove general parser equivalence.

## Verification

Focused checks passed: seven frontend files / 155 tests, four worker-response and acceptance-marker guard tests, and frontend lint. The initial full one-worker run at the default five-second timeout had 757 passes and one existing 96 KB Quick Look JSON highlighting timeout at 5.26 seconds. A full one-worker retry with a 10-second timeout passed 66 files / 758 tests; no assertions were changed. `cargo test --locked` passed 60 tests. The direct frontend command below is used because the root convenience script did not forward the worker flag to Vitest on this host.

The new architecture terminates a separate Worker for rendering and a separate Worker for validation under one captured deadline. Bounded source validation, message cloning, final DOM insertion and OS scheduling still occur outside that terminable computation. The observations above do not establish a preemptible hard end-to-end UI deadline or a hard process memory limit. Cross-platform fidelity, installed-package integration and Finder remain separate gates.

## Reproduction

At the tested candidate revision, with a matching pinned Node/Rust toolchain and Linux Tauri, WebKitGTK, WebKitWebDriver, tauri-driver, Xvfb, Python 3 and X11/XTest prerequisites:

```sh
npm ci --prefix frontend
npm --prefix frontend run test -- --maxWorkers=1 --testTimeout=10000
npm run lint --prefix frontend
npm run build --prefix frontend
node tools/release-metadata.mjs --check-frontend
node --test tools/worker-response-acceptance.test.mjs tools/acceptance-marker-guard.test.mjs
export CARGO_TARGET_DIR=/absolute/path/to/isolated-build-target
(cd src-tauri && cargo test --locked)
npm run build:acceptance --prefix frontend
node frontend/node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --ci --config src-tauri/tauri.acceptance.conf.json
MARKWRITER_BINARY="$CARGO_TARGET_DIR/debug/markwriter" GDK_BACKEND=x11 xvfb-run -a -s '-screen 0 1920x1080x24' node tools/plantuml-native-spike.mjs
xvfb-run -a /usr/bin/python3 tools/plantuml-validation-probe.py frontend/dist/assets/plantUmlValidateWorker-*.js
node frontend/node_modules/@tauri-apps/cli/tauri.js build --bundles deb --ci
mkdir -p /absolute/path/to/empty-extracted-package
dpkg-deb -x "$CARGO_TARGET_DIR/release/bundle/deb/MarkWriter_2.21.1_amd64.deb" /absolute/path/to/empty-extracted-package
MARKWRITER_BINARY=/absolute/path/to/empty-extracted-package/usr/bin/markwriter GDK_BACKEND=x11 xvfb-run -a -s '-screen 0 1920x1080x24' node tools/plantuml-package-spike.mjs
```

The native harness requires free loopback ports 24446, 24447 and 5173; it binds the canary only to `::1` and never terminates an existing listener. The controlled validator hold is confined to the test harness and does not alter the production Worker. All input and profile paths are temporary and synthetic.
