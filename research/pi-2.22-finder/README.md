# PI 2.22 Finder and macOS WebKit research

This is an **experimental research branch**, not a production implementation or
a Finder acceptance. The repository baseline is `6fd2c22e4acca40ef5318cc58c0a63747cf258a1`.
The Finder integration uses the pinned `@plantuml/core@1.2026.10`, Smetana, and
the validator and semantic checker from candidate revision `179ec568bbe993c0bc455f137ca9fc66091ee3b1`.
The separate Worker probe uses candidate revision `fba2315`. These snapshots
must be refreshed and independently reviewed before any integration.

The `f51ba5d` provisional prototype uses an earlier checker and builds on the
published v2.21.1 macOS DMG, SHA-256
`547998e500bf18c2a2e5a4bd78b6a3d55d04b26b379fda8b5f59e5c7cd71942e`.
The extension's `quicklook-render.js` was replaced with that provisional build;
the extension and containing app were re-sealed ad hoc with
`native/quicklook/Preview.entitlements`. The resulting *modified research DMG*
was 14,233,853 bytes, SHA-256
`0c523e63d3fffaf591c097698feb675af2a4c1e3df718e24b777ed9d1935b446`.
Its script was 9,822,517 bytes, SHA-256
`f27a1433dd2252c23ec4a64f9d21238625cc4dbec38764c2f6eae3a476a38cf9`;
the native script cap is 12,000,000 bytes. Asset and DMG hashes, Mac version,
strict seal checks, identifiers, signature details and observed existing
provider registration are retained in `results-f51ba5d/`. The experimental
extension was **not registered**, installed or selected by Finder. The existing
installed provider remained `/Applications/MarkWriter.app/.../MarkWriterQuickLook.appex`
version 2.19.3. The exact research DMG exists only in the task-owned Mac
temporary directory unless explicitly retained elsewhere.

## Direct WebKit renderer

On arm64 macOS 27.2.1, `direct-finder-plantuml.swift` called the unchanged
`QuickLookWebRenderer` with the script read from the mounted research DMG. This
instantiated a disposable WKWebView and the existing CSP and content rules, but
**did not invoke the packaged extension or Finder**. Raw output and checks are
in `results-f51ba5d/`. Sequence first/second calls took 480/358 ms and class
385 ms. These are single observations with no verified cold-start condition.
The probe's high-water RSS was 163,774,464 bytes; it excludes separate WebKit
content processes and is not total or peak system memory.

Sequence/class produced images and retained source. Rejected local include,
loopback include, external image, missing theme, malformed and oversized cases
returned escaped source without an image; a subsequent sequence succeeded. The
probe checks the entire escaped source as a substring of returned HTML, not
visual completeness. A loopback positive control succeeded and it was the only
request observed; the synthetic local file hash was unchanged and its contents
did not appear in output. Since these inputs were rejected before engine use,
this does not independently establish protection against a grammar bypass.
The unit boundary test injects an error SVG into the success callback and
expects source fallback; it does not exercise that callback in the package.

To rebuild the provisional script from this checkout, run `npm ci --prefix
frontend`, then `(cd frontend && ./node_modules/.bin/vite build --config
vite.quicklook.config.ts --outDir /absolute/new/output)`. The Vite build warns
that it replaces `import.meta` in the existing Viz dependency. On an isolated
Mac, verify the published DMG hash and seals, copy its app to a new temporary
directory, replace only the extension script, sign the extension with
`codesign --force --sign - --timestamp=none --entitlements
native/quicklook/Preview.entitlements`, then sign the host ad hoc and strictly
verify both. A newly constructed DMG is not expected to be byte-identical.

For the direct probe, compile `native/quicklook/QuickLookWebRenderer.swift`
and `direct-finder-plantuml.swift` with `xcrun swiftc`; start
`canary-server.py PORT_FILE REQUEST_FILE`, create a synthetic file containing
`SYNTHETIC-PLANTUML-SECRET`, and check a positive `/control` request. Run the
compiled probe with the mounted package's absolute script path, loopback base
URL and synthetic file path. Confirm the file hash before and after and that
`REQUEST_FILE` contains only `/control`. Use only synthetic data.
Alternatively, run `./research/pi-2.22-finder/run-direct-macos.sh
/absolute/candidate.dmg /absolute/new-results-directory` to perform these
steps with a disposable mount, local canary and cleanup.

## Direct macOS Web Worker

`worker-mac-probe.swift`, `worker-server.py`, and
`results-worker/plantuml-worker-probe.js` exercise the runtime Worker's actual
IIFE in a direct WKWebView under the experiment's app-page and Worker response
CSPs. The worker was built from candidate `fba2315` and its 2,965,462-byte
bundle had SHA-256
`96a210de1f16607167b1195c1153b275b9a7003ee57b2759c93e263a01eae275`.
Build it using that revision's `tools/plantuml-worker-vite.config.mjs`; the
bundle itself is not committed here. Place it as `worker.js` in a temporary
directory, start `worker-server.py DIRECTORY PORT_FILE REQUEST_FILE`, compile
`worker-mac-probe.swift` with `xcrun swiftc`, and run the resulting binary with
the loopback page URL and `results-worker/plantuml-worker-probe.js` path.
The only change to the upstream probe script is its macOS result label.

The retained output shows 142 ms Worker startup, 83 ms sequence and 41 ms
class, source fallback for six rejected inputs, and success after a controlled
1 ms termination. The test does **not** establish that the terminated work
started or that a real deadline can interrupt work. It does not qualify the
packaged app, its production host worker manager, installed application, or
Finder. The server recorded only the page and worker scripts.
The equivalent runner is `./research/pi-2.22-finder/run-worker-macos.sh
/absolute/worker.js /absolute/new-results-directory`.

## Remaining gates

Actual Finder through the requested existing VNC connection, exact provider
identity, visual fidelity, correlated timeout and next successful preview,
production app and self-contained export qualification, enforced access
boundaries, shared budgets and independent review remain open. A visually
open VNC session existed, but the automation surface exposed no native window;
no alternate visual testing route was used. The research-only DMG and its
direct-renderer result do not close these gates or authorize Finder production
work.
