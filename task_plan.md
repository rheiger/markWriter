# Dependable editor stabilization — acceptance complete

Goal: dependable Markdown editing, preview, Mermaid, tables, WYSIWYG, file operations and HTML export.

## Acceptance evidence
- Unedited cycles preserve original bytes; real editor/conversion tests cover supported WYSIWYG semantics.
- Repeated edited cycles, Save As/Save/reopen and inline-SVG HTML export retain fixture content.
- 37 frontend tests, lint/build, clean install and zero npm advisories pass.
- 12 library/2 production-command Rust tests and production native builds pass on macOS/Windows/Linux.
- Actual macOS native dialogs/editing/file/export/unsaved-change acceptance passes; current production bundle rebuilt and reopened.
- CI 42092300007 at code commit 4c18dda passed all jobs, including seven actual native WebView/store/IPC/file workflow cases each on Windows/Linux. Downloaded result artifacts confirm passes.
- Production assets exclude the acceptance bridge; only explicit acceptance builds include it. OS path dialogs are bypassed only in Windows/Linux automated tests.

## Closeout
Record final evidence, commit/push documentation-only closeout, verify preserved user sample state, then mark the named core-editor goal complete. No required implementation/qualification remains within this acceptance scope.

## Boundaries and future work
No release/merge. Isolated codex/editor-stabilization branch is pushed. Existing sample edits/untracked Testresults are preserved. Signing/packaging, Windows/Linux OS dialogs, arbitrary Markdown extensions, merged cells and image-path resolution are separate qualification work. Settings/plugins/Draw.io/multi-window remain deferred.
