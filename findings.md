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

- UI follow-up: static “66” is explicitly labelled Font Size in introducing commit a67d9ce. Converted to display-size selector; common config now owns zoom size, including WYSIWYG. Repeated mode controls moved to one ref API with App-shared actual mode; pending rAF transitions cancelled by generation.
- About uses native getVersion plus bundled metadata fallback and HTML modal semantics. Browser native Tab initially could leave to browser chrome with a single focusable control; explicit Tab/Shift-Tab containment now retains Close, Escape restores Help. Native macOS checks confirm version 2.0.0-alpha.1 and clean original document preservation.
- CodeMirror's public font metrics automatically updated from 14px to 32px in actual browser inspection, so no manual remeasurement workaround was added. 41 tests/lint/build/isolation pass. Native CI updated for toolbar switch and About version; awaiting terminal 42121100607.

- Terminal UI follow-up evidence: CI 42121100607 success at ba99ae9, eight actual app cases pass on each Windows/Linux result artifact. Native About shows 2.0.0-alpha.1; same mode-transition API preserves existing fidelity. No footer changes or writes to the user's original document.

## Productivity increment baseline
- HEAD 1fe311c / source ba99ae9 confirmed. CI42121100607 success rechecked via GitHub. Baseline 41 frontend tests, lint/build/audit zero and 12 library + 2 production Rust tests pass.
- Current owner is main.rs, not unused Rust config module. Canonical-path command added for duplicate ownership and Save As protection.
- Editor sessions are retained only for open tabs; inactive previews are cancelled, close unmounts/destroys engines. Session/history isolation now tested A→B→A.

## Productivity qualification follow-up
- Actual macOS recovery/table/settings/export evidence recorded in progress.md. Source fold/copy/search tests use public CM APIs; search state must be enabled before setSearchQuery. Fold choices are now mapped by embedded-block identity during WYSIWYG→source resync.
- Native CI42130138476 Linux edit fixture focused after assigning DOM selection and inserted at the prior editor caret; focus-before-selection corrects the harness. CI42131022673 Windows passed edit/save/export but selected a hidden Preview table cell by broad XPath; scope to active .tiptap. These are harness findings, with actual native macOS text/file checks passing.
- Browser test IPC fixtures explicitly emulate native event deregistration and use fresh Vite graph to avoid importing a second HMR store instance. Fresh isolated browser runtime passes with no errors.

- Final source acceptance: 6c6eb56 / CI42132949169 green;68 frontend and17 Rust tests,16 application cases per Windows/Linux artifact. macOS ordinary app/disk-conflict recovery/OS dialogs verified separately. Draw.io32.6.10 local offline boot/load works under current CSP, but native packaging, asset attribution and safe XML/SVG persistence gates remain unqualified; no product assets/control introduced.


## 2.1.0-alpha1 preparation — 6 November 2026

- Current renderer has no location sidecar. EditorView contains percentage scroll handlers in a mode-only effect; delayed editor creation, tab ownership and async geometry require deliberate lifecycle handling. Exact inline selection mapping needs more than parser block line ranges.
- User scope: #10 Find/Replace, #21 wrap continuation, #26 adaptive table picker, #28 remaining editing, new #30 source/Preview scroll/caret/selection correspondence. #29 and #5 are explicitly backlog, including stretch.
- New notation stretch issues: #31 PlantUML, #32 Graphviz/DOT, #33 DBML. Recommend DOT then DBML then PlantUML after core acceptance; actual offline/native/runtime/codec/security qualification is still outstanding.
- Official sources consulted: Viz.js WASM API, DOT grammar, DBML core/syntax (old dbml parser mode deprecated; check dbmlv2), PlantUML local prerequisites/security (Java/some Graphviz and explicit resource profile). Parser availability does not prove a renderer or safe native packaging. Links and exact gates are in the new plan.
- Model recommendation: GPT-6.1 Sol / Extra High (xhigh), supported by local model catalog and official model/effort guidance; this is a task recommendation, not a switch to the current running model.
- New named plan/prompt preserve the user's older untracked docs/next-increment-plan-2026-11-06.md and prompt. App metadata is exactly 2.1.0-alpha1; last feature-qualified source remains 6c6eb56 / 2.0.0-alpha.2.

