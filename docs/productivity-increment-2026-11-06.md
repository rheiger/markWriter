# Productivity increment — 6 November 2026

Unreleased review build: **2.0.0-alpha.2**, branch `codex/productivity-increment`, based on stabilization tip `1fe311c`. No merge, release, tag or issue closure.

## Four-feature acceptance

| Feature | Delivered behavior | Evidence |
| --- | --- | --- |
| Single-window tabs | New/Open adds tabs; canonical duplicate paths activate their owner; full paths disambiguate matching names; dirty markers, Close, Save All, drag reorder, Alt+Left/Right reorder and Ctrl+Tab/Ctrl+Shift+Tab navigation | Real editor A→B→A history/mode isolation, delayed save/dialog ownership and destination-collision tests; browser ten-tab layout; actual macOS native Open/Save As/dirty Close/Quit |
| Settings/recovery | Separate source/rendered fonts and sizes, theme, rendered line spacing, source tab width/wrap, default embedded-source collapse and session restore; Apply/Cancel/Reset; native atomic schema-versioned config and local recovery snapshots | Schema migration/invalid-field tests; native storage corruption/failure tests; actual macOS Settings18/22 and process restart; unnamed draft and external-file conflict recovery |
| Table management | Contextual keyboard-accessible row/column add/move/delete/select controls; anchored header, column alignment, undo; first/last boundary rules | Real Tiptap command/boundary/undo/formatting tests; browser/native contextual controls; canonical Markdown and HTML export |
| Embedded-source folds | Mermaid bodies and long base64/URL-encoded image payloads; accessible expand/collapse, excerpts/encoding; public CodeMirror folds with per-tab state, search unfolding and complete copying | Exact-byte real-editor tests, mapped edits, WYSIWYG re-synchronization and 1MB payload tests; browser/macOS native toggles |

The additional Mermaid ERD starter includes entities, attributes, PK/FK/UK and cardinalities. Insert → Diagram → Mermaid ERD inserts after the enclosing top-level block in WYSIWYG, including when the caret is in a table. Both editor views and self-contained HTML export are qualified. This is a convenience template using the existing Mermaid renderer, not a second diagram format.

## Ownership and recovery rules

Markdown is canonical. Clean tab/mode/fold/settings/view-attribute changes preserve its exact bytes and clean state. WYSIWYG edits preserve supported semantics and may normalize Markdown syntax/whitespace. Each open tab retains both engine histories, mode, caret and scroll. Closing disposes that tab's engines; inactive previews cancel stale results.

Save/Save As/export capture source and document identity before dialogs and asynchronous work. Save completion updates only its owner and acknowledges only the captured text; newer edits remain dirty. Per-document writes serialize. Open coordinates with reserved Save As destinations; an already-open destination cannot silently acquire another owner. Save All stops on failure/cancellation. Close and Quit use Save/Discard/Cancel, inspect every dirty tab and retain buffers on failure or cancellation. Last-tab Close shows the welcome view; a fresh empty startup creates an unnamed tab.

Toolbar text size, zoom and Actual Size control the active editor: source size in Markdown, rendered size in WYSIWYG. The two values remain independent and share Settings state.

Preferences live in the native app config directory as `preferences.json`; `workspace.json` lives in native app-local data. On macOS these resolve under `~/Library/Application Support/com.markwriter.app`. The separate acceptance identity uses its own directories. Settings and session JSON schemas are versioned; missing preference fields migrate to defaults. Rejected JSON/schema originals are retained as immutable `*.retained-<uuid>.json` copies before replacement. Write failures are visible and retryable. A previous snapshot is also retained; startup never automatically resurrects that older backup.

Recovery writes local copies after a 400ms edit debounce and flushes at Close/Quit boundaries. They never autosave original files. Startup compares saved base text with current disk text. Conflicting/deleted/unreadable originals produce detached recovery copies, with Open disk version / Keep recovery copy actions; newer originals are never overwritten automatically. Deliberate discard removes the draft from the authoritative restore snapshot. Undo history is not persisted across process restarts. Sudden power/process loss may lose final unflushed keystrokes; filesystem/power-loss durability is not guaranteed.

## Verification

- Local: 68 frontend tests, lint, TypeScript/production and isolated acceptance builds; production assets exclude the acceptance bridge; npm audit reports zero advisories. Rust: 12 library plus 5 production-command/storage tests.
- Browser: real editors and Mermaid; fold bytes/mode cycles, contextual table selection/boundaries, independent font sizes/theme, ERD SVG/export, overlapping basenames and ten tabs. Layout checked at 800/1024/1440px with visible footer and no page overflow. No console errors/warnings in accepted flows. Browser IPC is fixture-backed and is not native filesystem evidence.
- macOS ordinary app: actual native Open and Save As dialogs; dirty Cmd-W Cancel and Quit while another tab is dirty; source folds and table controls; native Settings persistence; two process-termination/restart workflows for unnamed recovery and external disk conflict. Exported native ERD HTML has one inline SVG, all entities/keys/cardinalities and no scripts. Only generated temporary files were changed.
- Independent read-only review findings were fixed: startup restore overwrite race, rejected-v1-schema retention, Open/Save As ownership race, pending settings on Quit, embedded-image loss, stale preview theme callbacks and clean-switch serialization. Further real-editor tests guard table view-only normalization and ERD insertion from table selections.
- Final source: `6c6eb56`. [CI 42132949169](https://github.com/rheiger/markWriter/actions/runs/42132949169) completed successfully: 68 frontend tests/lint/build/audit, all three native test/build jobs, and 16 actual application cases each on Windows and Linux. Both native result artifacts were downloaded and inspected. Subsequent closeout changes are documentation only.

## Table boundary choices

The first row stays the GFM header. Row movement is disabled on the header. Add-above on a header inserts the first body row; deleting the header promotes the next row. Moving the first body row up adds a blank row below it. Moving the last body row down appends a blank row, then moves the original row into the extended position. Column movement includes header/body cells and alignment. First-column left adds a blank column on its right; last-column right extends and moves. Selection toggles; multi-row/column cell selections delete the corresponding rectangle. Deleting the final row/column removes only that table, preserving surrounding text. No merged-cell controls.

## Remaining scope

Independent windows, shortcut customization, settings import/export, original-file autosave, broader preferences, merged cells, general image asset/path management and release signing/packaging remain deferred. Windows/Linux OS path dialogs remain separate from explicit-path native acceptance. Existing large-bundle build warnings remain. This does not close all subfeatures of issues #8/#9.

The [separate draw.io offline spike](drawio-offline-spike-2026-11-06.md) demonstrated local offline boot/XML load, but native packaging, full asset attribution and the safe editable XML/SVG persistence gates remain unqualified; product integration is deferred. No hosted editor, database connection, substituted diagram format or placeholder control is introduced.

Implementation contracts: [ownership ADR](adr-document-ownership.md), [Tauri native paths](https://docs.rs/tauri/2/tauri/path/struct.PathResolver.html), [Tiptap tables](https://tiptap.dev/docs/editor/extensions/nodes/table), [CodeMirror folds/search](https://codemirror.net/docs/ref/#language.codeFolding), [Mermaid ERD](https://mermaid.js.org/syntax/entityRelationshipDiagram).
