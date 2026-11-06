# MarkWriter status — 6 November 2026

Unreleased **2.0.0-alpha.2**. Node 24+. Branch: `codex/productivity-increment`, based on stabilization tip `1fe311c`.

The four requested core features are implemented: single-window document tabs, persistent Settings/recovery, contextual WYSIWYG table management and non-destructive embedded-source folding. Insert → Diagram → Mermaid ERD uses the existing renderer and supports self-contained HTML export. Independent windows and broader preferences remain deferred.

## Verified behavior

- Canonical Markdown remains byte-identical and clean through unedited tab/mode/fold/settings changes. View-only table normalization does not rewrite source. Supported semantics remain preserved after WYSIWYG edits.
- Tabs retain their own engine histories, mode, caret and scroll. New/Open, canonical duplicate activation, reorder/navigation, Close, Save All and all-tab Quit protection are implemented. Captured-owner saves/dialogs preserve newer edits and destination ownership.
- Settings Apply/Cancel/Reset work with separate source/rendered fonts and sizes; toolbar size/zoom follow the active editor. Native atomic versioned preferences and local recovery snapshots handle failures visibly. Externally changed/deleted files recover as detached copies; deliberate discard does not reappear.
- Table row/column controls implement the specified boundary rules, header/alignment preservation, selection toggles, undo and Markdown/export fidelity. No merged cells.
- Mermaid and long base64/URL-encoded image payloads fold without replacing source. Search unfolds matches; complete copy includes folded text. Fold choices survive tab/mode cycles and edited re-synchronization.

## Evidence

- 68 frontend tests, lint, typecheck/build, acceptance-build isolation and zero-advisory npm audit pass locally. 12 Rust library + 5 production-command/storage tests pass.
- Actual macOS native dialogs, dirty Close/Quit, Settings/restart, unnamed recovery, external-disk conflict, table/fold controls and ERD export pass. Ordinary alpha.2 bundle rebuilt; original clean 7996-character document restored.
- Browser checks pass with real editors/Mermaid and no console issues; ten tabs and 800/1024/1440px layouts preserve the footer and avoid page overflow. Browser IPC is fixture-backed.
- [CI 42132006395](https://github.com/rheiger/markWriter/actions/runs/42132006395) passed at `323aec8`, with 16 actual Windows/Linux application cases each; both artifacts inspected.
- Final source `6c6eb56` passed [CI 42132949169](https://github.com/rheiger/markWriter/actions/runs/42132949169): 68 frontend tests and all three native jobs; both Windows/Linux artifacts confirm all 16 application cases. Subsequent closeout changes are documentation only.

## Limits

The [draw.io spike](docs/drawio-offline-spike-2026-11-06.md) proves basic local offline boot/XML load, while native asset packaging, full attribution and safe editable-XML/SVG integration remain unqualified; product integration is deferred with no placeholder control. This is separate from Mermaid ERD.

Independent windows, shortcut customization, settings import/export, original-file autosave, merged cells, general image asset/path management and signing/release packaging remain deferred. Windows/Linux OS path dialogs are separate from explicit-path native tests. Recovery cannot guarantee final unflushed keystrokes after sudden loss. Large-bundle warnings remain. No merge, tag, release, issue closure or external messages.

Details: [productivity acceptance](docs/productivity-increment-2026-11-06.md), [native harness](docs/native-acceptance.md), [ownership ADR](docs/adr-document-ownership.md). Existing Samples/ and Testresults/ user work remains untouched. Older completion claims are historical.
