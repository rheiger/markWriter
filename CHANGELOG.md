## Unreleased 2.1.0-alpha1 — 2026-11-06 preparation

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

# Changelog

All notable changes to MarkWrite will be documented in this file.

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

## [2.0.0-alpha.1] - 2025-08-27

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

## [0.2.4] - 2024-12-19

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

## [0.2.1] - 2024-12-19

### Added
- Windows support
- NSIS installer for Windows distribution

## [0.1.3] - 2024-12-19

### Added
- Offline functionality implementation
- Local asset bundling for Toast UI Editor and Mermaid.js

## [0.1.2] - 2024-12-19

### Changed
- Initial offline functionality planning

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
