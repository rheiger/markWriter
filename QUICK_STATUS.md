# MarkWriter status — 5 November 2026

Version: 2.0.0-alpha.1. Development requires Node 24+. Branch: codex/editor-stabilization.

The first stabilization increment is implemented. This remains an alpha; macOS native fixture acceptance passes; cross-platform qualification is running.

## Verified
- Real-editor tests preserve original Markdown over five unedited mode cycles.
- WYSIWYG edits retain Mermaid source, table inline formatting/escaped pipes, task state and images in covered fixtures.
- Editors and undo histories are scoped to the current document.
- Save/Save As completion retains newer edits and does not replace a different current document.
- Preview and HTML export share the Markdown parser; exported Mermaid diagrams use inline SVG.
- Rust production-command tests save, reopen, copy and export files in temporary directories.
- Browser UI input verifies repeated switching and editing with actual diagram SVG.
- macOS debug bundle builds and launches; native Open/Save As/edit/Save/reopen/HTML export and New/Quit/Cmd-W discard-cancel checks pass on temporary fixtures.
- 37 frontend tests pass; ESLint correctness and hook checks pass.

## Open acceptance and tooling work
- Run Windows and Linux builds and user workflows.
- V2 CI is configured and running. Linux/macOS native jobs passed the first run; Windows icon and test-harness Common Controls v6 manifest are fixed. All three native platforms and the frontend passed run 42087625830. The final Mermaid error-handling change is queued for verification. Legacy Python packaging remains separate.
- Recheck dependency advisories during qualification; the current upgraded lockfile audits clean.
- Expand fidelity corpus: merged cells, mixed lists, large documents and unsupported Markdown extensions.
- Qualify release builds, signing and packaging separately.

See [stabilization report](docs/stabilization-2026-11-05.md) for behavior, checks and limitations. Older completion claims in README-v2.md, CURRENT_STATUS.md and AGENTS.md are historical.
