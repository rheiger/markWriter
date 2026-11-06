# MarkWriter status — 6 November 2026

**Released:** [2.1.0-alpha2](https://github.com/rheiger/markWriter/releases/tag/v2.1.0-alpha2), experimental prerelease/latest=false. Application source `9bfd2c1f4222e9fc7157a84097e7adc435a941c9` merged through [PR #36](https://github.com/rheiger/markWriter/pull/36). Safe bounded offline DOT is delivered across Preview/WYSIWYG, canonical fences, Insert starter, folds/search/block correspondence, undo/save/recovery and sanitized static export. Existing Markdown ownership, histories, recovery, fonts and exact Richie credit are preserved.

**Verification:**134 frontend/19 Rust/5 Node tests; all 3 native builds;33 actual Windows/Linux application groups each;11 ordinary installed package groups each Windows/Linux. Downloaded final macOS normal UI matches every app file of14-group safety/codec and10-group fresh-profile UI runs. [Post-merge quality](https://github.com/rheiger/markWriter/actions/runs/42166589001), [packages](https://github.com/rheiger/markWriter/actions/runs/42166589129), [tag publisher](https://github.com/rheiger/markWriter/actions/runs/42168014190). All12 public downloads match verified bytes;8 old releases/assets, old tags and stable/latest remain unchanged. [Full acceptance](docs/offline-dot-alpha2-acceptance.md), [installation/profile/rollback](docs/install-alpha2.md), [supported DOT](docs/supported-markdown.md).

**Limits:** unsigned Windows and linker-ad-hoc/unsealed macOS (strict bundle verification fails; no Developer ID/notarization/trusted-distribution claim). Actual normal launch is qualified for the recorded paths; browser quarantine is unqualified. Exact narrow OS/WebView baselines are in manifests. DBML#33 and PlantUML#31/draw.io#5/logs#29/independent windows/plugins/broad preferences remain deferred. #3/#4/#10 remain partial. #32/#35 closed;14 open/20 closed. User Samples/Testresults/older plans preserved; original clean app session restored.

<details>
<summary>Historical status and preparation (superseded by released alpha2 above)</summary>

> **Alpha2 implementation in progress (6 November 2026):** `codex/offline-dot-alpha2` implements bounded offline DOT and production Tauri packaging. [Qualification](docs/offline-dot-alpha2-acceptance.md), [DOT subset](docs/supported-markdown.md), [installation](docs/install-alpha2.md). Required native/installed/final-byte gates remain open; no alpha2 merge/tag/release is claimed. Earlier entries below are historical.

# MarkWriter status — 6 November 2026

**Current:** unreleased `2.1.0-alpha1`, accepted and merged into `main` at `7e29c6f` through [PR #34](https://github.com/rheiger/markWriter/pull/34). Required core: Find/Replace in both editors, view-only wrap cues, adaptive 5×5 table picker, remaining editing fixes and content-aware bidirectional source/Preview navigation. No tag/release was created for that integration.

**Next:** planned `2.1.0-alpha2`: safe offline DOT #32 plus real Tauri prerelease packaging #35; DBML #33 is gated stretch. Read the [plan](docs/next-increment-2.1.0-alpha2-plan.md) and [copyable implementation prompt](docs/next-increment-2.1.0-alpha2-prompt.md). Recommended model: GPT-6.1 Sol / Extra High. The next agent is authorized to update issues and commit/push/merge/publish a qualified prerelease after acceptance. PlantUML #31, draw.io #5 and logs #29 remain deferred/backlog. Current preparation adds the requested Richie/vibe-coding About credit on `codex/alpha2-plan-about`; existing 93 frontend tests, lint/build/bridge exclusion and ordinary rebuilt macOS About UI pass. Version remains alpha1; next features and release are not claimed complete.

Read the [acceptance report](docs/editing-navigation-2.1.0-alpha1.md), [#28 disposition](docs/editing-28-disposition-2026-11-06.md), [mapping ADR](docs/adr-preview-correspondence.md) and [supported Markdown guide](docs/supported-markdown.md). The older alpha1 plan/prompt are completed scope records, not instructions to restart the core.

93 frontend tests, 17 locked Rust tests, lint/typecheck, production/acceptance builds, bridge exclusion and zero-advisory audit pass locally. Final-source [CI 42145312950](https://github.com/rheiger/markWriter/actions/runs/42145312950) passed all three native platforms; downloaded Windows/Linux artifacts each confirm 22 passing application cases. Ordinary macOS native dialogs/search/picker/Settings persistence/recovery/export were exercised; final review bundle is rebuilt at the source tip and About shows exactly 2.1.0-alpha1. See acceptance for fixture evidence and limits.

DOT/DBML/PlantUML were attempted after core qualification and deferred independently at runtime/safety/packaging gates; see the [notation spike](docs/notation-offline-spike-2026-11-06.md). #10 retains deferred menu scope. Windows/Linux OS dialogs and installed distribution become required alpha2 gates; native IME candidate interaction and independent windows/plugins/broad preferences remain distinct. [Issue index](docs/issue-status-2026-11-06.md):16 open/18 closed after adding #35; #21/#26/#28/#30 remain closed with qualified evidence. User Samples/Testresults and older untracked plans remain unchanged.

## Historical preparation

The planning branch `codex/editing-navigation-plan` ended at `ed40277`; version metadata was prepared at `53598fa`. Those preparation checks did not implement or qualify these features. All older priorities/counts below are historical.

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

</details>
