# Progress

## 2026-11-05
- Created active goal and inspected editor/store/test boundaries.
- Archived all pre-existing modified/untracked files outside the repository.
- Created codex/editor-stabilization and checkpointed existing code/docs; sample and test-result files remain untouched.
- Next: replace obsolete editor tests with real editor integration coverage and prove fidelity defects.

- Replaced parser/editor mocks with real implementations; first 10 frontend tests pass.
- Extracted shared Markdown conversion, preserved empty Mermaid atoms, escaped source, retained table inline formatting/pipes, and mapped task nodes explicitly.
- Removed duplicate preview diagram rendering; Markdown parser handles fenced blocks; stale preview completions are ignored.
- cargo check passes. Added missing tempfile dev dependency to enable existing Rust tests.
- Added save-race and image-fidelity tests before addressing those failures.

- Added save-race regression coverage and fixed stale Save As/dirty-state updates.
- Added image schema support after a real-editor regression proved images were dropped during surrounding edits.
- Unified HTML export with Preview and rendered Mermaid to inline SVG; removed production regex Markdown renderer.
- Native writes use a same-directory temporary file and replace after flush; New/Open/Quit/window close protect unsaved content.
- Repaired existing Rust test prerequisites and incorrect word-count expectation (input has eight whitespace-delimited tokens).
- Native app compiled/launched; dialog automation timeout prevents full native workflow acceptance.
- Review in progress; clean-install validation and final documentation remain.

- Review found and fixed cross-document undo contamination; added passing regression.
- Final checks: 26 frontend tests, production frontend build, 14 Rust tests, clean npm install, and rebuilt macOS app bundle pass. Browser actual UI cycle verification is clean.
- Remaining acceptance gates are explicit in QUICK_STATUS.md and docs/stabilization-2026-11-05.md.

- Local commits: 7ebfd6a preserves pre-existing editor code; f5b11fd stabilizes mode/document conversion; 11dd31b protects saves and unifies export. No remote push.
- Native UI acceptance and release qualification remain open; broad goal is intentionally not marked complete.

## Continuation: native acceptance and expanded fidelity
- Native macOS Open, five mode cycles, Save As byte comparison, WYSIWYG editing, Save, HTML export and reopening passed through actual UI.
- New/Quit/native Cmd-W prompts showed unsaved warnings; Keep editing retained text, and a subsequent Save succeeded.
- Exported file contains one table, one SVG, two checkboxes and no script.
- Expanded real-editor suite now has 29 passing tests; added table alignment preservation using installed TextAlign extension.
- ESLint baseline restored; auditing exhaustive hook dependencies before enabling the gate.

- Dependency remediation: coherent Tiptap update, modern Markdown/Mermaid/lowlight, Vite/Vitest and TypeScript ESLint; removed unused router. Two scoped overrides passed direct compatibility checks.
- Ordinary npm ci, 29 tests, lint, build and zero-advisory audit pass. Actual upgraded browser renders flowchart/sequence/state diagrams and exports three SVGs with table alignment preserved and no console issues.
- Rebuilding the native bundle with upgraded assets before finalizing this increment.

- Upgraded native bundle rebuilt successfully. Actual browser rendering/export with three diagram types and aligned table passed without console issues.
- Added a pinned prebuilt Tauri CLI dev dependency for reproducible CI builds; package audit remains a required gate.
