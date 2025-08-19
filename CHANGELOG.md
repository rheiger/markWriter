# Changelog

All notable changes to MarkWrite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CHANGELOG.md file for better version tracking

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
