# MarkWriter 2.1.0-alpha2 qualification

6 November 2026 — implementation in progress on `codex/offline-dot-alpha2`. **No merged/tagged/released alpha2 is claimed.** The [alpha2 plan](next-increment-2.1.0-alpha2-plan.md) remains the scope and acceptance record.

## Product boundary

DOT Preview, opaque WYSIWYG atoms, `dot`/`graphviz` codecs, source folds/search, block fallback correspondence, job ownership and sanitized static export are implemented. The Insert starter is withheld until native safety/runtime gates pass. Limits and supported attributes/resources/paint/Unicode behavior are in the [ADR](adr-offline-dot.md) and [Markdown guide](supported-markdown.md). The exact Richie sentence is preserved.

The pinned offline worker has64KiB input,2MiB SVG,2s layout plus5s startup and32 waiting jobs. It has no hard memory bound. Strict worker response CSP permits WASM while denying connections and resource surfaces; the document does not gain general eval/WASM permission. Sanitization reconstructs bounded geometry/text. No network/files/images/HTML labels/links/CSS/gradient resources are supported.

## Qualified local layers

At application source `4c491277c91b5a2da3f0548067d9bf880d64f37f`:124 frontend tests,19 Rust tests and4 release/process tests pass, along with lint/typecheck, production and isolated acceptance builds, bridge exclusion and zero-advisory dependency audit. Subsequent test/package/doc changes require final-source CI.

[Production browser probe](evidence/offline-dot-alpha2-browser.json): actual pinned WASM, exact emitted worker SHA matching the ordinary production build, enforced response policy, Unicode, malformed/empty/resource/gradient/input/output bounds, dense layout termination and recovery.228 UI timer beats in2290ms; all observed resource origins loopback; no unexpected warnings/errors. Editor checks cover800/1024/1440px, light/dark, fonts18/24,1,067,096-character folded source, folded DOT search/ReplaceAll/keyboardUndo restoring exact SHA, tab/close isolation and explicit block fallback. Browser document creation was fixture-backed SDK IPC; this is not native package acceptance.

[Interim installed macOS record](evidence/offline-dot-alpha2-macos-interim.json): local production DMG copy/normal launch, real Open/SaveAs/Export dialogs,2DOT+Mermaid in both views, exact source preservation, actual worker policy log, both-view hostile input and2s timeout/recovery, native saved changed→Undo→original transitions. Independent fonts/restart/draft recovery/Cancel/Discard were exercised in an isolated profile. Direct outbound-denied bootstrap is separate from ordinary LaunchServices UI; CUA cannot bind the direct process. Repeat ordinary acceptance on downloaded final release bytes before publication.

## Required pending gates

- [Quality CI42158141764](https://github.com/rheiger/markWriter/actions/runs/42158141764) at339ff2c passes all three native builds/tests and28 actual Windows/Linux application cases each. Downloaded results and worker response records were inspected. The reported worker URL matches the production browser/native worker filename; the strengthened final probe additionally verifies MIME/body hash against the emitted build. This is interim evidence; final-source CI remains required.
- [Package CI42158385281](https://github.com/rheiger/markWriter/actions/runs/42158385281), sourcedf2b6e2: Ubuntu installed production DEB passes9 grouped ordinary OS-dialog/editor/offline/restart cases. Downloaded manifest/package hashes match; ELF x86-64 inspected. Actual baseline Ubuntu26.04.1 LTS/kernel7.0.0-1019-azure/WebKitGTK2.52.6. macOS DMG installation and outbound-IP-denied startup pass onmacOS26.6.2/WebKit21624.5.1.11.3; downloaded package hash verified. Windows remains pending. Restart verification is being strengthened to save the recovered bytes through the real dialog and inspect restored18/24 controls.
- Final-source quality and actual store/IPC/filesystem application artifacts. Native harness includes actual production worker response, aliases, source integrity, static export, malformed/empty/resource/input/output bounds and real timeout/recovery.
- Ordinary installed production NSIS/Ubuntu26.04DEB OS dialogs, edits/search/tabs/fonts and interrupted recovery. These run at normal user privilege with Windows actual-WebView firewall restriction or a Linux network namespace without external routes. No bridge is present in release packages.
- Download final DMG and repeat ordinary macOS native acceptance. Verify exact hashes/manifest/architecture/version/signing/notices/production contents.
- Final adversarial review, qualified issue reconciliation, PR/main integration, post-merge checks, immutable tag and single draft publisher; verify final bytes before promoting the same draft with prerelease=true/latest=false.

## Findings fixed during qualification

- Opened documents can have implicit revision0: renderer callbacks normalize it consistently; a regression test proves Preview completes.
- Quoted punctuation is not a DOT assignment; SVG xml:space and CRLF fence metadata are retained. Nested atom content survives Turndown; raw outer blockquote prefixes are not reinserted inside a fence.
- Late React/view completions check latest owner/props; export captures document/revision/generation. Diagram count includes DOT.
- Only the exact benign non-ASCII metric warning is permitted. Actual EPSF/unsupported-style warnings and zero-warning gradient paints fail recoverably.
- Platform scripts use portable paths/CRLF metadata, resolved actual WebView/runtime/driver/firewall provenance, PE machine inspection, runner-user profile ownership and driver-owned PID interruption.
- Test scripts now prove changed saved bytes before Undo restoration, pass multiline drafts as arguments and verify actual installed worker CSP. Native dialog diagnostics and bounded startup polling remain under CI qualification.

Canceled/failed/interim CI runs are retained as diagnostic history, never release evidence. Existing20 user-file hashes are preserved. DBML#33 is deferred at its independent schema/layout/export gate; PlantUML#31/draw.io#5/logs#29/independent windows/plugins remain out of scope.

Assets are unsigned/ad-hoc experimental builds: no Developer ID/notarization/Authenticode or trusted distribution claim. Exact tested OS/WebView baselines come from platform manifests, not runner-label inference. Windows Server evidence does not establish Windows10/11, and Ubuntu26.04x64 does not establish other distributions/architectures. See [installation/profile/rollback guide](install-alpha2.md).
