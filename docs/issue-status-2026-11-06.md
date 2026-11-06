> **Current implementation qualification:** Source `2895d1c` / `2.1.0-alpha1` passed [CI42145312950](https://github.com/rheiger/markWriter/actions/runs/42145312950),93 frontend tests and both22-case native artifacts. Required core is complete; issue reconciliation/closure is in progress. Actual notation spikes are independently deferred; see [acceptance](editing-navigation-2.1.0-alpha1.md) and [spike report](notation-offline-spike-2026-11-06.md). The snapshot below preceded this implementation.

# MarkWriter issue status — 6 November 2026

GitHub reconciliation snapshot: **19 open / 14 closed**. Statuses were read back after creating #30–#33. GitHub is authoritative for subsequent changes; this file is the planning decision surface, not a live tracker.

Target **2.1.0-alpha1** is unreleased. The version bump and [next-session plan](next-increment-2.1.0-alpha1-plan.md) prepare future work; core/stretch below are **planned, not implemented**. [Launch prompt](next-increment-2.1.0-alpha1-prompt.md).

## Core for 2.1.0-alpha1

| Issue | Current disposition |
| --- | --- |
| [#10](https://github.com/rheiger/markWriter/issues/10) | Find/Replace slice; fullscreen/window and other menu scope stays open |
| [#21](https://github.com/rheiger/markWriter/issues/21) | Soft-wrap continuation guide/indent/marker; default wrapping already works |
| [#26](https://github.com/rheiger/markWriter/issues/26) | Adaptive 5×5 table picker; existing indicators and contextual management retained |
| [#28](https://github.com/rheiger/markWriter/issues/28) | Remaining editing and acceptance; developer logs excluded |
| [#30](https://github.com/rheiger/markWriter/issues/30) | Content-aware bidirectional scroll, caret and selection correspondence |

## Stretch after core acceptance

| Issue | Current disposition |
| --- | --- |
| [#31](https://github.com/rheiger/markWriter/issues/31) | PlantUML notation; concrete slice of UML umbrella #18 |
| [#32](https://github.com/rheiger/markWriter/issues/32) | Graphviz/DOT notation; recommended first runtime/layout spike |
| [#33](https://github.com/rheiger/markWriter/issues/33) | DBML schema visualization; actual parser plus a separate layout adapter |

## Backlog / other remaining scope

| Issue | Current disposition |
| --- | --- |
| [#3](https://github.com/rheiger/markWriter/issues/3) | Rewrite epic: advanced features, measured performance and release work remain |
| [#4](https://github.com/rheiger/markWriter/issues/4) | Linux installation/distribution matrix and OS-dialog acceptance |
| [#5](https://github.com/rheiger/markWriter/issues/5) | draw.io: explicitly backlog; prior offline boot/load spike is reference only |
| [#6](https://github.com/rheiger/markWriter/issues/6) | Third-party plugin architecture |
| [#7](https://github.com/rheiger/markWriter/issues/7) | Standalone JSON/XML editing modes |
| [#8](https://github.com/rheiger/markWriter/issues/8) | Independent windows, cross-window ownership and remaining tab/window UI |
| [#9](https://github.com/rheiger/markWriter/issues/9) | Broader preferences/import-export/shortcuts/original-file autosave; tabs/Settings/recovery slice delivered |
| [#18](https://github.com/rheiger/markWriter/issues/18) | UML umbrella; #31 is the current concrete notation stretch |
| [#19](https://github.com/rheiger/markWriter/issues/19) | Graphical diagram editors; textual notation visualization does not complete this |
| [#22](https://github.com/rheiger/markWriter/issues/22) | Per-selection font/color formatting; display font preferences are not equivalent |
| [#29](https://github.com/rheiger/markWriter/issues/29) | Developer console-log tool: explicitly backlog and not a #28 gate |

## Closed

Implementation closures record qualified feature-branch work, not a merge/release. Original issue requirements and historical reports were preserved. New closures from this reconciliation are #1, #17, #20, #23, #24, #25 and #27. #25 records fresh-start defaults plus deliberate session/duplicate-tab exceptions.

| Issue | Scope |
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
| [#23](https://github.com/rheiger/markWriter/issues/23) | Support for underline style |
| [#24](https://github.com/rheiger/markWriter/issues/24) | Linespacing in preview and WYSIWYG too big |
| [#25](https://github.com/rheiger/markWriter/issues/25) | Startup and load behavior |
| [#27](https://github.com/rheiger/markWriter/issues/27) | Improved table management |

## Evidence and closure rules

Last feature-qualified source: `6c6eb56`, unreleased `2.0.0-alpha.2`, [CI 42132949169](https://github.com/rheiger/markWriter/actions/runs/42132949169). See [productivity acceptance](productivity-increment-2026-11-06.md) and [native limits](native-acceptance.md). The preparation branch adds no new editing/navigation/notation behavior.

After implementation, update each issue with exact source/CI/native evidence. Close #21/#26/#30 only on full acceptance; reconcile all remaining editing items before closing #28; leave #10 open for its deferred menu scope. Each notation issue requires its own offline/native/persistence/export proof. Do not treat a parser, a browser spike, Mermaid substitution or version metadata as implementation acceptance. Keep #5/#29 backlog.
