# MarkWriter 2.1.0-alpha1 — editing and synchronized navigation

Prepared 6 November 2026 for the next implementation session. **This is an implementation plan, not a completion report.** Version metadata is already `2.1.0-alpha1` (exact requested spelling). No new feature is implemented by the planning/version change.

## Direction and boundaries

Deliver dependable everyday editing in the existing single-window application, with content-aware Markdown/Preview scrolling, caret and selection correspondence. Finish core acceptance before attempting additional notation renderers.

| Priority | Outcome | GitHub scope |
| --- | --- | --- |
| Core | Find/Replace in both editing modes | [#10](https://github.com/rheiger/markWriter/issues/10), bounded search slice; other menu work remains |
| Core | Explicit soft-wrap continuation presentation | [#21](https://github.com/rheiger/markWriter/issues/21) |
| Core | Adaptive table picker, initially 5×5 | [#26](https://github.com/rheiger/markWriter/issues/26); table-picker work, not wrapping |
| Core | Remaining editing behavior and acceptance | [#28](https://github.com/rheiger/markWriter/issues/28), excluding developer logs |
| Core | Bidirectional content-aware scrolling, caret and selection correspondence | [#30](https://github.com/rheiger/markWriter/issues/30) |
| Stretch | Actual offline PlantUML, Graphviz/DOT and DBML visualization | [#31](https://github.com/rheiger/markWriter/issues/31), [#32](https://github.com/rheiger/markWriter/issues/32), [#33](https://github.com/rheiger/markWriter/issues/33), independently gated |
| Backlog | Developer console-log tool and draw.io | [#29](https://github.com/rheiger/markWriter/issues/29), [#5](https://github.com/rheiger/markWriter/issues/5); excluded even from stretch |

Also deferred: independent windows, third-party plugins, standalone JSON/XML modes, per-selection font/color formatting, broad preference expansion, graphical diagram designers (#19), database connections/SQL reverse engineering, and release signing/distribution. Do not reopen completed work merely because historical checklists are unchecked.

## Starting facts and authority

- Repository: `/Users/rheiger/Dev/markWriter`, public GitHub `rheiger/markWriter`. Planning branch: `codex/editing-navigation-plan`, based on `codex/productivity-increment` tip `3c100db034f28020cde5ce2aa9b10eb4facad25a`. Inspect current refs; preserve newer work. Create `codex/editing-navigation-2.1` from the verified planning tip (use a safe unique name if it exists), not stale `main`/`v2-development`.
- Last feature-qualified source is `6c6eb568a1596a725a9d360a320ede12d59029da`, version `2.0.0-alpha.2`. [CI 42132949169](https://github.com/rheiger/markWriter/actions/runs/42132949169) passed 68 frontend tests, all three native test/build jobs and 16 Windows/Linux application cases each. macOS ordinary dialogs/recovery/export were checked separately. These are historical baseline results, not acceptance of new 2.1 features.
- Read `AGENTS.md`, `QUICK_STATUS.md`, this plan, `docs/issue-status-2026-11-06.md`, `docs/adr-document-ownership.md`, `docs/productivity-increment-2026-11-06.md` and `docs/native-acceptance.md` first. Older `docs/next-increment-plan-2026-11-06.md` and its prompt describe the completed productivity increment and are reference only.
- Production native commands are in `src-tauri/src/main.rs`. The unused Rust config/command modules do not establish production behavior. The frontend store is `frontend/src/store/useAppStore.ts`.
- Preserve all pre-existing modified/untracked `Samples/`, `Testresults/`, older untracked plans/prompts and any newer user work. Inventory before editing. Never reset, clean, stash, stage or overwrite unrelated work. Test with generated temporary files and the isolated acceptance identity.
- Commit verified slices and push the new implementation branch, then wait for its final-source CI. No merge, tag, release or publication. Issue progress updates/closure are authorized for this increment only when backed by exact implemented scope and evidence; partial umbrellas stay open. No unrelated comments/messages.

## Invariants

Markdown is canonical. Navigation, selection, search highlighting, source maps, wrapping, folding, Settings and mode/tab changes must preserve exact source bytes, dirty state and edit history when no edit occurs. WYSIWYG edits preserve supported semantics and may normalize syntax; never round-trip unchanged content merely to obtain positions.

Keep each tab's engines, undo history, mode, caret and scroll isolated. Capture document ID/revision before asynchronous commands, saves and rendering. New callbacks may not mutate another active tab or overwrite newer edits. Preserve duplicate-path/destination ownership, Close/Save All/Quit protection, atomic persistence, rejected-schema retention and recovery/discard/conflict rules. Source/rendered font settings remain independent; toolbar size/zoom follows the active editor. Keep the toolbar mode switch, About, themes and unobscured footer.

## Product contracts

### Find/Replace (#10)

- Accessible current-document search UI, real editor commands, next/previous, match count, case and whole-word options, Replace and Replace All. Define wraparound and empty/no-match feedback. Cmd/Ctrl+F opens Find; platform-standard Replace shortcut and the Edit-menu entry must work in both modes. Enter/Shift+Enter navigate; Escape dismisses and returns focus. Do not dispatch synthetic shortcut events as the implementation.
- Markdown scope is canonical source, including syntax and folded payloads. WYSIWYG scope is editable rendered text, including text split across inline marks and table/list content. Label the scope. Atom/diagram internals are excluded from rendered replacement; provide an explicit switch to source to search/edit their source. Do not flatten blocks or alter table/diagram structure to manufacture a plain-text search document.
- Search/highlighting is view-only. Show matches without losing the existing editing selection or focus while typing a query. Explicit navigation selects/reveals the match; hidden source matches unfold. Replace acts on the identified current match/revision; Replace All affects that document only and is one undo step. Preserve unaffected marks and structural nodes; inserted text follows the starting text position's marks. Do not match across block/atom boundaries in rendered mode; literal multiline source queries are supported, and the rendered scope explains its block boundary limit.
- Search state is tab-local for open tabs; no new cross-restart search persistence required. Switching/closing tabs or changing mode/query/source invalidates stale matches. Replacement cannot target the newly active tab after a delayed operation. Repeated source hits in large folded payloads must not freeze the UI. Regex/project-wide search are deferred.

### Wrapping and picker (#21, #26)

- Add an explicit continuation guide/indent/marker using public CodeMirror view/decorations APIs. A soft wrap must be distinguishable from a real newline. Respect wrap on/off, font size, tab width and folds. No characters are inserted into source; copy/search/caret offsets remain correct. Test prose, long unbroken URLs and expanded data payloads.
- Picker starts at 5×5, grows a row/column when the pointer reaches the corresponding edge and shrinks toward the minimum as it retreats. Show the selected area and dimensions. Bound the rendered grid by available desktop space with a documented accessible way to reach larger supported sizes; no off-screen runaway growth. Provide arrow-key sizing, Enter to insert and Escape/outside dismissal with focus restoration. A dimension `C × R` creates C columns and R total rows including the header in both modes. Retain existing contextual commands/header rules from #27.

### Remaining editing (#28)

- A selected multiline Code action wraps/unwraps one fenced block in Markdown; use a fence length safe for selected backticks. WYSIWYG acts on the selected text blocks without splitting every line into separate code blocks. Define and test toggling at block boundaries and one-step undo.
- After an explicit formatting action, put the caret at the end of the resulting formatted content (outside closing source delimiters), retain expected marks for subsequent typing, and never jump to the document end. Test forward/backward selections, multiline selections, table cells, Undo/Redo and both modes.
- Literal Markdown-prefix typing in WYSIWYG remains literal; shortcuts/toolbar commands create formatting. Disable automatic Markdown input/paste transformations where they violate this contract while retaining ordinary Enter/list/task continuation and composition/IME behavior. Test `# `, `> `, `- `, `1. `, fences, emphasis, underline and links typed/pasted as text; serialize with correct escaping and reopen/render literally.
- Place the initial caret at the start for a genuinely new or newly opened document. Switching to an existing tab, duplicate-path activation or restoring a session preserves its remembered caret/scroll; do not reset on every render/mode switch.
- Remove the decorative blue document-boundary/percentage-position lines noted in #28. New synchronization indicators must be local caret/range/block correspondence highlights, not full-width boundary lines. Check selection margins and all existing #28 items against real behavior. Fix any reproduced in-scope blocker; record a traceable disposition for every remaining editing item rather than declaring the entire old checklist green without evidence.
- Add a short supported-Markdown/normalization guide. Distinguish valid GFM whitespace from actual corruption; document extensions (`++underline++`, safe table `<br>`), WYSIWYG normalization and practical markdownlint exceptions. Do not rewrite user files to satisfy a linter. #29 is backlog and not an editing completion gate.

### Source/Preview synchronization (#30)

Preview stays read-only. CodeMirror is the editing authority. “Preview cursor” means a mirrored visual caret/correspondence marker, not an independent editable caret. Default sync on; a persisted enable/disable preference controls scroll and correspondence synchronization together. Off permits independent scrolling/selections and does not change content.

1. **Mapping:** extend the existing Markdown parser/renderer with a sidecar source map. Key mappings by document ID, source revision and render generation. Block token line ranges give anchors, not exact inline positions. Add explicit rendered-text/source segment mappings for plain/inline text, entities/escapes, links, code, tables and nested lists. Use UTF-16 offsets consistently and test emoji/combining marks/CRLF/repeated identical text. Do not locate ranges by a global `indexOf` of rendered text or assume DOM text length equals source length. View metadata may not leak into saved Markdown or exported HTML.
2. **Non-bijective content:** syntax delimiters, generated bullets/checkboxes, soft/hard breaks and diagram/image atoms cannot all have a character-exact inverse. Document deterministic nearest token/block boundary rules. Exact text mappings stay exact; fallback block correspondence is visually distinct and never masquerades as character accuracy. Diagram SVG labels map to the enclosing source fence, not a fabricated source character. Unsupported positions remain navigable by their containing block.
3. **Scrolling:** the user-scrolled pane leads. Locate the top visible source/render block and interpolate locally between anchors, so folded source, tables/images/tall diagrams and unequal fonts stay aligned. Whole-document percentage mapping is insufficient. Keep the corresponding content region at the same viewport anchor where geometry permits; clamp sensibly at top/bottom. Wheel scrolling never changes the caret/range, expands folds or steals focus.
4. **Caret/selection:** source click/keyboard movement and drag selection highlight the corresponding Preview text or containing atom/block. Clicking/drag-selecting Preview text updates the CodeMirror caret/range, including anchor/head direction. Preserve native Preview selection/copy and keep keyboard focus with the user's pane. Mirror through decorations/overlays rather than overwriting the global DOM selection. Editing resumes when source is explicitly focused. Explicit navigation to a hidden source target may reveal it; passive scrolling does not.
5. **Lifecycle:** coalesce geometry work with animation frames, split measurement from writes, and use request/generation ownership to suppress programmatic event feedback until the actual event frame settles. A synchronous boolean cleared immediately after assigning `scrollTop` is insufficient. Rebuild/invalidate only when required; use observers for image/diagram resize, pane resize, font/zoom/wrap/fold changes and async render completion. Dispose listeners/observers/jobs on tab close or mode change; stale Mermaid/layout results cannot move a new tab's viewport or selection. Respect reduced motion; no smooth-scroll oscillation.

Current code has percentage-based bidirectional scroll handlers in `EditorView.tsx` and no parser location sidecar in `lib/markdown.ts`. The mode-only effect can miss the asynchronous editor creation/active-tab lifecycle. Investigate attachment and disposal explicitly; do not merely adjust the percentage formula.

## Ordered implementation slices

Each slice must leave a working application. Add meaningful failing regressions before behavior fixes; keep relevant tests green and commit each verified slice. File names below identify likely owners, not permission to refactor everything nearby.

| Slice | Outcome and acceptance | Main owners | Depends on / verification |
| --- | --- | --- | --- |
| 0 | Recheck baseline, versions, branch ancestry and user-file inventory; reproduce remaining issues with generated fixtures | store/editor, manifests, existing tests/docs | None; baseline commands below; no stale-count claims |
| 1 | Write a small mapping/ownership ADR and implement tested renderer sidecar block + inline offsets with documented fallbacks; no new sync UI yet | `lib/markdown.ts`, new mapping module/tests, ADR | 0; exact maps for entities/Unicode/repeated text/tables; unchanged rendering/export/source |
| 2a | Source Find/Replace vertical slice, tab-owned commands, fold reveal and undo | editor command interface, new search controller/UI/tests, MenuBar | 0; real CodeMirror edits, stale target/failure tests and browser keyboard flow |
| 2b | Rendered Find/Replace adapter preserving marks and structures | new rendered-search module/tests, EditorView, search UI | 2a; real Tiptap cases across marks, cells, lists and atoms; Replace All undo |
| 3a | Soft-wrap continuation visualization | new CodeMirror extension/tests, EditorView/CSS | 0; real layout, exact bytes/copy, wrap toggle, long payload |
| 3b | Adaptive picker and accessible pointer/keyboard insertion | Toolbar/CSS/tests | 0; exact C×R dimensions in both editors, focus and narrow layouts |
| 4a | Multiline Code and post-format caret rules | editor commands/tests | 2a; forward/reverse selections, fences, marks and undo |
| 4b | Literal WYSIWYG typing/paste and fresh-open caret; retire boundary lines; editing disposition/Markdown guide | editor extensions/tests, store if needed, docs | 4a; actual keyboard/composition/paste, New/Open vs restore, all remaining #28 editing dispositions |
| 5a | Source/Preview anchored scroll in both directions with safe lifecycle and sync preference | mapping/sync controller, EditorView, preferences schema/tests, Settings | 1, 3a; real browser geometry/fold/font/tab/reflow/off tests; migration defaults and native preference persistence |
| 5b | Bidirectional caret/selection correspondence without focus/copy/history side effects | mapping/sync modules/tests, EditorView/CSS | 5a, 4a; exact and fallback ranges, reverse selections, Preview copy, stale-generation tests |
| 6 | Extend isolated native harness and finish required integration acceptance | `tools/native-acceptance.mjs`, acceptance bridge, docs | All core slices; actual three-platform evidence and ordinary macOS journeys |
| 7 | Attempt independently qualified notation stretch; ship only complete format slices | diagram adapters/nodes/codec/export/folds, runtime assets if justified | 6; the gates below, separate commits per format |
| 8 | Final review, docs/issue reconciliation, pushed source CI and ordinary review app | status/changelog/acceptance/issues | 6 plus any integrated stretch; exact evidence and remaining scopes |

One primary implementer owns shared editor/store/parser lifecycle changes. No parallel competing edits. A read-only reviewer is useful after mapping design and before completion if explicitly permitted by the next session's instructions; delegation is not required by this plan. Checkpoints are autonomous verification gates, not recurring requests for permission.

## Notation stretch: gates and recommended order

All three requested formats remain tracked even if some cannot qualify in this increment. Recommended implementation order is **DOT → DBML → PlantUML**, because a qualified local DOT layout may serve DBML, while PlantUML has a distinct runtime/packaging decision. This is an architectural recommendation, not a compatibility result. Assess all three after the core gate; do not silently substitute Mermaid for any of them.

| Format | Initial path to investigate | Required semantics / material uncertainty |
| --- | --- | --- |
| DOT #32 | Pinned locally bundled `@viz-js/viz` WASM, worker layout; `dot` fences and documented `graphviz` alias | Directed/undirected graphs, labels/clusters/subgraphs, bounded documented attributes; qualify native WebView WASM/CSP/assets and engine support |
| DBML #33 | Actual DBML parser, initially `@dbml/core`; verify current `dbmlv2` API and browser compatibility; explicit schema-to-layout adapter | Tables/types/PK/FK/UK/nullability/composite keys/cardinalities; parser output is a schema model, not a diagram renderer. No database access, SQL import or multifile includes |
| PlantUML #31 | Investigate pinned self-contained local runtime, including browser/WASM options only if evidence supports them | Minimum sequence/class fixtures and a documented supported subset; official local route normally requires Java and sometimes Graphviz. Do not depend silently on user-installed executables or assume a full browser engine exists |

Before adding a product control/production dependency, prove: redistribution/asset attribution and footprint, offline native packaging on all three platforms, CSP compatibility, bounded/cancellable rendering off the UI thread, safe runtime/resource behavior, and a lossless editable-source representation. A minimum format slice must include Preview + WYSIWYG + save/reopen + HTML export + folds/navigation anchors, not just a browser demo.

Use canonical text fences (`plantuml`, `dot`/`graphviz`, `dbml`) and explicit opaque WYSIWYG nodes/serialization that retain source, including blank/malformed source. Generalize the existing Mermaid path narrowly; no plugin framework. Async results have owner/revision/generation cancellation. Inline errors must recover; export fails visibly for unsupported/invalid notation rather than silently dropping it. SVG output is sanitized; prohibit scripts, event handlers, `foreignObject`, unsafe links and external resources. Reject notation-driven network/filesystem/environment access, remote/local includes and unsafe image references; apply a verified strict runtime policy (PlantUML's documented SANDBOX is a candidate, not proof of host isolation). Enforce input/output/time/complexity limits and terminate stalled workers/processes. No source uploads, hosted renderer, runtime downloads, servers or relaxed general `unsafe-eval` CSP.

Per format, verify actual offline creation/edit/save/reopen/export, byte-identical view-only cycles, unrelated WYSIWYG edits, modes/tabs/undo/recovery, source search/folds/navigation, malformed/hostile/large inputs, static self-contained export and native asset resolution. Record supported subset and pinned version/license. If a runtime/codec/safety/native gate fails, keep the core, record the spike and defer that format without placeholder controls. Graphical authoring and draw.io remain backlog.

## Verification and completion

Run the existing scripts from the repository root (Node 24+):

```sh
npm run test --prefix frontend
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm run build:acceptance --prefix frontend
node tools/native-acceptance.mjs --check-builds-only
npm audit --prefix frontend
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Extend meaningful real-engine regressions and browser/native workflows; passing mocks or static builds alone is insufficient. Keep acceptance instrumentation absent from ordinary production assets and the separate application identity. Use `.github/workflows/v2-ci.yml` for three-platform tests/builds and actual Windows/Linux application cases; inspect final artifacts, not only the green summary. Mac native UI acceptance is separate; Windows/Linux explicit-path IPC/filesystem tests are not OS-dialog acceptance.

Required new acceptance matrix:

- Search both modes, case/whole-word, empty/no matches, marked/table/list text, folded source and Replace All undo; switch/close/edit races cannot replace the wrong document/revision.
- Wrapping/picker/remaining editing contracts above, keyboard-only use, light/dark, 800/1024/1440px layouts, unequal source/rendered sizes, viewport-bounded menus and visible footer; no console errors/warnings in accepted flows.
- Bidirectional scroll to specific content in long mixed documents (not only top/bottom percentages), repeated text, folds, tall async diagrams/images, resize/zoom/fonts/wrap; no feedback loops, focus theft, source mutation or history entries. After settling, mapped textual anchors should agree within one visible text line where both viewports permit it; record deterministic block fallback for tall atoms.
- Source→Preview and Preview→source caret/forward/reverse selections, Unicode/entities/link/table text and atom fallbacks; native Preview copy and source typing retain expected focus. No late cross-tab selection writes; sync off is independent; enabled setting persists/migrates.
- Re-run canonical byte/semantic fixtures, tab/history isolation, captured-save ownership, dirty Close/Save All/Quit, native Settings persistence/restart, recovery/discard/external-file conflicts, HTML/SVG export and version-correct About. Measure responsiveness with a 1 MB embedded payload and large mixed fixture; do not parse/re-layout the whole document on every mouse move/scroll frame.

After final code passes: update QUICK_STATUS/CHANGELOG, the acceptance report and issue index with exact source commit/CI evidence; close #21/#26/#30 only if complete, reconcile #28 against every editing requirement, and leave #10 open for deferred menu scope. Each notation issue closes only on its own qualified slice. Keep #29/#5 backlog. Rebuild/check the ordinary macOS `2.1.0-alpha1` review app, push verified feature commits, wait for final-source CI, and report core versus stretch distinctly. No merge/release/tag.

## Preparation verification (not feature acceptance)

Metadata commit `53598fa` passed the existing 68 frontend tests, 17 locked Rust tests, frontend lint, production/acceptance builds, bridge isolation and zero-advisory audit. All nine manifest/lock version fields agree on `2.1.0-alpha1`. New plan/prompt/index Markdown rendering, local links and fences were checked; all 20 pre-existing modified/untracked user files retained their hashes. Existing large-bundle and unused Rust test-import warnings remain. The ordinary macOS bundle was not rebuilt/requalified here. New 2.1 feature/native acceptance belongs to the implementation session.

## Model and thinking level

Recommended: **GPT-6.1 Sol (`gpt-6.1-sol`), Extra High (`xhigh`)** for the implementation session. This is a workload judgment: bidirectional UTF-16 source/DOM mapping, selections/focus/undo ownership, asynchronous reflow and three separate optional runtime integrations are tightly coupled. Extra High is justified here; blanket Max/Ultra and automatic parallel editing are unnecessary. High is a reasonable lower-cost choice for an isolated picker/wrap slice, not the recommended default for the complete session.

This model and `xhigh` were present in the local Codex model catalog during planning. Select them in the new session; this document does not switch the current model or promise account-wide availability. Recheck the picker if availability changes. Official [Codex model/effort guidance](https://learn.chatgpt.com/docs/models) and [GPT-6.1 Sol model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) were consulted on 6 November 2026; the specific effort recommendation is ours, not an official task benchmark.

## Primary technical references

- [MarkdownIt documentation](https://markdown-it.github.io/markdown-it/) and the installed package's bundled source/declarations for token line-map behavior. The installed 15.x package resolves to `dist/markdown-it.cjs.js`; do not assume the old `lib/token.mjs` path exists. Block maps alone do not provide inline offsets.
- [CodeMirror public reference](https://codemirror.net/docs/ref/); web retrieval returned 403 during planning, so verify against installed declarations/source before selecting APIs for search, geometry, decorations, bidi/Unicode and scroll transactions.
- [Tiptap commands](https://tiptap.dev/docs/editor/api/commands); inspect installed 3.x/ProseMirror selection and transaction types for search/replacement/history behavior.
- [Viz.js API](https://viz-js.com/api/), [DOT grammar](https://graphviz.org/doc/info/lang.html).
- [DBML parser API](https://dbml.dbdiagram.io/js-module/core/), [DBML syntax](https://dbml.dbdiagram.io/docs/). Current docs deprecate the old `dbml` parser mode in favor of `dbmlv2`; confirm against the pinned package.
- [PlantUML local prerequisites](https://plantuml.com/starting), [security profiles](https://plantuml.com/security).

Open feasibility decisions belong to stretch spikes, not silently chosen services/dependencies. No unresolved product question blocks starting the core work under these contracts.
