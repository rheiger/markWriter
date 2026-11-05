# MarkWriter status — 5 November 2026

Version: 2.0.0-alpha.1. Node 24+. Branch: `codex/editor-stabilization`.

Core editor stabilization and fixture acceptance are complete. [CI 42121100607](https://github.com/rheiger/markWriter/actions/runs/42121100607) passed at code commit `ba99ae9`: frontend and native tests/builds on macOS, Windows and Linux, plus actual Windows/Linux application acceptance.

## Verified behavior
- Unedited mode cycles preserve original Markdown bytes. WYSIWYG edits retain tested Mermaid/table/task/code/image semantics; Markdown syntax may normalize after edits.
- Mermaid flowchart, sequence and state diagrams render; syntax errors stay inside the editor and recover after correction.
- Tables preserve formatting/alignment/escaped pipes/line breaks. Markdown and WYSIWYG table insertion work.
- Document and undo histories are isolated; concurrent saves retain newer edits and errors preserve unsaved text.
- Save As/Save/reopen and HTML export retain content. Export contains inline diagram SVG, tables and task checkboxes without external scripts.
- Unsaved New/Open/Quit/window-close protections have automated coverage and actual macOS native UI acceptance.

## Evidence
- 41 frontend tests, lint/build, clean install and zero reported npm advisories.
- 12 library and 2 production-command Rust tests per platform; production debug builds on all three platforms.
- Actual macOS dialogs/editing/save/reopen/export and repeated mode cycles pass. Current production bundle rebuilt/reopened with three diagrams and an editable table/tasks.
- Windows/Linux native WebView acceptance passes eight cases each: About version, unchanged cycles, byte-identical Save As, WYSIWYG edit, edited cycles, Save/reopen, three-diagram HTML export and Markdown table insertion. Real store/IPC/file writes; only OS path dialogs are bypassed.
- Acceptance tooling is absent from ordinary production assets; CI verifies build isolation.

## Release and compatibility limits
This remains an unreleased alpha. Windows/Linux OS dialogs, signing/packaging, arbitrary Markdown extensions, merged cells and image-path resolution need separate qualification. Large bundle chunks retain a build warning. Pre-existing sample edits and Testresults remain local and untouched. No merge or release was performed.

Toolbar mode switch/View-menu choices replace floating document buttons. Text size (10–32px) is synchronized with zoom; Help → About shows the current version and supports Close/Escape. The footer is preserved.

Details: [stabilization report](docs/stabilization-2026-11-05.md), [native acceptance](docs/native-acceptance.md). Older completion claims in other project documents are historical.
