# MarkWrite

[![Build Desktop Apps](https://github.com/rheiger/markWriter/actions/workflows/build.yml/badge.svg?branch=main&event=push)](https://github.com/rheiger/markWriter/actions/workflows/build.yml)
[![Latest release](https://img.shields.io/github/v/release/rheiger/markWriter?logo=github&label=latest%20release)](https://github.com/rheiger/markWriter/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/rheiger/markWriter/total?logo=github)](https://github.com/rheiger/markWriter/releases)

A minimal, cross-platform Markdown editor built with Python and Qt (PySide6) using Toast UI Editor in a Qt WebEngine view.

- Version: `0.2.4 (build 000033)`
- Platforms: macOS ✅, Windows ✅, Linux planned
- **Full offline functionality** - no internet connection required

## Features ([About](./ABOUT.md))
- WYSIWYG Markdown editor (Toast UI Editor)
- Open/Save `.md` files
- Export to HTML
- Basic “dirty” tracking and prompts on exit

## Requirements
- Python 3.11+
- PyInstaller (for building) and PySide6

## Getting Started

See the How-To guide for end users: [How-To: Install and Use MarkWrite on macOS](./How-To.md)

Latest prebuilt app: [Releases](https://github.com/rheiger/markWriter/releases)

Note: Use the latest release for the most up-to-date features and offline functionality.

### Run from source (macOS)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install PySide6
python markwrite.py
```

### Build a macOS `.app`
```bash
source .venv/bin/activate
pip install -U pyinstaller PySide6
pyinstaller -y MarkWrite.spec
open dist/MarkWrite.app
```

Notes:
- **Offline-first design** - All editor assets are bundled locally, no CDN dependencies
- For distributing to other Macs, you’ll likely want to code sign and notarize the `.app`.
- To appear in “Open With…” for `.md` files, the app’s Info.plist declares Markdown document types. Rebuild the app (`pyinstaller -y MarkWrite.spec`) and move `MarkWrite.app` into `/Applications`.

### CI
This repo uses GitHub Actions to build macOS, Windows, and Linux bundles on push/tag and uploads artifacts. Tagging a version `v*` publishes release assets automatically.

### Developer Handbook
For contributor setup, code style, release process, and CI details, see [`docs/DeveloperHandbook.md`](./docs/DeveloperHandbook.md).

### Changelog
For a detailed history of changes and new features, see [`CHANGELOG.md`](./CHANGELOG.md).

### Signing & Notarization
For how to sign and notarize the macOS app locally or in CI (without exposing secrets in the repo), see: [`docs/Signing-Notarization.md`](./docs/Signing-Notarization.md)

## Roadmap
- ✅ Windows support (completed in v0.2.1)
- Complete rewrite using `rust` -> `Tauri` -> `react` for improved performance, optimized ressource usage, stability and mainly UX
- Add regular menus: ✅ About, ✅ File, Edit, View, Window, ..., Help
- Add support to render embedded `mermaid` diagrams
- Add support to render embedded `draw.io` diagrams
- Add support for plugins
- Add support for quick-edit/show other formats like `json` and `xml`, with focus on userfriendly display 
- Add support for Linux
- Add support for multiple windows and tabs in windows to have more than one document open at the same time
- Add Settings: default fonts/sizes for Markdown and WYSIWYG panes, theme (dark/light/system), ...

## License & Dependencies

**MarkWrite**: MIT License — see [`LICENSE`](./LICENSE)

**Bundled Libraries**:
- **Toast UI Editor**: MIT License - [NHN Cloud FE Development Lab](https://github.com/nhn/tui.editor)
- **Mermaid.js**: MIT License - [Mermaid Contributors](https://github.com/mermaid-js/mermaid)
- **DOMPurify**: Apache 2.0 + Mozilla Public License 2.0 - [Cure53](https://github.com/cure53/DOMPurify)

All bundled libraries are compatible with MIT licensing and are properly attributed.
