# draw.io offline feasibility spike — 6 November 2026

**Decision: defer the product integration.** The core four-feature increment remains complete; no draw.io control, hosted iframe, vendor assets or XML representation is added to MarkWriter. Mermaid ERD remains explicitly the existing diagram format.

## What was actually tested

After the core application cases passed on Windows/Linux, downloaded the official pinned [draw.io v32.6.10 archive](https://github.com/jgraph/drawio/releases/tag/v32.6.10) into an isolated temporary directory, extracted it, and served it only on loopback. A separate Chromium page embedded the local runtime with `embed=1&proto=json&offline=1&libraries=1&ui=min&spin=1`. Non-loopback requests were blocked. The child was served with MarkWriter's current HTML CSP, including no `unsafe-eval`. Parent messages checked the exact iframe source and same origin.

The local runtime emitted `init` and accepted a dummy CUSTOMER/PK entity model, returning `load`, bounds and the same XML. There were zero blocked remote requests and zero console/page errors during this basic boot/load experiment. This establishes a useful local/offline starting point; it does not establish native Tauri packaging or a complete graphical editing workflow.

Archive footprint: 49,729,549 downloaded bytes; 120,167,747 uncompressed bytes across 3,285 entries. SHA-256: `a57b06b3b6a876a351dacfe65d027d9509319cd030e9bacf6ae04a034d66a38f`.

## Gates still unproven

- Native Tauri asset/protocol resolution, frame policy and local runtime packaging on all three platforms. The loopback HTTP experiment is not native WebView acceptance. The vendor's [embed documentation](https://www.drawio.com/docs/reference/embed-mode/) describes support for its hosted embed origin; a pinned local distribution needs its own qualification.
- Complete redistribution/attribution inventory. The [core repository license](https://github.com/jgraph/drawio/blob/v32.6.10/LICENSE) is Apache-2.0, while the inspected templates/stencils/image directories include separate Creative Commons Attribution 4.0 notices. The full 120MB payload cannot be treated as one already-qualified application dependency.
- Apply/Cancel after actual graphical edits, portable editable XML plus sanitized SVG, safe rejection of hostile XML/SVG and external-resource references, byte/semantic persistence through both editors and tabs, missing-asset behavior, self-contained export and offline save/reopen. An echoed load message is not evidence that these pass.

These are necessary integration gates, so the spike has not passed the agreed acceptance set. Shipping the currently demonstrated boot/load path would leave an unqualified second persistence/rendering format. A future bounded follow-up should first select and attribute a minimal pinned runtime, prove it in the native acceptance app, then qualify a document codec and SVG/XML sanitization before adding product controls. No CSP relaxation, remote service or substitute Mermaid claim was introduced.

Local experiment evidence: `/tmp/markwriter-drawio-spike/result.json`, `result.png`, `check.mjs`, `server.py` and the pinned extracted archive. These are disposable generated investigation files; none are production assets.
