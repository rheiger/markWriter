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

## Alpha2 implementation
- Verified latest origin main7e29c6f and preparation f6ceda7; created codex/offline-dot-alpha2 retaining About. Preparation source CI42150156541 is now success; baseline93 frontend tests pass. Preserved inventory20 files at /tmp/markwriter-alpha2-preserved.json.
- Actual Viz3.31.0 has embedded WASM and no production npm dependencies. Installed exact pin with ignore-scripts; zero advisories. Tauri2.8.4 on_web_resource_request exists on WebviewWindowBuilder, not global Builder; create configured window manually to attach scoped worker response CSP. Installed API inspected. Official Viz API, Graphviz attributes, Tauri CSP/distribution and MDN worker policy consulted.
- Added failing security/renderer tests first (missing modules), then18 tests pass: resource attribute rejection/HTML/concatenation/bounds, SVG reconstruction, cancellation/late-result isolation/queue/timeout recovery. Native CSP/browser gates still pending.

- Native Linux CI first failure was ownership comparison, not WASM policy: parsed page proves WYSIWYG real DOT renders, Preview pending source revision undefined compared against normalized0. Reproduced/fixed with clean opened-document regression at e4c2277; current CI42152895975.
- Runner primary README maps macos-26 to arm64, ubuntu-26.04 to x64, windows-2025 to Windows Server2025 x64. Node official latest24 is24.22.2. Rust1.90.0 builds/tests local locked source. No GitHub signing secrets configured; unsigned/ad-hoc experimental artifacts only.
- Notices:803 conservative JS/Rust component entries generated with0 missing texts.64 packages lacked full packaged terms: vendored31 pinned upstream downloads plus explicit standard-MIT supplements preserving source/manifest attribution and objc2 licensing-policy uncertainty. Registry sources store hashes/provenance; no runtime notice fetch. Graphviz16.1.0 is EPL2.0 (not inferred from older Graphviz licensing); Expat2.8.5 MIT and Emscripten6.0.10 license texts included.

## New issue review — 6 November 2026

- Original#18 requirement is only “Render inline UML diagrams.” A later agent update imposed PlantUML as a closure gate. Released native fixture tools/native-acceptance.mjs includes Mermaid sequenceDiagram/stateDiagram-v2, both-view repeated cycles, exactSaveAs/edit/save/reopen and static SVG export. Correct#18 to the original intent; PlantUML remains separate#31.
- New user issues#38 dark toolbar,#39 missingappicon,#40 explicit14+language code highlighting in both editors/auto detection/View+toolbar toggle,#41 PDF export,#42 SQLDDLfile→DBMLERDinsertion. Current ERDstarter is Mermaid; DBML#33 is unshipped.
- User reports successful installation of the macOS app; this is user acceptance evidence, not a new claim about signing/browser-quarantine/platform coverage.

- Owning source: Toolbar.css has fixed light background/button/dropdown/select colors, while Settings already offers Light/Dark/System. Tauri bundle config has no icon list; src-tauri/icons are documented placeholders and legacy assets exist. CodeMirror markdown has no fenced-language registry; Tiptap has common lowlight plumbing, but no complete shared language/auto-detection/theme/toggle pipeline. MarkdownIt/HTML export has no code-highlighting callback. Current Rust export accepts HTML only.
- Official highlight.js API supports explicit aliases and restricted-set heuristic highlightAuto; auto-detection must stay view-only and best effort. DBML importer is SQL→DBML, separate from rendering and dbconnector; require declared dialects and neverexecuteSQL. Tauri icon CLI provides native.icns/.ico/.png assets; valid ad-hocbundle signing is a separate supported mode from the currently recorded linker-onlyseal.
- Proposed next increment2.1.0-alpha3: #38 dark-theme fix, #40 full codeblock highlighting, #39 appicon/native packaging and validadhoc-seal hygiene. PDF#41 needs an early actual paginated native PDF-file spike; full PDF later. DBML#33 must qualify before DDLimport#42; SQL dialect remains open for a representative fixture. No model/agent change needed; single-agent issue/planning work.

