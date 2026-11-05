# Editor stabilization — 5 November 2026

## Outcome and scope

First engineering increment toward a dependable Markdown editor. No release or remote push. Existing modified/untracked files were archived locally before implementation, and existing code/docs were checkpointed separately. Samples and historical test evidence were preserved.

## Decisions

The store's Markdown is canonical. Merely viewing another mode never serializes the rich-text document back into Markdown. Genuine WYSIWYG edits serialize using explicit rules. Unedited source is preserved byte for byte; editing in WYSIWYG may normalize Markdown syntax and whitespace. This is semantic preservation for supported constructs, not a universal lossless Markdown codec.

Both engines belong to a keyed document component, isolating undo history and editor lifecycle when opening another document. WYSIWYG remains mounted while switching modes. Initialization transactions do not dirty the source. Programmatic synchronization uses Tiptap's documented `emitUpdate: false` option.

`frontend/src/lib/markdown.ts` owns parsing and serialization. Mermaid fences become escaped atom attributes. Turndown's blank-element handling explicitly preserves empty Mermaid atoms. Table cell serialization retains inline formatting and escaped pipes; a narrowly allowed `<br>` token preserves cell line breaks. Task lists map to Tiptap's explicit task schema. Images have a schema node. Raw HTML is displayed as text rather than executed.

Preview and export use this parser. Export renders Mermaid to inline SVG and includes inline styles, requiring no remote diagram script. Images retain their references; image embedding and broken/relative image resolution are not qualified by this increment. Invalid diagrams fail export visibly instead of silently producing an incomplete file.

Native file writes use a same-directory temporary file, flush, and atomic replacement. Existing destination permissions are retained. This reduces partial-file risk; power-loss recovery and filesystem-specific guarantees are not claimed. Save completion checks document identity and current content before updating dirty state. New/Open/Quit/native window-close paths protect unsaved content.

## Evidence

- Frontend suite: 26 tests pass. Regression coverage includes cross-document undo isolation and table cell line breaks.
- Frontend tests use real CodeMirror, Tiptap, MarkdownIt and Turndown. Mermaid SVG generation is stubbed in unit tests, then exercised in the real browser.
- Browser UI: entered a fixture through CodeMirror, made five unedited mode cycles, edited in WYSIWYG, then made three further cycles. Source stability, Mermaid source, bold table content, escaped pipe and task states passed. Generated HTML had one table, one SVG, one checked checkbox and no scripts.
- Browser startup uses a stub only for native create-document IPC; it cannot establish native file-dialog/I/O acceptance.
- Rust tests exercise production main.rs command functions against real temporary files, including errors. The separate library command implementation is not the desktop application's invoked command handler.
- Clean `npm ci --legacy-peer-deps` succeeds with explicit peers and versioned lockfiles.
- Frontend production build passes (large-chunk warning remains).
- `cargo test` passes: 12 library tests and 2 production-command tests.
- macOS debug app bundle builds and launches. Native Open-dialog automation timed out; no complete native workflow is claimed. A process sample showed an idle main event loop, which does not establish the cause of the timeout.
- ESLint was attempted and cannot run because no configuration exists. No passing lint result is claimed.

## Remaining gates

The final browser verification completed with no console errors or warnings. The preview screenshot is retained locally under `.playwright-mcp/preview.png`.

Complete native document open/edit/save/reopen/export and discard-cancel acceptance; qualify Windows/Linux; expand the fidelity corpus; establish v2 CI and linting; then assess release packaging and signing. The broad dependable-editor goal remains active.

## Library references

- [Tiptap setContent command](https://tiptap.dev/docs/editor/api/commands/content/set-content): disable update emission during programmatic synchronization.
- [MarkdownIt renderer rules](https://github.com/markdown-it/markdown-it/blob/master/docs/examples/renderer_rules.md): customize fenced-block output while retaining parser boundaries.

Installed Tiptap 3.3.0 and Turndown source were inspected for task-node parsing and blank-node rule precedence.