## 2.1 implementation findings
- Baseline verified locally: 68 frontend and 17 Rust tests pass. Branch codex/editing-navigation-2.1 created from matching local/remote ed40277. 20 user files inventoried in /tmp/markwriter-2.1-preserved.json.
- Confirmed percentage sync attaches only by mode and misses lazy CodeMirror creation. Fresh Markdown caret uses end fallback. Source map has no prior implementation.
- Official parser/Tiptap docs retrieved; CodeMirror public site returns 403, using installed declarations. A diagnostic used nonexistent markdown-it/dist/index.mjs; corrected to package require resolution. Sidecar regression initially fails because no module/API exists; behavioral cases now drive implementation.
- Actual source and rendered code-selection regressions failed before fixes: fresh source selection head=31 instead of0; selected paragraphs produced2 codeBlock nodes. New commands pass reverse-selection/fence/undo and collapse tests. Existing Turndown already chooses safe ordinary code fences; added regression confirms it.
- CodeMirror counts CRLF as one newline unit while canonical source counts two. Added explicit UTF-16 coordinate conversion and source-edit application preserving unedited canonical CRLF/copy content. Sidecar stays in original source coordinates; controller converts at engine boundaries.
- Browser HMR duplicates unversioned store module imports after dependencies update (observed resources with?t timestamps). Browser runtime assertions will use a fresh server graph/current loaded store URL or native bridge, not assume unversioned import references the live store.

- Final-source browser rerun retains raw JSON under docs/evidence/editing-navigation-2.1-browser.json: exact native link/table/entity/Unicode endpoints; passive scroll stable; resize errors <3px; expanded1.05MB source; folded1.07→2.13MB ReplaceAll/Undo; literal input/paste/composition; tab/close cancellation; zoom/font/wrap reconfiguration without source/selection/fold changes. Linux final-source artifact22/22 verified; Windows artifact pending.
# Alpha2 preparation — 6 November 2026

- Accepted alpha1 is merged in PR #34 at main7e29c6f. Current preparation is codex/alpha2-plan-about; About credit source d49154b. No alpha2 feature or release is claimed by preparation.
- Next required scope is safe offline DOT#32 plus Tauri prerelease packaging#35; DBML#33 gated stretch; PlantUML#31/draw.io#5/logs#29 deferred. Actual prior runtime spike supplies the unresolved sanitizer/worker-policy/native gates.
- Current build.yml publishes historical Python/PyInstaller for v*; v2-ci.yml supplies debug executables/isolated acceptance, not installed production packages. Alpha2 must establish a single Tauri publisher, actual installation/OS-dialog checks, exact-source provenance/checksums/notices, and a verified prerelease with make_latest=false. Existing credentials may sign; otherwise explicitly unsigned experimental assets require real normal install/launch evidence.
- Installed Codex catalog exposes GPT-6.1 Sol and xhigh; recommended for the combined renderer/ownership/release session. Official reasoning guidance and Tauri distribution/CSP/Viz API were consulted; no benchmark superiority claim.
- About exact sentence visibly verified in ordinary rebuilt macOS app. Existing93 tests, lint/typecheck/production/acceptance builds and bridge exclusion pass. All20 user-file hashes preserved; local docs links/version consistent. Source CI42150156541 pending at handoff, not a claimed pass.
- GitHub#3/#4/#10/#31/#32/#33 updated with current alpha2 disposition and historical requirements preserved; #35 created/aligned. Readback verifies16 open/18 closed. Full plan/prompt: docs/next-increment-2.1.0-alpha2-{plan,prompt}.md.
