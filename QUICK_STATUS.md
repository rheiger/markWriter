# MarkWriter status — 5 November 2026

Version: 2.0.0-alpha.1. Branch: codex/editor-stabilization.

The first stabilization increment is implemented. This remains an alpha; full native workflow and cross-platform acceptance are outstanding.

## Verified
- Real-editor tests preserve original Markdown over five unedited mode cycles.
- WYSIWYG edits retain Mermaid source, table inline formatting/escaped pipes, task state and images in covered fixtures.
- Editors and undo histories are scoped to the current document.
- Save/Save As completion retains newer edits and does not replace a different current document.
- Preview and HTML export share the Markdown parser; exported Mermaid diagrams use inline SVG.
- Rust production-command tests save, reopen, copy and export files in temporary directories.
- Browser UI input verifies repeated switching and editing with actual diagram SVG.
- macOS debug bundle builds and launches.

## Open acceptance and tooling work
- Complete native Open/Save/Save As/Export/close-prompt journey. CUA timed out while automating the Open dialog; this is not proof of an application deadlock.
- Run Windows and Linux builds and user workflows.
- Establish v2 CI. Existing GitHub workflow still packages the legacy Python application.
- Restore ESLint configuration (currently absent).
- Expand fidelity corpus: advanced table alignment/merged cells, mixed/nested lists, large documents and unsupported Markdown extensions.
- Qualify release builds, signing and packaging separately.

See [stabilization report](docs/stabilization-2026-11-05.md) for behavior, checks and limitations. Older completion claims in README-v2.md, CURRENT_STATUS.md and AGENTS.md are historical.
