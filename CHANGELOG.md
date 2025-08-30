# Changelog

All notable changes to MarkWrite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- WYSIWYG editor based on Tiptap
- Ratio-based scroll sync between Markdown and Preview
- Draggable splitter with clamped bounds; 50/50 initial layout

### Changed
- Markdown editor wraps long lines (no horizontal scroll)
- Toolbar wired to WYSIWYG for bold/italic/headings/lists/HR/blockquote/code block

### Fixed
- Dev crashes from invalid forwardRef generics and regex literal parsing

### Known Issues
- WYSIWYG: Mermaid code fences do not render as diagrams yet
- WYSIWYG: Tables not rendering consistently (raw HTML blocks)
- Scroll sync needs anchor-based refinement and selection highlight in Preview
- Caret/selection preservation between modes needs improvement

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