- Final issue disposition: #18closed, #31/#33 independentopen with dependencyclarifications; #38–42 expanded with originalrequests preserved. Corrected #41 goodfirstissue label and added pinned APIreference. #39 requires a concrete preview, not an unnecessary preliminary permission gate. Readback18open/21closed. Local issueindex now distinguishes proposedalpha3core from PDFspike/fullPDFlater and33→42latermodeling.
- Primary references: highlight.js API https://highlightjs.readthedocs.io/en/latest/api.html ; DBML importer https://dbml.dbdiagram.io/js-module/core/ ; Tauriicons https://v2.tauri.app/develop/icons/ ; adHoc https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing ; pinnedprintAPI https://docs.rs/tauri/2.8.4/tauri/webview/struct.WebviewWindow.html#method.print . These ground planning boundaries, not unrun product implementation claims.
# Alpha3 current implementation evidence (6 November 2026)

- User goal now authorizes implementation in this session with subagents, built-in-browser tests and direct Auto/Light/Dark menu control. Fresh20-file baseline /tmp/markwriter-alpha3/preserved.json matches prior hashes. Branch codex/highlighting-theme-alpha3, source08e625a, draftPR43. No new merge/tag/release authority inferred from oldalpha2 scope.
- Pure lowlight15-grammar registry covers16variants. Shared decoration-only CM/PM plugins, bounded conservative detection, explicitplain/unknown reservedfallback, escapedHTMLformatter. InstalledbaseCodeBlock plugin retained for VSCodepaste after independentreview caught initial omission. CMCodeText chunk projection excludesnestedquote/listprefixes; PreviewnestedUTF16 textwalker preservesexactcorrespondence. Auto OSlistener updatesbothCM andMermaid.
- Lexer probe16KiCPP repeatedidentifiers ~720ms evenwithshortlines; finalcaps4Ki explicit/2Ki autoorline/16Ki document/64blocks/4auto. Revised4Ki fixture44ms, four2Ki auto164mscold. Input/workcountlimits only; oversizedcodeplain, sourcenottruncated. Cache128/512Kikeyunits.
-191frontend/19Rust/8Node tests pass;lint/typecheck/production+acceptancebuilds/bridgeexclusion/audit pass;803notices0missingunchanged. Built-inbrowser18theme/mode/widthchecks800/1024/1440 havezerooverflow/clipping;keywordtokensbothviews/Preview, explicittextplain, toggles/off/on exactsourceUI, exactnestedspanselection2rects0dashedfallback,2folds,independent18/16fontsettings,0consoleerrors/warnings. Evidence /tmp/markwriter-alpha3/browser-layouts.json andbrowser-theme-menu.jpg.
- LocalproductionDMG SHAbaa37b9d6892aee97a1bedc830d5689822c8e2292e1e26e33c09e5638863683a; installedowncopy /tmp/markwriter-alpha3/native-local/installed/MarkWriter.app. Validwholebundleadhoc,Info.plistbound15entries,SealedResourcesv2files1,strictverifyPASS,sourceICNSequal,tamperedresourcecopyFAIL. NottrustedDeveloperID/notarized. NativeCUAAboutalpha3+exactRichiecredit andordinaryOpenfixture1777chars/renderedC/C++/C#colors/sourcePreviewwork;moreUIacceptancepending. Original/ApplicationsMarkWriterPID48574untouched.
- CurrentCIbranchquality42203114611/packages42203114621 running; PR43checksadditionalpending. Nativeharness40groups andordinarypackage14groupsstaticcheckedbutnewruntimegatespending. No gatecompletioninferredfromstaticchecks.


## Alpha3 acceptance checkpoint — 11:57 local

Current source is b05c690, draft PR43. Product code last changed at42268d7 (reachable menu triggers and Escape/focus); b05 only refines native acceptance and documents the established rendered serializer boundary. There are192 frontend,19 Rust and9 Node tests. Pure view changes preserve original bytes; actual WYSIWYG edits can normalize whitespace through the existing serializer. Native rendered Undo now compares exact document JSON, serialized bytes and dirty state against an independently edited/undone copy without syntax toggles. No product history redesign was made.

Both42268 Linux quality runs reached all22 code-language cases, then correctly exposed an over-strong original-byte expectation for actual rendered Undo. Windows reached the same assertion. The new no-toggle comparison retains exact source Undo and all view-only byte gates. Latest quality runs: branch42206233676, PR42206241156. Agents monitor final quality/packages; no final-source pass is claimed yet.

