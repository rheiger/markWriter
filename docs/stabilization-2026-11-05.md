# Editor stabilization — 5 November 2026

The core stabilization increment is implemented on `codex/editor-stabilization`. It is pushed for qualification CI, with no merge or release. Existing code/docs were checkpointed separately; pre-existing sample changes and historical test evidence remain untouched.

## Result

Markdown in the store is canonical. Unedited mode switches preserve original bytes. Genuine WYSIWYG edits serialize supported Markdown semantics and may normalize syntax/whitespace. This is not a universal lossless codec for arbitrary Markdown extensions.

- Document-keyed editors isolate content and undo history. Initialization/synchronization does not dirty or overwrite source.
- Shared Markdown parsing and explicit serialization preserve Mermaid source, tables/inline formatting/alignment/escaped pipes/line breaks, nested tasks, images and code in tested fixtures.
- Mermaid rendering cancels stale results. Invalid diagrams show an editor-owned error; the library no longer leaves orphan error SVGs in the document body.
- Markdown toolbar table/task/strike controls work; plain-text WYSIWYG paste retains literal markup and line breaks.
- Save completion preserves concurrent edits/current-document identity. Native writes use same-directory temporary files, flush and atomic replacement, retaining existing permissions.
- New/Open/Quit/window-close protect unsaved content. Native error messages remain visible without discarding edits.
- Preview and HTML export share the parser. Export includes Mermaid SVG and inline CSS; invalid diagrams fail export visibly. Raw document HTML is displayed as text.

## Acceptance evidence

| Area | Evidence |
| --- | --- |
| Conversion/editing | 37 passing frontend tests using real Tiptap, CodeMirror, MarkdownIt and Turndown; real sample JSON round-trip, five unchanged mode cycles and repeated edited cycles |
| Preview/Mermaid | Real browser renders flowchart, sequence and state diagrams; malformed source shows an inline error and recovers without orphan SVGs |
| Tables/tasks | Real editor tests cover formatting, alignment, escaped pipes, cell line breaks, nested/completed tasks and insertion in both modes; browser/native toolbar confirms a 2-column/3-row table |
| File operations | 12 library and 2 production-command Rust tests pass locally; command tests use real temporary files and failure paths |
| macOS application | Debug bundle builds/launches. Actual native Open, five mode cycles, byte-identical Save As, WYSIWYG edit/Save/reopen/export and New/Quit/Cmd-W cancel checks pass |
| Upgraded macOS export | Written file has three Mermaid SVGs, one aligned table, two task inputs and no scripts |
| Latest native editing | Rebuilt bundle preserves copied/pasted multiline text across modes and inserts a Markdown table that becomes an editable WYSIWYG table |
| Quality/dependencies | Ordinary clean npm ci, lint, production build and audit pass; zero reported npm advisories. Node 24+ required |
| CI | Frontend and all three native platform tests/builds pass run 42087625830; final Mermaid error handling awaits its source CI run |

Mermaid is stubbed in unit tests and separately exercised in the browser/native app. Browser startup stubs create-document IPC; browser clipboard checks stub only clipboard read. Native I/O evidence comes from actual native UI and Rust temporary-file tests, not these browser stubs. The malformed-diagram test intentionally produces a logged error; valid fixtures produce no console errors/warnings.

## CI findings

- [42083988171](https://github.com/rheiger/markWriter/actions/runs/42083988171): frontend, Linux and macOS passed; Windows failed on an ignored/missing ICO. Generated/tracked it from the existing PNG.
- [42085196968](https://github.com/rheiger/markWriter/actions/runs/42085196968): Windows compiled but library tests could not start (STATUS_ENTRYPOINT_NOT_FOUND).
- [42086481685](https://github.com/rheiger/markWriter/actions/runs/42086481685): diagnostics identified comctl32 v5 missing TaskDialogIndirect; changing shells did not fix it. Superseded/cancelled after diagnosis.
- [42087625830](https://github.com/rheiger/markWriter/actions/runs/42087625830): source 2397fba embeds Common Controls v6 in every MSVC executable, including library test harnesses. All jobs passed. This verifies the loader fix; final frontend-only Mermaid error handling is a subsequent commit.

The MSVC fix uses [Cargo linker arguments](https://doc.rust-lang.org/cargo/reference/build-scripts.html#rustc-link-arg) and [Microsoft manifest dependencies](https://learn.microsoft.com/en-us/cpp/build/reference/manifestdependency-specify-manifest-dependencies). Installed tauri-build 2.4.0 confirms its default app-only manifest contains the same Controls dependency.

## Dependencies and maintenance

Tiptap packages moved together to 3.32.3; MarkdownIt 15.0.3, Mermaid 12.3.0, lowlight 3.3.0, Vite 8.3.6, Vitest/UI 5.1.0 and TypeScript ESLint 8.72.1. Removed unused react-router-dom. Vite uses ESM-safe paths/default minification and loopback-only development endpoints.

Scoped minimatch 11 (typescript-estree) and glob 14 (Sucrase) overrides remediate advisory paths whose upstream ranges retain older versions. Typed-parser project globs and real Sucrase CLI discovery/transform passed compatibility checks. Remove overrides when upstream ranges include patched releases. Zero audit findings do not prove absence of vulnerabilities.

References: [Vite migration](https://vite.dev/guide/migration.html), [Vitest migration](https://main.vitest.dev/guide/migration/), [lowlight](https://github.com/wooorm/lowlight), [Tiptap setContent](https://tiptap.dev/docs/editor/api/commands/content/set-content), [MarkdownIt renderer](https://github.com/markdown-it/markdown-it/blob/master/docs/examples/renderer_rules.md), [Mermaid error rendering configuration](https://mermaid.js.org/config/schema-docs/config-properties-suppresserrorrendering.html).

## Limits and remaining work

Windows/Linux native interactive workflows still need their own execution evidence; successful compilation/tests do not establish desktop interaction. Signing, release packaging, arbitrary Markdown extensions, merged table cells, relative/broken-image resolution and embedded image assets remain outside this increment. Large bundle chunks retain a build warning. Power-loss recovery/filesystem-specific guarantees are not established by atomic writes.

Settings, plugins, Draw.io and multi-window development are deferred. The broad dependable-editor goal remains active until required qualification is complete.
