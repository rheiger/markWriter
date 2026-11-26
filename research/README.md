# PI 2.22: direct WebKitGTK PlantUML research

These are disposable **direct renderer probes**, not packaged application, self-contained export, macOS, Finder, or production acceptance. Baseline is `6fd2c22e4acca40ef5318cc58c0a63747cf258a1`; this extends the [PI 2.21 result](https://github.com/rheiger/markWriter/issues/184#issuecomment-7192161440), rather than substituting for its missing gates. It does not change the app or its CSP.

## Candidate and host

- `@plantuml/core@1.2026.10`: npm tarball SHA-256 `00e3d2849d443dd77d6ca9bdf8aedc63bd26ff86025972b617cb96f4678655ca`; engine `plantuml.js` SHA-256 `c6664799aaa464319b5e1070a69850b93a7ea23ee41a23e920a8f2086e7da21c`, 3,238,458 bytes. The package declares MIT; dependency and distribution notices still need complete review. No optional assets or Viz are loaded, so these results use the built-in Smetana fallback and do not establish a controlled Smetana/Viz comparison.
- Debian GNU/Linux 13 x86-64, kernel `6.12.117+deb13-amd64`, WebKitGTK 2.54.0, Python 3.13.5, PyGObject 3.50.0, Node 24.22.2, npm 11.19.1, Xvfb. GPU access was denied (EGL warnings); no graphical fidelity review was performed.
- Timings in `webkit-results.json` are individual renderer callback wall times *after* code injection, not app/Finder cold-start benchmarks. The full observed test interval is also recorded. Memory was not measured. The raw runtime archives and binaries are deliberately excluded.

## Reproduce

From the research worktree root with those installed prerequisites:

```sh
npm pack @plantuml/core@1.2026.10 --pack-destination .
printf '%s  %s\n' 00e3d2849d443dd77d6ca9bdf8aedc63bd26ff86025972b617cb96f4678655ca plantuml-core-1.2026.10.tgz | sha256sum -c -
tar -xzf plantuml-core-1.2026.10.tgz
printf '%s  %s\n' c6664799aaa464319b5e1070a69850b93a7ea23ee41a23e920a8f2086e7da21c package/plantuml.js | sha256sum -c -
xvfb-run -a /usr/bin/python3 research/webkit-probe.py
xvfb-run -a /usr/bin/python3 research/deadline-controller.py
```

The first probe uses a disposable directory and a loopback canary server. A browser fetch succeeds without the CSP; the same-origin protected fetch fails and the server records only the positive controls. A file canary is readable by the host but the protected page's fetch fails; there is no permissive WebView file-access positive control, so the cause cannot be assigned solely to CSP. The protected document uses the exact Quick Look CSP string, but the host injects trusted JavaScript using WebKitGTK's evaluation API: it is **not** the packaged WKUserScript/content-rule implementation. The PlantUML include inputs and an image reference are run only through the direct renderer. The output SVG is not displayed, and no absence-of-load conclusion applies to an untrusted SVG inserted into a real page.

## Observations and decision

- Synthetic sequence/class examples return SVGs containing their expected text. On this one run they took 519 and 230 ms respectively; this does not establish fidelity or predictable performance.
- Malformed input and local/network include examples return via the **success** callback despite error output. Missing themes silently return a normal diagram. A valid message containing `Syntax Error` also matches those words, so filtering SVG text for those words would reject valid content and is not a reliable error contract.
- The document fetch canaries were blocked in this test; this is not evidence about native app resource rules, sandboxing, all resource types or external SVG references in production.
- The second probe uses a separate GTK/WebKit process executing an induced infinite JavaScript loop; after READY, a controller kills its process group after one second, then renders a representative diagram in a **new** process. It demonstrates the synthetic supervisor can interrupt and restart; it does not interrupt an actual PlantUML render, preserve visible source, measure a Finder request, or prove production app deadlines. A mere promise timeout cannot interrupt synchronous code. The package's own worker example uses a DOM-backed iframe, and the engine directly calls `document.createElementNS`, canvas and SVG DOM APIs; reusing MarkWriter's DOM-free DOT worker is not demonstrated.

**No-go for production on this evidence.** Reliable syntax/error classification, supported grammar, fail-closed SVG validation, source-preserving fallback, explicit input/output/concurrency bounds and host-enforced cancellation remain to be demonstrated. No app/export/Finder, installed package, actual provider, isolated-profile user workflow, cross-platform, accessibility, peak memory, bundle-size or visual-fidelity gate is established here. The PI 2.21 host/provider evidence remains distinct. This is a reproducible research limitation, not proof that a safe solution is impossible.