42268 production Mac and Ubuntu packages pass. Ubuntu ordinary installation passes14 groups/22 language cases/6 theme-mode cases plus icon metadata. Mac branch DMG SHA66c9553c33cb9e768b955e5ba895361dbc5ddfe1674a2770a5da6ab47b145d3a; unlaunched copied app /tmp/markwriter-alpha3/ci-422-branch-macos/installed/MarkWriter.app, strict seal passes, all4 app files equal PR Mac artifact (manifest synthetic merge48ab4d has identical Git tree). Root will UI-test branch copy and compare any later package payloads before final qualification. Windows42268 packages remain under agent observation.

Local working-tree Mac UI (pre-menu-fix bundle) passed About/credit, ordinary Open, both code views, Light/Dark/Auto+Settings, exact1779-byte SaveAs (SHA3b181ef83e174ec2213a2a6e48692c64f2ea0899bc529bb425a1dec53fad70df), highlighted HTML146 spans/script-free, disabled HTML0 spans, actual preference restart (Dark/off), source edit43→toggle→Save→Undo→Save restored exact original, and visible YAML/JSON/XML/Dockerfile/alias/plain colors. Finder visibly renders the M icon and alpha3 version in an own temporary window; original Applications window/two tabs/alpha2 selection restored. All own local native apps closed; original /Applications/MarkWriter.app PID48574 remains running untouched.

CUA browser tab5 remains hidden at browser-alpha3.html; viewport override reset. Final browser-theme-menu.jpg shows Auto selected, syntax on, both source/Preview tokens9, clean tab,0 console errors/warnings. Browser menu hit test changed from menu-overlay to actual trigger; real pointer View→File and Escape/focus pass. Evidence browser-menu-regression.json. Vite exec session39611 still runs. Own temporary frontend/browser-alpha3.html and frontend/src/test/browserAlpha3.tsx must be removed at cleanup. Do not use closed alpha3NativeApp/alpha3RestartedApp CUA handles; launch exact CI app with a new explicit profile and new handle.

- Alpha3 native Undo regression is genuine model resurrection, not only existing WYS whitespace normalization. A deterministic clock splits first-sync history from second-sync/userinput and fails before fix. Both source synchronization paths now use one closeHistory/addToHistory:false setContent transaction;193frontendpass. Windows preference denial remains intermittent/causeunproven; bounded atomic retries retain same temp and visible terminal stage errors. Independent final review found no blocker; Windows held-handle tests awaitactualCI.

## Alpha3 user sample audit — 6 November 2026

User sample has24 labeled fences:17 important and7 lower priority. Exact source unchanged. Current runtime helper reproduces all missing explicitly labeled grammars: CSS/Swift/Makefile (important), Java/Perl/AWK/sed/CMake (lower), and Objective-C m alias (lower; canonical objective-c/objc works). Original #40 required16variants and did not nameCSS/Swift/Java/Makefile, but prior alpha2 WYS registry used lowlight.common, which included allfour; the restricted alpha3 registry therefore dropped existing configured WYS grammar coverage.

Autodetection is present, not globally absent. Stripping hints in memory: Python/YAML/XML/SQL/Bash/Go/C# samples can detect individually, while short Rust/JS/Dockerfile/JSON etc stay plain. CSS can be incorrectly guessed asYAML; C++ asC. In a whole document with all24hints removed, the four-auto-attempt budget leaves only one highlighted block (Python) in this sample. These limits were documented but realistic detection usability was under-tested. Earlier completion wording needs qualification. Probe data: /tmp/markwriter-feedback-audit/highlighter-probe.json.

- Follow-up 15f25d1 qualifies native input in both editors for fenced code, inline code and blockquotes. Prose actually substitutes quotes/dashes/ellipsis; technical editing retains literal ASCII and intentional Unicode. USInternational-PC quote deadkeys use Space to commit composition; the trace proves no event was prevented, so no product workaround was needed. Native SaveAs preserves all 6721 sample bytes and all 21 user-file hashes match. #46 tracks unchanged Turndown inline-code repeated-space collapse separately from the OS input guard. PR quality 42244922262 and packages 42244922277 pass all three targets. Branch Mac never acquired a hosted arm64 runner and executed no steps. Durable artifacts: /Users/rheiger/.codex/artifacts/markwriter-alpha3-15f25d1.
