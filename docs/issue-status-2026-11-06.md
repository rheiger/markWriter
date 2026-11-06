# GitHub issue status — 6 November 2026

**18 open / 21 closed.** Alpha2 remains released from9bfd2c1 via PR#36; [acceptance](offline-dot-alpha2-acceptance.md) retains its dated release evidence. Follow-up review closes #18 against its original inline UML request, already met by shipped Mermaid sequence/state diagrams and export. PlantUML#31 remains a separate open format. New#38–42 retain expanded scope and original requests. Alpha3 core #38/#40/#39 is now implemented in [PR #43](https://github.com/rheiger/markWriter/pull/43); [Final candidate acceptance](highlighting-theme-alpha3.md) is complete for application source f54b444. #38/#40 remain open for integration; #39 also retains broader OS icon-cache/upgrade visual observations. Original issue requests/history are retained on GitHub.

## Current candidate — 2.1.0-alpha3

**Qualified implemented candidate, unmerged/unreleased.** Application metadata is2.1.0-alpha3. [Acceptance and limits](highlighting-theme-alpha3.md) records completed tests, native/installed-package checks and explicit limits. Focus is technical-document readability and consistent native presentation:

1. **#38 theme consistency:** fix the reported dark toolbar and qualify Light/Dark/System controls without changing document state.
2. **#40 code-block highlighting:** deliver the full requested language set in both editors, explicit aliases, bounded unlabeled-code detection, a synchronized persisted View/toolbar toggle, and readable Preview/export colors.
3. **#39 native icon/package polish:** review/reuse a suitable master, produce the actual native icon assets and verify installed launchers. Carry valid macOS ad-hoc bundle sealing/strict integrity verification as release hygiene; this remains separate from Developer ID/notarization.

**Later:** #41 requires actual paginated PDF-file feasibility across the supported native targets. A bounded spike is optional after the core qualifies; full PDF is not a promised trivial stretch. **Modeling follows separately:** qualify DBML#33, then SQL DDL import#42. Choose the first SQL dialect with a representative fixture before implementation.

Keep canonical Markdown, dirty state/history, captured-document I/O, recovery/discard, folds/navigation/search and independent source/rendered fonts intact. New controls/grammars/assets must work offline in ordinary installed packages. Existing releases/tags remain immutable.

## Open

| Issue | Remaining disposition |
| --- | --- |
| [#3](https://github.com/rheiger/markWriter/issues/3) | Rewrite umbrella: windows/plugins/broad preferences, profiling and trusted distribution remain |
| [#4](https://github.com/rheiger/markWriter/issues/4) | Ubuntu 26.04x64 DEB/real OS dialogs qualified; wider distro/architecture/desktop scope remains |
| [#5](https://github.com/rheiger/markWriter/issues/5) | draw.io backlog |
| [#6](https://github.com/rheiger/markWriter/issues/6) | Plugin architecture backlog |
| [#7](https://github.com/rheiger/markWriter/issues/7) | Standalone JSON/XML backlog |
| [#8](https://github.com/rheiger/markWriter/issues/8) | Single-window tabs delivered; independent windows deferred |
| [#9](https://github.com/rheiger/markWriter/issues/9) | Settings/recovery delivered; broader preferences/import/export/shortcuts deferred |
| [#10](https://github.com/rheiger/markWriter/issues/10) | Find/Replace and current controls delivered; remaining window/help/menu scope open |
| [#19](https://github.com/rheiger/markWriter/issues/19) | Graphical designers separate from textual notation |
| [#22](https://github.com/rheiger/markWriter/issues/22) | Per-selection font/color formatting deferred; display fonts independent |
| [#29](https://github.com/rheiger/markWriter/issues/29) | Developer console-log tool backlog |
| [#31](https://github.com/rheiger/markWriter/issues/31) | PlantUML-specific runtime remains deferred; separate from completed generic UML#18 |
| [#33](https://github.com/rheiger/markWriter/issues/33) | DBML semantics/layout/editor/export qualification; prerequisite for SQL DDL import#42 |
| [#38](https://github.com/rheiger/markWriter/issues/38) | Alpha3 candidate in PR#43: consistent Light/Dark/System toolbar and controls |
| [#39](https://github.com/rheiger/markWriter/issues/39) | Alpha3 candidate in PR#43: recognizable native app icon, package wiring and resource-integrity checks |
| [#40](https://github.com/rheiger/markWriter/issues/40) | Alpha3 candidate in PR#43: both-editor code highlighting, explicit languages/detection, synchronized toggle |
| [#41](https://github.com/rheiger/markWriter/issues/41) | PDF-file/backend and pagination spike first; full native PDF export recommended after alpha3 core |
| [#42](https://github.com/rheiger/markWriter/issues/42) | SQL DDL→editable DBML import; blocked by#33, declared dialect/representative fixture still needed |

## Closed

#18 closes the original inline UML requirement; it does not claim PlantUML or every UML notation/authoring capability. #32/#35 include alpha2 release acceptance. Older closures retain their original qualified implementation scope.

| Issue | Title |
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
| [#18](https://github.com/rheiger/markWriter/issues/18) | Add support for UML diagrams |
| [#20](https://github.com/rheiger/markWriter/issues/20) | Collapsible rendering of embedded images and diagrams on the raw text view |
| [#21](https://github.com/rheiger/markWriter/issues/21) | Long lines wrap in raw text view |
| [#23](https://github.com/rheiger/markWriter/issues/23) | Support for underline style |
| [#24](https://github.com/rheiger/markWriter/issues/24) | Linespacing in preview and WYSIWYG too big |
| [#25](https://github.com/rheiger/markWriter/issues/25) | Startup and load behavior |
| [#26](https://github.com/rheiger/markWriter/issues/26) | Visualize current cursor's position formatting on the respective toolbar control elements |
| [#27](https://github.com/rheiger/markWriter/issues/27) | Improved table management |
| [#28](https://github.com/rheiger/markWriter/issues/28) | Test results: Mermaid + Underline + Toolbar + Startup (umbrella) |
| [#30](https://github.com/rheiger/markWriter/issues/30) | Synchronize Markdown and Preview scrolling, cursor and selections |
| [#32](https://github.com/rheiger/markWriter/issues/32) | Render embedded Graphviz/DOT notation offline |
| [#35](https://github.com/rheiger/markWriter/issues/35) | Package and publish verifiable Tauri prereleases |

Alpha1/productivity/alpha2 plans are completed scope records. Future notation/import/export paths each need independent semantic/offline/native/safety/persistence/export qualification.
