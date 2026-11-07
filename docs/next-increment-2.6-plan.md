# Proposed 2.6 increment: native integration and search

Prepared 7 November 2026 from Richard's ordered priorities and live issues. Planning target: **2.6.0**, regular release after acceptance; no version bump or release authority is conferred by this document. The current released application remains 2.5.1. This proposal supersedes the ordering in [the earlier proposal](next-round-after-2.5.1.md), preserving it as history.

## Decision surface

Aim for a coherent native-integration increment covering the first five priorities. Commit to native menus and regex search; make actual Quick Look delivery and update installation conditional on early installed prototypes. A Linux/cloud implementation alone cannot qualify Finder or macOS menus. More AI workers reduce independent coding time; they do not remove OS integration, key-management or acceptance dependencies.

| Richard's order | Next-increment outcome | Commitment and boundary |
| --- | --- | --- |
| 1. [#48 Markdown Quick Look](https://github.com/rheiger/markWriter/issues/48) | macOS association/open routing and actual Finder preview | First feasibility gate, then primary delivery target. Windows/Linux equivalents require separate provider and installed evidence; do not call a launched editor a preview. |
| 2. [#55 macOS menus](https://github.com/rheiger/markWriter/issues/55) | Global native menu bar, About in application menu | Core delivery; toolbar remains in window, no duplicate in-window menu on Mac. |
| 3. [#56 regex Find/Replace](https://github.com/rheiger/markWriter/issues/56) | Capture-group colors and replacement references in both editors | Core delivery, with explicit regex dialect and source-mapping contract. |
| 4. [#59 updates](https://github.com/rheiger/markWriter/issues/59) | Check for Updates and user-controlled installation | Check UI is straightforward; installation is gated on secure feed, bootstrap key and artifact/platform support. Automatic checks are optional and opt-in. A browser download link alone does not finish this issue. |
| 5. [#49 structured Quick View](https://github.com/rheiger/markWriter/issues/49) | Read-only formatted JSON/JSONL/YAML/XML Finder previews | Conditional extension of #48 after common-format provider selection is proved. Parsers may be developed independently. |
| 6. DDL/DBML/PlantUML | Concrete modeling design and fixture/dialect decision | Next modeling increment, not an unconditional addition to 2.6. |
| 7. PDF/print | Native feasibility and sample output | Next document-output increment; an ordinary print dialog is a useful slice but does not complete #41. |
| 8. Independent windows/layouts/preferences | Separate ownership/recovery design | Follow-up desktop increment; avoid coupling it to OS-open/menu/updater changes in the first delivery. |
| Independent signing documentation | Separate Mac/Windows/Linux instructions, README link | Delivered as documentation now; account provisioning/signing remains separate. |
| Highlighting performance, then languages | Comparative benchmark, evidence-selected optimization; Java/Perl/AWK/sed/CMake | Small independent research lane if capacity permits; no speculative engine rewrite on the critical path. |
| I18n | [Backlog #60](https://github.com/rheiger/markWriter/issues/60) | en/es/de/fr/it first; later pt/nl/da/sv/no/fi/pl/cs/sk; further on demand. No translation implementation in 2.6. |

**Forecast:** menus/search plus associations and update checking are credible core work. Full first-five delivery is a conditional target, with Quick Look/provider selection and secure installation the main uncertainty. Do not promise all remaining features in one unattended session. At the first prototype checkpoint record which gates passed and a measured remaining-work forecast; do not infer elapsed implementation hours from model names. If a top-priority gate fails, present its evidence and the resulting candidate scope before advertising a reduced feature set as complete.

## Ordered work and ownership

Use **one gpt-6.1-sol / medium orchestrator**, up to three **gpt-6.1-terra / high** workers, normal/default service tier. No worker orchestrators or recursive delegation. Reserve a worker slot for independent review; queue research instead of exceeding the cap. Fresh worker contexts receive explicit source paths, contracts and ownership. The orchestrator owns integration, shared command routing, scope, CI and evidence. Workers must not revert other agents or user files.

1. **Baseline and two early gates.** Freeze a clean source base, hash dirty/untracked user files and capture profile/release/tag/latest inventories. Inventory source and locked versions. Assign worker A a minimal macOS Quick Look extension/package/provider-selection prototype; worker B native menu mapping; worker C regex contract/prototype. Root investigates updater/feed/bootstrap using the signing guides. Do not start several simultaneous Rust/Xcode builds on one host.
2. **Quick Look checkpoint first.** Record build/embed/signing/provisioning prerequisites, actual Finder selection for Markdown and common structured UTIs, coexisting providers, and a clean installed preview. If unavailable on the current signing path, retain the prototype result and continue independent core work while reporting the blocker. File association alone is a separate successful slice.
3. **Integrate native commands and search.** Root owns shared App/MenuBar/store/main.rs wiring; menu worker and search worker submit leaf modules/tests and coordinate touching central files. The OS-open path must reuse captured I/O and document identity. Search does not become a global callback able to mutate another tab.
4. **Secure updater and structured previews.** After a worker is free, assign updater implementation and installed upgrade tests. Reuse the qualified preview host for independently tested structured formatters. Keep signing research documentation independent from product edits and credentials. Root reviews central workflow/release-policy changes.
5. **Independent review, full native/package acceptance, then candidate.** Review each leaf before integration and exact integrated source before merge. Run final three-platform checks and downloaded native UI. No unqualified issue closure, tag, public release, real updater feed activation or replacement of installed user app. Obtain a separate release instruction for the accepted candidate.

## Feature contracts and acceptance

### #48/#49 association and preview

Current source has no declared file associations or preview extension. The active backend is `src-tauri/src/main.rs`; do not implement only in the older `app.rs`. Apple describes a separate Quick Look Preview Extension target. Tauri's ability to include bundle files is not evidence of extension registration or Finder choosing it for common types. [Apple extension architecture](https://developer.apple.com/videos/play/wwdc2019/719/), [Apple convenience APIs](https://developer.apple.com/documentation/technologyoverviews/convenience), [Tauri bundle layout](https://v2.tauri.app/distribute/macos-application-bundle/).

- Register only declared extensions/types through normal packaging; respect selected defaults. OS-open with app closed/already running, multiple files, duplicate opens, spaces/Unicode paths, dirty tabs and failed reads must use document ownership/recovery rules. Define upgrade, uninstall and rollback behavior.
- Finder Space must display actual read-only content while app is closed and open. Compare file bytes and timestamps; no dirty tabs, recovery writes, script execution, remote requests or active arbitrary HTML. Bound source, nesting, expansion, image/resource handling and render work. State whether diagrams/math/images are supported; do not silently omit them.
- Test provider collision and user enablement on the actual supported macOS versions. Do not force default-app choices or globally reset Quick Look caches/providers to make a test pass. Document any targeted test registration and restore it.
- JSON formats valid compact input; JSONL handles records independently and identifies bad lines. XML prohibits external entities/DTDs/network and uses literal fallback where mixed content would be misrepresented. YAML bounds aliases/expansion and handles multiple documents. Formatting changes a display copy only. Invalid/oversized files get useful literal/error fallback.
- Windows shell preview handlers and Linux desktop preview mechanisms are independent deliverables. Explicitly state the tested desktop and distribution. An open issue remains partial if only macOS ships.

### #55 native menu

Map current commands from `frontend/src/components/MenuBar.tsx` to Tauri native menu actions, with one command authority and synchronized state. About belongs in the application menu; include standard Quit/Hide/services/edit/window roles as supported and appropriate. Preserve undo/redo, cut/copy/paste, search focus, shortcuts, enabled state, modal behavior, captured asynchronous actions and dirty-close handling. Native edit roles must work with focused text fields as well as editors. Test actual screen menu bar on Mac, with Windows/Linux behavior retained. [Tauri native menus](https://v2.tauri.app/learn/window-menu/).

### #56 regex

Specify dialect, flags, syntax errors, numbered/named groups and replacement escape syntax before implementation. Pick an engine using evidence: Rust's linear-time regex is a candidate but lacks lookaround/backreferences in patterns; JS compatibility may require a bounded worker. Do not run arbitrary backtracking regex synchronously on the UI thread. This search safety requirement is separate from the requested highlighting-speed research.

Test full matches plus distinct accessible capture colors, nested/overlapping/unmatched groups, zero-width progress, Unicode/UTF-16 mapping, multiline patterns, wrapping/direction and result limits. Define rendered-editor text-node boundaries and literal code behavior. Replace/Replace All must be atomic and undoable against the captured document/revision/query. Reject stale results and stale replacement callbacks after tab/revision changes. Search/navigation cannot normalize or dirty Markdown. Both-editor tests must exercise real editor APIs and adversarial patterns, not only regex helpers.

### #59 updater

v2.5.1 contains no updater or embedded update trust key: it needs a manual bootstrap install before a future in-app update can be tested. Updater artifact signatures are mandatory in Tauri and distinct from OS signing/notarization. Record key custody, backup, rotation, channel policy, explicit trusted endpoints, version ordering, size limits and failure states. Default production channel should exclude prereleases; retain `latest=false` for public release publication unless separately changed. A GitHub `/latest` query would currently select the deliberately older latest release: design an explicit reviewed version/channel manifest instead.

The current packages are DMG/NSIS/DEB; current updater documentation describes macOS app tarballs, Windows installers and Linux AppImage. Qualify exact locked plugin/toolchain compatibility and artifact types. Do not silently change Ubuntu's package contract to AppImage or claim DEB self-updates work. Use normal package-manager installation as a declared platform limitation only with explicit residual issue status. [Tauri updater](https://v2.tauri.app/plugin/updater/).

Test candidate A→newer candidate B using authentic signed artifacts and an isolated test feed, invalid/missing signatures, interrupted downloads, offline/TLS failures, unsupported platforms, downgrade/replay/channel cases and no-update. Prompt before restart/install; never lose dirty documents or recovery. Verify final installed bytes and retained data. This planning session does not generate production keys or publish a live update feed.

## Following increments and research

**Modeling:** #42 currently says SQL→editable DBML and depends on #33. Richard's Mermaid/DOT alternative can parse DDL→a shared schema model→editable Mermaid/DOT without DBML. Reconcile that output contract explicitly; do not close #42 against an unchanged DBML promise. Select one SQL dialect and representative schema before implementation; provisional PostgreSQL fixtures are a research option, not Richard's decision. Preserve tables, quoted/schema-qualified names, composite PK/FK and relationships; diagnose unsupported/lossy input, never execute SQL. DBML needs its own parser/adapter/render/export gates; the historical all-grammar spike was ~33 MB unminified. PlantUML remains an independent bundled-runtime/fonts/license/isolation spike. Read [the original notation spike](notation-offline-spike-2026-11-06.md).

**PDF/print:** separately prove each OS's real native print/print-to-PDF capabilities. PDF #41 requires actual offline multipage output with selectable Unicode, math, diagrams, images, tables and long code, sensible pagination and native Save/cancel/error handling. A browser print demonstration is insufficient for all packages.

**Windows/layouts/preferences:** establish cross-window ownership, Save As reservations, dirty close/recovery and external-change behavior before controls. Keep autosave to original files separate from existing recovery snapshots. Promote this after native command/open/update integration stabilizes.

**Highlighting speed:** research actual high-performance engines, including Rust native and Rust/WASM, rather than treating cancellation as the feature. Compare equivalent JS, WASM and native implementations on identical grammars, token spans and documents. Measure cold/warm p50/p95 lexing and end-to-end typing/render/scroll/mode/export latency, IPC copies, UTF-8→UTF-16 conversion, DOM/layout/paint, peak memory, bundle/startup and offline export behavior. Include long Python/JSON and the recorded pathological f-string case. A faster lexer can still be slower end-to-end; adopt only a measured win with fidelity/security preserved. Keep current plain fallback and safety bounds during research. Add Java/Perl/AWK/sed/CMake under #44 only with both-editor/Preview/export and detection/fallback tests.

**I18n backlog:** [#60](https://github.com/rheiger/markWriter/issues/60) records staged languages and message extraction/native-menu/Help/accessibility/fallback requirements. Danish is `da`, rather than country code `dk`; decide Norwegian variants during implementation. Never translate canonical documents implicitly. Other backlog remains deferred. Newly open #57 demo and #58 architecture documentation were observed but were not added to Richard's ordered delivery scope.

## Common shipment and cleanup gates

Preserve canonical Markdown, document/revision/generation ownership, per-tab histories, captured I/O, recovery/discard rules, independent fonts, Unicode/composition, exact Richie credit and artwork. Preserve all pre-existing dirty/untracked files, profiles, installed apps and historical releases/tags/assets/latest.

Use actual quality/native/package workflows on exact final commits; add provider/menu/regex/updater cases to ordinary installed checks where possible. Claim only tested OS/architecture/package baselines. Download the candidate and exercise native Mac UI in an isolated profile. A cloud/container result does not replace it. Retain hashes, native screenshots, platform manifests, qualified limitations and independent review. Signing guide commands are unexecuted proposals.

Use one owned run directory, sequential native builds, per-worker targets and lightweight logs. Before deleting owned scratch, hash/copy evidence and fixtures, verify user preservation and fresh source-bundle recovery. Keep one accepted installer per platform; do not prune shared caches or Time Machine snapshots to make room. See [execution locations](next-increment-2.6-execution.md) and [session prompts](next-increment-2.6-prompts.md).
