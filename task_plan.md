# Dependable editor stabilization

Goal: dependable Markdown editing, preview, Mermaid, tables, WYSIWYG, file operations and HTML export.

## Acceptance criteria
- Switching modes without edits preserves the original Markdown byte for byte.
- WYSIWYG edits preserve Mermaid source, table cell content/formatting, task state and ordinary Markdown semantics.
- Repeated switching, saving and reopening do not discard content.
- Tests exercise real conversion/editor implementations; native I/O is verified separately.
- Frontend and macOS native builds pass. Other platforms require their own execution evidence.

## Phases
1. Preserve baseline and reproduce failures — complete.
2. Stabilize conversion and mode synchronization with regression tests — complete for covered fixtures.
3. Verify file operations and HTML export; fix demonstrated failures — automated and macOS native UI fixture acceptance complete.
4. Run browser workflows, native checks, review and record remaining limits — complete for this engineering increment.
5. Native macOS UI acceptance, expanded fidelity and lint baseline — complete for covered workflows.
6. Dependency remediation — complete: clean install, tests/lint/build, zero npm audit findings and upgraded browser acceptance.
7. V2 CI/native platform qualification — active: Linux/macOS native tests/builds passed; Windows missing ICO fixed. Run 42086481685 diagnosed missing comctl32 TaskDialogIndirect before the test harness. Commit 2397fba embeds Controls v6 in every MSVC executable; run 42087625830 passed frontend and all three native platforms. Run 42088770234 passed frontend/Linux/Windows and was superseded while macOS remained queued. New acceptance run 42090781282 targets 6038c20: frontend passes; Linux setup failed on Ubuntu 26 renamed WebDriver package; Windows is building. macOS remains queued.
8. Final requirement-by-requirement completion audit — active. Core fixture acceptance passes; latest editing fixes have 37 passing real-engine tests and browser checks. Final macOS bundle editing acceptance passes; awaiting terminal CI and final source verification.

9. Cross-platform application interaction — active: added an isolated acceptance frontend/build config and a dependency-free W3C WebDriver harness using external tauri-driver 2.1.0 on Windows/Linux. Embedded WDIO plugin 1.5.1 requires Tauri >=2.10 while the project locks 2.8.4, so no plugin/framework upgrade was made. Production asset isolation, 37 tests, lint and both builds pass locally. The isolated macOS acceptance bundle builds/launches. Actual Windows/Linux harness execution remains unverified; Linux package rename fix is prepared locally, along with strict driver-readiness polling and usage documentation. Windows session creation timed out before app tests. Prepared the verified upstream Medium-integrity test-process fix (portable checksum-pinned gsudo, runner-user-only workspace access); no Tauri upgrade. Ready to push the Linux package/readiness/Windows privilege fixes for another actual run.

## Boundaries
Preserve existing samples and test evidence. No release or merge. The isolated stabilization branch is pushed solely for qualification CI; samples and test-result files remain local. Settings, plugins, Draw.io and multi-window work are deferred.
