# Changelog

## 2.7.2 — Unreleased

- Highlight explicitly labeled TOML fences offline in Markdown, WYSIWYG, Preview and HTML export. On Apple silicon macOS, Finder Quick Look supports TOML fences and standalone `.toml` source. [#68](https://github.com/rheiger/markWriter/issues/68)

[Installation and rollback](docs/install-2.7.2.md)

## [2.7.1](https://github.com/rheiger/markWriter/releases/tag/v2.7.1) — 2026-11-08

- Keep Finder syntax highlighting on larger source files and longer JSON Lines previews. Finder uses a separate budget for explicitly labeled languages. [#49](https://github.com/rheiger/markWriter/issues/49)
- Register `.jsonl` for Finder Quick Look alongside `.ndjson`. [#49](https://github.com/rheiger/markWriter/issues/49)

## [2.7.0](https://github.com/rheiger/markWriter/releases/tag/v2.7.0) — 2026-11-08

- Render fenced DBML as offline entity-relationship diagrams in Preview, WYSIWYG and self-contained HTML export. The supported subset covers schema-qualified tables, keys, nullability, composite references and cardinality. Preserve the original fence and restore the exact document on Undo. [#33](https://github.com/rheiger/markWriter/issues/33) · [Supported syntax](docs/dbml-2.7.md)
- Render tables, emphasis, inline code and inert link labels in Finder Quick Look. Render the reported Mermaid flowchart and state diagram within the existing offline safety limits. [#48](https://github.com/rheiger/markWriter/issues/48)
- Highlight longer supported fences and standalone Bash, Python, Makefile and SQL in Finder. Highlight escaped XML source when the file falls outside the formatting subset. [#49](https://github.com/rheiger/markWriter/issues/49)
- Carry forward Markdown preview add-ons for Windows Explorer and GNOME Files and Markdown thumbnails for Dolphin on the tested Ubuntu baseline. [#63](https://github.com/rheiger/markWriter/issues/63) · [#64](https://github.com/rheiger/markWriter/issues/64)
- SQL DDL import, native PDF export and app-controlled update installation remain open. [#42](https://github.com/rheiger/markWriter/issues/42) · [#41](https://github.com/rheiger/markWriter/issues/41) · [#59](https://github.com/rheiger/markWriter/issues/59)

[PR #66](https://github.com/rheiger/markWriter/pull/66) · [Installation and rollback](docs/install-2.7.0.md)

## [2.6.3 preliminary](https://github.com/rheiger/markWriter/releases/tag/v2.6.3) — 2026-11-07

- Add optional Markdown previews in Windows File Explorer and GNOME Files with Sushi, and a Markdown thumbnail provider for KDE Dolphin. Retain Finder Quick Look on Apple silicon. [#48](https://github.com/rheiger/markWriter/issues/48) · [#63](https://github.com/rheiger/markWriter/issues/63) · [#64](https://github.com/rheiger/markWriter/issues/64)

## [2.6.2 preliminary](https://github.com/rheiger/markWriter/releases/tag/v2.6.2) — 2026-11-07

- Add Finder Quick Look for Markdown with fenced code colors and supported Mermaid and DOT, plus display formatting and highlighting for supported JSON, NDJSON, YAML and XML. Finder showed file information for `.jsonl` on the tested Mac. [#48](https://github.com/rheiger/markWriter/issues/48) · [#49](https://github.com/rheiger/markWriter/issues/49)
- Bring the 2.6 native integration to public packages. Move macOS menus to the screen menu bar, add bounded regular expressions with colored captures and replacement references, route macOS Markdown file opens, and add manual update discovery. [#55](https://github.com/rheiger/markWriter/issues/55) · [#56](https://github.com/rheiger/markWriter/issues/56) · [#48](https://github.com/rheiger/markWriter/issues/48) · [#59](https://github.com/rheiger/markWriter/issues/59)

## [2.5.1](https://github.com/rheiger/markWriter/releases/tag/v2.5.1) — 2026-11-07

- Fix highlighting for longer explicitly labeled Python and JSON fences and consolidate the README. [#44](https://github.com/rheiger/markWriter/issues/44) · [PR #53](https://github.com/rheiger/markWriter/pull/53)

## [2.5.0-alpha1](https://github.com/rheiger/markWriter/releases/tag/v2.5.0-alpha1) — 2026-11-06

- Preserve meaningful inline-code spaces, tabs, whitespace-only spans and backticks through rendered parsing/serialization, ordinary editing, clipboard parsing and HTML export. View-only canonical Markdown remains byte-identical; real rendered edits may normalize surrounding Markdown syntax. [#46](https://github.com/rheiger/markWriter/issues/46)
- Add explicit `math` fences with bounded offline KaTeX rendering, literal WYSIWYG source editing, document Undo/Redo, source folds/correspondence, recovery and static HTML export with embedded fonts and licenses. Inline dollars, numbering/references and arbitrary TeX packages remain deferred. [#50](https://github.com/rheiger/markWriter/issues/50)
- Add bundled searchable Help with editing conventions, actual shortcuts, recovery/font guidance and keyboard-accessible Light/Dark navigation. [#47](https://github.com/rheiger/markWriter/issues/47)
- Extend native and ordinary installed-package acceptance with technical-writing fixtures and strict worker/font/export checks. Released after exact merged/tag qualification; all 12 anonymous public assets match accepted bytes/IDs. See docs/technical-writing-2.5-release-acceptance.md.

## [2.1.0-alpha3](https://github.com/rheiger/markWriter/releases/tag/v2.1.0-alpha3) — 2026-11-06

- Restore CSS, Swift and Makefile highlighting, add Objective-C `m`, and prevent automatic replacements in fenced/inline code and blockquotes while retaining intentional Unicode and composition. Corrected candidate acceptance: docs/alpha3-feedback-acceptance.md; broader detection/languages deferred to #44, existing inline-code whitespace serialization defect tracked in #46.
- Add shared offline ordinary-code highlighting across source, WYSIWYG, Preview and self-contained HTML export, with the full requested language set, conservative unlabeled detection and a saved View/toolbar toggle. [#40](https://github.com/rheiger/markWriter/issues/40)
- Add an illustrated paper-and-brass-nib icon and expanded About with product/open-source credits, preserving the exact Richie attribution. [#39](https://github.com/rheiger/markWriter/issues/39)
- Make toolbar controls follow theme tokens; add synchronized Auto/Light/Dark View choices and live system appearance updates. [#38](https://github.com/rheiger/markWriter/issues/38)
- Add a maintainable native icon master and packaged macOS/Windows/Linux assets; require a valid whole-bundle macOS ad-hoc seal. This does not establish trusted signing or notarization.
- Fix Preview correspondence through token spans, menu stacking/Escape and late completion dismissal, viewport-clamped table picker growth, source synchronization entering rendered Undo history, stale async Cut/Paste ownership, and bounded Windows atomic preference replacement recovery with visible terminal errors. [#45](https://github.com/rheiger/markWriter/issues/45)
- Released source `b40d45bd586c0c127bb696748101ded4276fce52` via PR #43 after exact merged/tagged-source three-platform checks. All 12 public downloads match the same accepted draft IDs/bytes; historical releases/assets/tags/latest remain unchanged. Current evidence: docs/alpha3-release-acceptance.md and attached QUALIFICATION.json. #38/#39/#40/#45 closed; broader detection #44, whitespace serializer #46, Help/Quick View/math and PDF/DBML/SQL DDL import remain deferred.

## [2.1.0-alpha2](https://github.com/rheiger/markWriter/releases/tag/v2.1.0-alpha2) — 2026-11-06

- Add bounded offline DOT/Graphviz rendering to Preview and opaque WYSIWYG atoms, canonical fence preservation, folds/source search/block correspondence and sanitized static SVG export. [#32](https://github.com/rheiger/markWriter/issues/32)
- Add a production Tauri DMG/NSIS/DEB build/install/ordinary-dialog acceptance pipeline, isolated optional profile directory, complete bundled notices and exact-source platform/checksum manifests. Isolate the historical Python publisher; only the Tauri workflow may draft v2 prereleases. [#35](https://github.com/rheiger/markWriter/issues/35)
- Preserve the exact Richie About attribution and synchronize version metadata to2.1.0-alpha2. DBML/PlantUML/draw.io/logs and other deferred scope remain deferred.
- Released source 9bfd2c1 via PR #36 after exact-source three-platform quality/package acceptance and final-byte verification. All 12 public assets match verified bytes; old releases/tags/latest remain unchanged. Windows is unsigned; macOS is linker-ad-hoc/unsealed with failed strict bundle verification, qualified only for the recorded normal launch path under the unsigned experimental allowance. See docs/offline-dot-alpha2-acceptance.md.

## Unreleased preparation — 2026-11-06

- Add About credit: "This program was completely built using vibe coding under the direction of 'Richie'." Version remains `2.1.0-alpha1`; verified in the ordinary rebuilt macOS app with existing frontend/static/build checks passing.
- Record accepted alpha1 merge (PR #34 / `7e29c6f`) and plan alpha2: safe offline DOT #32 plus Tauri prerelease packaging #35; DBML #33 conditional stretch. The next-session prompt includes issue maintenance and qualified commit/push/merge/prerelease authority. No alpha2 feature, tag or release is claimed by preparation.

## Unreleased 2.1.0-alpha1 — 2026-11-06 editing/navigation

- Add document-owned Find/Replace in both editors with scoped matches, keyboard/menu UI and one-step Replace All.
- Add persisted view-only wrap cues and adaptive 5×5 table picker with pointer/keyboard/numeric sizing to 40×40.
- Add parser-owned UTF-16 text/block maps and content-aware bidirectional scroll/caret/selection correspondence, with native Preview text copy and explicit atom fallbacks.
- Fix multiline Code/safe fences/Body, source lists and active formatting state; explicit format caret placement, literal WYSIWYG typing/paste escaping, fresh-vs-restored navigation and Settings focus scrolling.
- Preserve canonical bytes, per-tab histories, captured I/O, recovery and independent fonts; remove inert CB and decorative percentage marker. Add Markdown conventions and complete historical editing disposition.
- See docs/editing-navigation-2.1.0-alpha1.md for exact source/CI/native evidence and limits. Actual offline DOT/DBML/PlantUML spikes were independently deferred at safety/runtime/packaging gates; see docs/notation-offline-spike-2026-11-06.md. #5/#29 remain backlog. No merge/tag/release.

### Historical metadata preparation

- Synchronize root/frontend, Cargo and Tauri version metadata to the exact requested `2.1.0-alpha1`; no new editing/navigation/notation feature is claimed by this bump.
- Add a next-session implementation plan/prompt and reconciled issue index. Core scope: Find/Replace #10, wrapping #21, adaptive picker #26, remaining editing #28, synchronized scroll/caret/selection #30.
- Create notation stretch issues #31 PlantUML, #32 Graphviz/DOT, #33 DBML; keep #29 developer logs and #5 draw.io on backlog.
- Reconcile GitHub implementation status while preserving original requirements. The last feature-qualified source remains `6c6eb56` / `2.0.0-alpha.2`; see the productivity acceptance report. No merge/tag/release.

## Unreleased 2.0.0-alpha.2 — 2026-11-06 productivity increment

- Add single-window document tabs with retained editor histories, safe captured-document saves, Save All, reorder/navigation and all-tab Close/Quit protection.
- Add validated persistent Settings and atomic local session/draft recovery with detached copies for disk conflicts.
- Add accessible WYSIWYG table row/column management, boundary rules, selection and undo.
- Fold Mermaid and long embedded-image source without replacing Markdown; preserve full copy/search and per-tab choices.
- Add a Mermaid ERD starter and self-contained ERD HTML export; preserve embedded images and clean table view changes.
- See docs/productivity-increment-2026-11-06.md for evidence, final qualification and deferred scope. No release/merge/tag.

## Unreleased — 2026-11-05 stabilization

- Move editor mode switching from floating document buttons into a toolbar switch and View-menu choices.
- Replace the static “66” font-size placeholder with a display text-size selector synchronized with zoom controls.
- Show the application version in an accessible About dialog with Close/Escape and focus restoration.

- Preserve original Markdown on unedited mode switches; retain Mermaid, table formatting, task states and images in covered WYSIWYG workflows.
- Isolate editor undo histories by document and cancel stale diagram renders.
- Use shared Markdown parsing and inline Mermaid SVG for HTML export.
- Preserve newer edits during save completion; protect unsaved content and replace files after complete temporary writes.
- Restore real-editor and production-command regression coverage; version dependency lockfiles.
- See docs/stabilization-2026-11-05.md for acceptance boundaries. Still alpha; no release qualification.

## Historical MarkWrite entries

These entries document earlier project changes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- WYSIWYG Mermaid support via custom Tiptap Node/NodeView (reuses `MermaidRenderer`)
- Underline support (extended Markdown): `++text++` in Markdown, `<u>text</u>` in preview
- WYSIWYG editor based on Tiptap
- Ratio-based scroll sync between Markdown and Preview
- Draggable splitter with clamped bounds; 50/50 initial layout
 - Table picker UX: 12×12 grid with area highlight; outside-click/Escape to close

### Changed
- Markdown editor wraps long lines (no horizontal scroll)
- Toolbar wired to WYSIWYG for bold/italic/headings/lists/HR/blockquote/code block
 - Mode switching stabilized: WYSIWYG ⇄ Markdown sync with caret preservation; CodeMirror kept alive across switches; sync occurs on tab switch only

### Fixed
- Dev crashes from invalid forwardRef generics and regex literal parsing
 - Caret jump on edits/switches (stabilized)

### Known Issues
- Mermaid Preview regression: after second switch back to Markdown, diagrams disappear in raw/preview despite no edits (see Issue #28)
- Duplicate Tiptap extension warnings (link/underline) can still surface in some sessions
- WYSIWYG tables: round-trip to Markdown (GFM) requires verification and polish
- Scroll-sync highlight in Preview not yet implemented

## [2.0.0-alpha.1 WYSIWYG stabilization](https://github.com/rheiger/markWriter/releases/tag/v2.0.0-alpha.1-wysiwyg-stabilized) — published 2025-08-29

### Added
- Complete React + TypeScript frontend rewrite
- CodeMirror 6 integration for Markdown editing
- Zustand state management with Tauri integration
- Comprehensive toolbar with file operations and formatting tools
- Tab system for Markdown and WYSIWYG modes
- Theme system (Light/Dark/System) with CSS variables
- Mermaid diagram support in Markdown preview

### Changed
- Migrated from Python+Qt to Rust+Tauri+React architecture
- Replaced Toast UI Editor with CodeMirror 6
- Updated build system to use Vite and modern tooling
- Implemented native desktop app with web UI flexibility

### Fixed
- Resolved blank window issue with proper component initialization
- Fixed variable scope issues in EditorView component
- Corrected editor reference management in useEffect cleanup
- Added timeout delay for proper DOM initialization

### Known Issues
- **CRITICAL**: File operations (Open, Save, Save As) completely broken due to CSP and dialog permissions
- **CRITICAL**: WYSIWYG mode shows blank content and cannot accept text input
- **HIGH**: Content synchronization broken between Markdown and WYSIWYG modes
- **MEDIUM**: Persistent console errors related to Tauri security configuration

### Technical Notes
- UI now fully visible and functional
- Core editing functionality working in Markdown mode
- Sample content with Mermaid diagrams loads correctly
- Application architecture solid but security configuration needs fixing

## [0.2.4](https://github.com/rheiger/markWriter/releases/tag/v0.2.4) — published 2025-08-20

### Fixed
- Fixed PyInstaller spec files by adding required imports for macOS builds
- Resolved CI failure on macOS due to missing `APP` class import
- Added proper imports for `Analysis`, `PYZ`, `EXE`, and `APP` classes in PyInstaller specs

### Changed
- Updated all documentation files to reflect current offline functionality
- Synchronized version numbers across all documentation files
- Cleaned up outdated references to CDN dependencies

### Removed
- Removed unused Windows installer/uninstaller batch files
- Removed unused test files and legacy editor files
- Cleaned up DebugFeedback directory

## [0.2.3] - 2024-12-19

### Added
- Full offline functionality with locally bundled assets
- Windows support with NSIS installer
- CI/CD pipeline for automated builds and releases
- Cross-platform PyInstaller configurations

### Changed
- Migrated from CDN dependencies to local asset bundling
- Updated build process to include all required assets
- Enhanced documentation and developer guides

## [0.2.1](https://github.com/rheiger/markWriter/releases/tag/v0.2.1) — published 2025-08-19

### Added
- Windows support
- NSIS installer for Windows distribution

## [0.1.3] - 2024-12-19

### Added
- Offline functionality implementation
- Local asset bundling for Toast UI Editor and Mermaid.js

## [0.1.2](https://github.com/rheiger/markWriter/releases/tag/v0.1.2) — published 2025-08-12

### Changed
- Initial offline functionality planning

## [0.1.1](https://github.com/rheiger/markWriter/releases/tag/v0.1.1) — 2025-08-12

- The release points to the [changes since 0.1.0](https://github.com/rheiger/markWriter/compare/v0.1.0...v0.1.1).

## [0.1.0](https://github.com/rheiger/markWriter/releases/tag/v0.1.0) — 2025-08-12

- Fix macOS Open With, align version metadata, improve CI and add the developer handbook.

## [0.0.2](https://github.com/rheiger/markWriter/releases/tag/v0.0.2) — 2025-08-09

- Add zoom controls, a full-width editor, file toolbar controls and About credits.

## [0.0.1](https://github.com/rheiger/markWriter/releases/tag/v0.0.1) — 2025-08-09

- Ship the first public macOS app with Markdown editing, Open, Save and HTML export.

## [0.0.8] - 2024-12-19

### Added
- Basic Markdown editor functionality
- WYSIWYG editing with Toast UI Editor
- File open/save capabilities
- HTML export functionality

---

## Version History Notes

- **v0.2.4**: Focus on CI fixes and documentation cleanup
- **v0.2.3**: Major milestone with full offline functionality and Windows support
- **v0.2.1**: Windows platform support addition
- **v0.1.3**: Offline functionality implementation
- **v0.0.8**: Initial stable release with core features

For detailed information about each release, see the [GitHub releases page](https://github.com/rheiger/markWriter/releases).
