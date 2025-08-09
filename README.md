# MarkWrite

![Build Desktop Apps](https://github.com/rheiger/markWriter/actions/workflows/build.yml/badge.svg)

A minimal, cross-platform Markdown editor built with Python and Qt (PySide6) using Toast UI Editor in a Qt WebEngine view.

- Version: `0.0.2 (build 000011)`
- Platforms: macOS (working), Windows/Linux planned

## Features
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

Note: v0.0.1 is superseded by v0.0.2. Use the latest release.

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
- The editor UI is loaded from a CDN. If you prefer offline usage, vendor the Toast UI JS/CSS locally and adjust `HTML_TEMPLATE` in `markwrite.py`.
- For distributing to other Macs, you’ll likely want to code sign and notarize the `.app`.

### CI
This repo uses GitHub Actions to build macOS, Windows, and Linux bundles on push/tag and uploads artifacts. Tagging a version `v*` publishes release assets automatically.

## Roadmap
- Add support for Windows 11
- Add support for Linux
- Add support for multiple windows/tabs to have more than one document open at the same time
 - Add regular menus: Edit, View, Window, ...
 - Add Settings: default fonts/sizes for Markdown and WYSIWYG panes, theme (dark/light/system), ...

## License
TBD

