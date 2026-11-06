# MarkWriter status — 6 November 2026

Version metadata: **2.1.0-alpha1**, unreleased, Node 24+. Preparation branch: `codex/editing-navigation-plan`, based on productivity tip `3c100db`. This session prepares the plan/prompt/issues and bumps metadata; it does not implement new features or rebuild the ordinary review app.

## Next session

Use the [2.1.0-alpha1 implementation plan](docs/next-increment-2.1.0-alpha1-plan.md) and [launch prompt](docs/next-increment-2.1.0-alpha1-prompt.md). Recommended model: GPT-6.1 Sol, Extra High (`xhigh`).

- Core: Find/Replace #10; wrap continuation #21; adaptive table picker #26; remaining editing #28; content-aware source/Preview scroll/caret/selection synchronization #30.
- Stretch after core acceptance: PlantUML #31, Graphviz/DOT #32, DBML #33; qualify each offline/native/source-persistence/export path independently.
- Backlog: #29 developer console-log tool and #5 draw.io, including stretch. Independent windows/plugins/broader preferences and graphical designers also remain separate.
- [Issue index](docs/issue-status-2026-11-06.md): 19 open / 14 closed after reconciliation. Core/stretch above are planned, not delivered.

Preparation checks at metadata commit `53598fa`: 68 frontend tests, 17 locked Rust tests, lint, production/acceptance builds, bridge isolation, audit (zero advisories), all nine version fields, Markdown rendering/local links and 20 preserved user-file hashes pass. Existing large-bundle and unused Rust test-import warnings remain. No new native UI acceptance or ordinary app rebuild is claimed for this preparation.

## Inherited implementation baseline — 2.0.0-alpha.2

The four requested core features are implemented: single-window document tabs, persistent Settings/recovery, contextual WYSIWYG table management and non-destructive embedded-source folding. Insert → Diagram → Mermaid ERD uses the existing renderer and supports self-contained HTML export. Independent windows and broader preferences remain deferred.

## Feature behavior previously verified at 6c6eb56

- Canonical Markdown remains byte-identical and clean through unedited tab/mode/fold/settings changes. View-only table normalization does not rewrite source. Supported semantics remain preserved after WYSIWYG edits.
- Tabs retain their own engine histories, mode, caret and scroll. New/Open, canonical duplicate activation, reorder/navigation, Close, Save All and all-tab Quit protection are implemented. Captured-owner saves/dialogs preserve newer edits and destination ownership.
- Settings Apply/Cancel/Reset work with separate source/rendered fonts and sizes; toolbar size/zoom follow the active editor. Native atomic versioned preferences and local recovery snapshots handle failures visibly. Externally changed/deleted files recover as detached copies; deliberate discard does not reappear.
- Table row/column controls implement the specified boundary rules, header/alignment preservation, selection toggles, undo and Markdown/export fidelity. No merged cells.
- Mermaid and long base64/URL-encoded image payloads fold without replacing source. Search unfolds matches; complete copy includes folded text. Fold choices survive tab/mode cycles and edited re-synchronization.

## Feature-baseline evidence (not new 2.1 feature acceptance)

- 68 frontend tests, lint, typecheck/build, acceptance-build isolation and zero-advisory npm audit pass locally. 12 Rust library + 5 production-command/storage tests pass.
- Actual macOS native dialogs, dirty Close/Quit, Settings/restart, unnamed recovery, external-disk conflict, table/fold controls and ERD export pass. Ordinary alpha.2 bundle rebuilt; original clean 7996-character document restored.
- Browser checks pass with real editors/Mermaid and no console issues; ten tabs and 800/1024/1440px layouts preserve the footer and avoid page overflow. Browser IPC is fixture-backed.
- [CI 42132006395](https://github.com/rheiger/markWriter/actions/runs/42132006395) passed at `323aec8`, with 16 actual Windows/Linux application cases each; both artifacts inspected.
- Final source `6c6eb56` passed [CI 42132949169](https://github.com/rheiger/markWriter/actions/runs/42132949169): 68 frontend tests and all three native jobs; both Windows/Linux artifacts confirm all 16 application cases. Subsequent closeout changes are documentation only.

## Limits

The [draw.io spike](docs/drawio-offline-spike-2026-11-06.md) proves basic local offline boot/XML load, while native asset packaging, full attribution and safe editable-XML/SVG integration remain unqualified; product integration is deferred with no placeholder control. This is separate from Mermaid ERD.

Independent windows, shortcut customization, settings import/export, original-file autosave, merged cells, general image asset/path management and signing/release packaging remain deferred. Windows/Linux OS path dialogs are separate from explicit-path native tests. Recovery cannot guarantee final unflushed keystrokes after sudden loss. Large-bundle warnings remain. No merge, tag or release. Issue reconciliation and the new preparation scope are recorded separately in the issue index.

Details: [productivity acceptance](docs/productivity-increment-2026-11-06.md), [native harness](docs/native-acceptance.md), [ownership ADR](docs/adr-document-ownership.md). Existing Samples/ and Testresults/ user work remains untouched. Older completion claims are historical.
