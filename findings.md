# Findings

- Initial frontend build passes; 8/13 frontend tests fail on a stale marked mock lacking use().
- Global CodeMirror and parser mocks prevent meaningful fidelity coverage.
- Markdown tab click unconditionally serializes Tiptap, including unchanged content.
- Mermaid conversion decodes source then interpolates it into HTML text, risking interpretation as markup.
- Table conversion uses textContent, discarding formatting; plugin registration follows custom rules and may override them.
- Initial Rust offline check is blocked by an uncached dependency, not a demonstrated compiler failure.
- GitHub public repository; v2-development remote head is dd864ce. Existing CI covers Python, not v2.

- Real-editor tests reproduced Mermaid markup stripping, empty-atom loss, table formatting/pipe loss, task-list loss and empty getMarkdown in WYSIWYG.
- Five unchanged browser mode cycles now preserve source byte-for-byte; actual Mermaid SVG and table render successfully.
- Mounted EditorContent avoids flushSync warnings on mode switches; async Mermaid rendering is cancelled on cleanup.
- Store saves capture stale document snapshots, clearing dirty state or overwriting text when edits occur during I/O.
- Production backend is main.rs; separate commands.rs is not the invoked command implementation. Native HTML export uses a regex converter and needs replacement.
- Rust test compilation initially failed because tempfile was used but absent from dev-dependencies.

- Current frontend: 24 tests pass; Rust: 12 library + 2 production-command tests pass.
- Browser UI input (not store injection) verified five unedited cycles and three post-edit cycles with actual Mermaid rendering, table bold/escaped pipes, and task state retained.
- Browser-generated HTML includes one table, one SVG, checked task, and no scripts. Native IPC is stubbed for browser startup only; browser testing does not establish native I/O.
- macOS debug app bundle builds and launches. CUA timed out during native Open-dialog automation; complete desktop open/save/export acceptance remains unverified. Process sample showed main event loop idle, not evidence of a proven app deadlock.
- Browser surfaced missing ProseMirror white-space styling, now supplied explicitly.
- ESLint command cannot run because repository has no ESLint configuration; recorded as pre-existing tooling debt rather than silently treating lint as passed.
- Clean npm install removed undeclared peers; @testing-library/dom and highlight.js are now explicit dependencies. Lockfiles will be versioned for reproducibility.

- Final review reproduced cross-document Undo restoring the previous document. Keying the entire editor lifecycle by document ID fixes both engine histories; regression now passes.
- Tiptap initialization appends schema nodes; ignoring pre-initialization updates preserves exact source rather than normalizing it on load.
- Table line-break regression fixed with a narrowly recognized safe `<br>` inline token.
- Final frontend suite: 26 passing tests. Final browser UI verification has no errors/warnings and preserves source through five unchanged plus three edited cycles.
