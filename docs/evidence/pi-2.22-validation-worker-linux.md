# Direct Linux validation Worker evidence

This experiment is based on `024de1692c05645cf820763278a8e26f1d59b83e` plus the validation-worker changes in this branch. It is a direct synthetic WebKitGTK probe, **not** an installed MarkWriter or macOS/Windows qualification. Linux Debian 13 x86-64; Node 24.22.2; npm 11.19.1; WebKitGTK 2.54.0; Python 3.13.5; PyGObject 3.50.0; Xvfb. EGL reported denied GPU access.

The validation Worker bundles the pinned MIT-licensed `@xmldom/xmldom@0.9.12` and installs a narrowly scoped adapter for the existing checker and strict non-lossy SVG sanitizer. Parsing stops on warnings, uses XML namespaces, rejects DTDs, entities, CDATA and unexpected processing instructions, and never enables external-resource resolution. This is a different parser from native WebKit DOMParser; parity is tested only against the checked-in fixture/mutation corpus and is not a general equivalence proof. LinkeDOM 0.18.15 was rejected during exploration because its XML mode silently repaired malformed markup and reported the tested SVG namespace as HTML.

```sh
npm ci --ignore-scripts --prefix frontend
npm --prefix frontend run build
xvfb-run -a /usr/bin/python3 tools/plantuml-validation-probe.py frontend/dist/assets/plantUmlValidateWorker-*.js
```

The measured validation bundle is 105,789 bytes, SHA-256 `421d0d6f1900a644e354c913d675e3f1909c58a1b1aab67427dc21d9d89f67f5`. [Raw JSON](pi-2.22-validation-worker-linux.json) identifies each case and the exact CSP. Two real generated synthetic SVG fixtures passed; seven malformed, external-resource or semantically corrupted outputs failed. One observation took 18 ms for sequence and 8 ms for class; these are not performance guarantees. The loopback canary positive control was reachable from the host, and its log contains only the control and the three expected worker loads. This does not by itself prove installed-app access restrictions.

For interruption, a separate synthetic wrapper around the measured Worker posted an entry signal and then deliberately blocked; its distinct SHA-256 is in the JSON. During a 50 ms hold the WebKitGTK host recorded eight event-loop timer ticks, terminated the worker, retained synthetic source text, and validated a fresh request successfully. This demonstrates a direct Worker interruption mechanism only; it does not claim natural workload timing, a packaged application check, or a guaranteed scheduler deadline.

The app controller now uses separate render and validation workers under one captured deadline, terminating the current worker on timeout or cancellation. XML parsing, semantic checks and sanitization are not executed in the document response handler. Structured cloning/dispatch of bounded SVG data, bounded source validation, the final result transfer and final document DOM insertion still occur on the document side and are not preemptible. OS scheduling and memory pressure can delay timer delivery. Thus this does **not** prove a hard end-to-end UI responsiveness bound. The new parser, its restricted selector adapter, actual Tauri worker response bytes/CSP, behavior on each supported platform, and the final integrated revision need independent review and native/installed qualification before any release.
