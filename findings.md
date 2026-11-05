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

## Continuation: broader fidelity and tooling
- Added real-editor coverage for column alignment, nested task formatting, and fenced TypeScript containing backticks. Alignment failed before the fix; nested lists/code already passed.
- Enabled existing Tiptap TextAlign extension for table cells/headers and serialized alignment delimiters. All 29 frontend tests pass.
- Added ESLint configuration for recommended JavaScript correctness checks, TypeScript unused names and React hook call ordering. Initial lint found one redundant semicolon.

- Native acceptance completed after switching to keyboard-driven dialog opening. Previous timeout is superseded, not proof of an app bug.
- Native New/Quit/Cmd-W discard-cancel checks retain unsaved text; Save/reopen and actual HTML export passed.
- ESLint now includes exhaustive dependency checks after resolving six stale-closure/dependency warnings; baseline passes.
- npm audit: 40 advisories (3 critical, 26 high, 8 moderate, 3 low). Dependency remediation is the next distinct increment before v2 CI/audit gates can be considered passing.

- Dependency upgrade targets were checked against npm metadata and upstream Vite/Vitest migration guidance. Vitest 5 requires Node >=22.12; the project will use Node 24+ for development/CI. Host Node is 26.11.1.
- Migration updates all Tiptap packages together, uses lowlight 3's createLowlight API, and switches Vite minification to its current default rather than requiring esbuild.

- Modern dependencies pass the existing 29-test suite, lint and production build. npm audit is now zero after updates, removing unused react-router-dom, and targeted overrides for typescript-estree's minimatch and Sucrase's glob.
- Compatibility checks exercised typed parser project globs and Sucrase CLI file discovery/transform with the overrides; both passed.
- Development endpoints now bind loopback explicitly; Node 24+ is the documented runtime floor.

- CI 42083988171: Linux native tests/build passed. Windows failed before tests because required icons/icon.ico was absent from Git (it was ignored). Generate the ICO from the existing tracked PNG and track it explicitly; do not alter the source image.
- Upgraded macOS native bundle rendered/saved flowchart, sequence and state diagrams, retained table alignment, and exported a real HTML file with three SVGs, one table, two inputs and no scripts.
- Existing larger sample document also survives an edited real-editor JSON round-trip; frontend suite now has 30 tests locally.

## Completion-audit follow-up
- Empty-table insertion in WYSIWYG survives switching. Markdown-mode table insertion was a no-op through the same public toolbar API; a failing test reproduced it and the API now inserts a GFM table with consistent row/column counts.
- Local suite now has 33 passing tests; lint/build pass.
- Second Windows CI run compiled after the ICO fix but its library test executable exited before the harness with 0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND. This is an unresolved loader failure, not a failing Rust assertion. Next run uses native PowerShell for Windows tests and records direct DLL-import/export diagnostics if it fails.

- Windows diagnostics loaded comctl32 v5 and reported its missing TaskDialogIndirect export. Tauri 2.4's generated resource manifest reaches the application binary but not the library test executable. MSVC linker manifest/dependency arguments now cover all executables, with Tauri's duplicate manifest disabled only for MSVC. Local macOS Rust tests pass; Windows execution remains the required validation.
- Browser toolbar/menu checks confirm task/strike formatting, a 2-column/3-row table with six cells, and literal HTML-like multiline clipboard text surviving a mode round-trip. Initial br visibility wait was a test error: a br has no visible box; attached-state wait and DOM inspection confirm preservation.

- Malformed Mermaid input reproduced orphan error SVGs outside the app. Enabled documented suppressErrorRendering in preview, WYSIWYG and export. Fresh-cache browser checks now show inline errors, zero orphan nodes, successful correction, and rejected invalid export without DOM leaks. Initial rerun used cached HMR modules; disabling the browser network cache verified current source.

- Route for next goal phase: official Tauri WebDriver docs (https://v2.tauri.app/develop/tests/webdriver/, updated June 2026) recommend @wdio/tauri-service with an embedded WebDriver plugin on Windows/Linux/macOS. A backend-access plugin is separate/optional. This could provide actual WebView/IPC acceptance in CI without a paid macOS driver. Not installed or validated here; test-only build isolation must precede adoption.

- WDIO embedded plugin 1.5.1 actually requires Tauri >=2.10 (published Cargo metadata); installed Tauri is 2.8.4. Chose official external tauri-driver 2.1.0 for Windows/Linux, retaining macOS CUA acceptance, rather than upgrading application dependencies for test tooling.
- Acceptance mode uses a dynamically imported real-store bridge; ordinary production assets are checked to exclude its global marker, and acceptance assets include it. The driver uses W3C protocol directly via Node fetch, avoiding new npm packages. The bridge bypasses only OS path dialogs; real store actions, native IPC and filesystem writes are asserted.
- Edge driver metadata is UTF-16 and supports LATEST_RELEASE_<major>_WINDOWS, not a three-component build suffix. Installer matches the actual WebView2 runtime and checks its first three components against the driver. PowerShell installation and actual desktop harness await Windows/Linux CI, not locally executable on macOS.

- First application-acceptance run 42090781282: frontend/build isolation passes. Ubuntu 26 reports webkit2gtk-driver replaced by webkitgtk-webdriver; conditional package selection is prepared. Windows continues. Isolated acceptance bundle built and launched through native macOS UI; this proves bootstrap, not execution of external WebDriver on macOS.

- Windows first desktop test timed out before session creation, matching current elevated-runner WebView2 150+ restrictions (https://github.com/webdriverio/desktop-mobile/issues/542). Upstream merged/verified PR637 de-elevates tests with gsudo, so a framework upgrade is unnecessary. Adopted checksum-pinned portable gsudo 2.6.1 in CI only, Medium-integrity test tree, with workspace Modify granted only to the existing runner identity. Added request-stage diagnostics to distinguish session startup from actual editor failures. No Windows editor acceptance is claimed yet.

- Final CI 42092300007 at 4c18dda passed frontend/macOS/Windows/Linux. Both Windows/Linux actual application result artifacts were downloaded and independently checked: all seven cases passed. Medium-integrity execution resolved Windows session startup without a framework upgrade. Current normal macOS bundle rebuilt and reopened with saved three-diagram/table/task fixture. Supported core acceptance criteria are met; release/distribution and documented compatibility limits remain separate.
