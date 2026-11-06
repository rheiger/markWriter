# GitHub issue status — 6 November 2026

Snapshot after alpha2 planning reconciliation: **16 open / 18 closed**. Accepted unreleased `2.1.0-alpha1` is merged into `main` at `7e29c6f` via [PR #34](https://github.com/rheiger/markWriter/pull/34). Qualified source `2895d1c` / [CI 42145312950](https://github.com/rheiger/markWriter/actions/runs/42145312950) passes 93 frontend tests, 17 Rust tests, all three native builds/tests and 22 actual application cases each on Windows/Linux; both artifacts inspected. See [acceptance](editing-navigation-2.1.0-alpha1.md), [#28 disposition](editing-28-disposition-2026-11-06.md) and [notation spike](notation-offline-spike-2026-11-06.md).

## Next increment — planned 2.1.0-alpha2

Required: #32 safe offline DOT and new #35 verifiable Tauri prerelease packaging. #33 DBML is conditional stretch after both pass; #31 PlantUML remains deferred. [Plan](next-increment-2.1.0-alpha2-plan.md) / [implementation prompt](next-increment-2.1.0-alpha2-prompt.md). Updated #3/#4/#10/#31/#32/#33 without closing partial scopes or deleting history; created #35. Richard authorizes qualified issue maintenance and commit/push/merge/prerelease after acceptance. Current preparation adds only the About attribution and documentation, retaining version alpha1. No alpha2 feature/release is claimed complete.

## Reconciled this increment

- #21 wrap continuation, #26 adaptive picker/active formatting, #28 remaining editing and #30 source/Preview correspondence closed as qualified feature-branch implementations.
- #10 Find/Replace slice is complete; the menu umbrella remains open.
- #31/#32/#33 were each attempted with actual runtimes after core acceptance and independently deferred at documented shipment gates. No product controls/dependencies were added for them.
- #5 draw.io and #29 developer logs remain backlog. Alpha1 subsequently merged in PR #34; no tag/release was created. Historical GitHub requirements/statuses were preserved under their updated implementation dispositions; old unchecked reports are not current failures.

## Open

| Issue | Remaining scope / disposition |
| --- | --- |
| [#3](https://github.com/rheiger/markWriter/issues/3) | Rewrite umbrella; release/package acceptance remains distinct |
| [#4](https://github.com/rheiger/markWriter/issues/4) | Native Linux works in qualified CI; OS dialogs/distribution remain separate |
| [#5](https://github.com/rheiger/markWriter/issues/5) | draw.io backlog, excluded from this increment including stretch |
| [#6](https://github.com/rheiger/markWriter/issues/6) | Plugin architecture backlog |
| [#7](https://github.com/rheiger/markWriter/issues/7) | Standalone JSON/XML modes backlog |
| [#8](https://github.com/rheiger/markWriter/issues/8) | Single-window tabs delivered; independent windows/cross-window ownership deferred |
| [#9](https://github.com/rheiger/markWriter/issues/9) | Settings/recovery delivered; broader preference/import/export/shortcuts scope remains |
| [#10](https://github.com/rheiger/markWriter/issues/10) | Find/Replace delivered and qualified; remaining menu/window/help umbrella stays open |
| [#18](https://github.com/rheiger/markWriter/issues/18) | UML umbrella; concrete PlantUML runtime remains #31 |
| [#19](https://github.com/rheiger/markWriter/issues/19) | Graphical designers remain separate from textual notation visualization |
| [#22](https://github.com/rheiger/markWriter/issues/22) | Per-selection font/color formatting deferred; independent display fonts are separate |
| [#29](https://github.com/rheiger/markWriter/issues/29) | Developer console-log tool backlog; excluded from #28 closure |
| [#31](https://github.com/rheiger/markWriter/issues/31) | Deferred from alpha2; PlantUML self-contained runtime/process/native gates failed |
| [#32](https://github.com/rheiger/markWriter/issues/32) | Required alpha2: resolve DOT sanitizer/worker policy/native gates and complete product slice |
| [#33](https://github.com/rheiger/markWriter/issues/33) | Conditional alpha2 stretch after core: DBML schema semantics/footprint/native gates |

| [#35](https://github.com/rheiger/markWriter/issues/35) | Required alpha2: installed Tauri packages and verifiable experimental prerelease |

## Closed

Closures record qualified branch work, not release/distribution acceptance. The four closures in this increment are #21/#26/#28/#30; older closures remain unchanged.

| Issue | Original title |
| --- | --- |
| [#1](https://github.com/rheiger/markWriter/issues/1) | Enable Embedded Mermaid Diagram |
| [#2](https://github.com/rheiger/markWriter/issues/2) | Avoid Internet Dependency |
| [#11](https://github.com/rheiger/markWriter/issues/11) | 🚀 EPIC: Rust + Tauri + React Rewrite Planning |
| [#12](https://github.com/rheiger/markWriter/issues/12) | 🔬 Research Tauri framework capabilities and limitations |
| [#13](https://github.com/rheiger/markWriter/issues/13) | 🏗️ Design new application architecture |
| [#14](https://github.com/rheiger/markWriter/issues/14) | 🧪 Test Workflow Automation |
| [#15](https://github.com/rheiger/markWriter/issues/15) | 🔄 EPIC: Migrate from Toast UI Editor to CodeMirror 6 |
| [#16](https://github.com/rheiger/markWriter/issues/16) | 🔧 CodeMirror 6 Migration: Replace Toast UI Editor |
| [#17](https://github.com/rheiger/markWriter/issues/17) | 🔥 Fix Critical Toast UI Implementation Issues |
| [#20](https://github.com/rheiger/markWriter/issues/20) | Collapsible rendering of embedded images and diagrams on the raw text view |
| [#21](https://github.com/rheiger/markWriter/issues/21) | Long lines wrap in raw text view |
| [#23](https://github.com/rheiger/markWriter/issues/23) | Support for underline style |
| [#24](https://github.com/rheiger/markWriter/issues/24) | Linespacing in preview and WYSIWYG too big |
| [#25](https://github.com/rheiger/markWriter/issues/25) | Startup and load behavior |
| [#26](https://github.com/rheiger/markWriter/issues/26) | Visualize current cursor's position formatting on the respective toolbar control elements |
| [#27](https://github.com/rheiger/markWriter/issues/27) | Improved table management |
| [#28](https://github.com/rheiger/markWriter/issues/28) | Test results: Mermaid + Underline + Toolbar + Startup (umbrella) |
| [#30](https://github.com/rheiger/markWriter/issues/30) | Synchronize Markdown and Preview scrolling, cursor and selections |

Source maps/search/selection/scroll remain view state; canonical Markdown, captured document/revision I/O, recovery/history and independent-font contracts apply to future work. Each notation format needs its own native/offline/safety/persistence/export qualification. Alpha1 and earlier plans/prompts are completed scope records; the alpha2 plan is prospective.
