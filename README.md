# MarkWriter

MarkWriter is a cross-platform Markdown editor built with Rust, Tauri 2, React and TypeScript. Edit in CodeMirror 6 Markdown or Tiptap WYSIWYG, with a read-only Preview and self-contained HTML export.

## Download

[MarkWriter 2.7.2](https://github.com/rheiger/markWriter/releases/tag/v2.7.2) is the current release. It adds TOML highlighting and Finder previews, and a preview of offline PostgreSQL and SQLite DDL import. Download the Apple silicon macOS DMG, Windows x64 installer or Ubuntu 26.04 x64 DEB; optional desktop preview add-ons are separate. Verify downloads against SHA256SUMS. The Mac app and extension have ad hoc seals; Windows packages are unsigned. See [installation and rollback](docs/install-2.7.2.md) and [release notes](docs/releases/2.7.2.md).

## Features

- Markdown and WYSIWYG editing, live Preview, tabs, per-tab Undo/Redo, Find/Replace and tables.
- Native file operations and HTML export, local session recovery, themes and independent editor fonts.
- Offline syntax highlighting, Mermaid, [DOT](docs/dot-security.md), [DBML](docs/dbml-2.7.md), explicit math fences and [SQL DDL import preview](docs/sql-import-preview.md).
- Searchable offline **Help → User Guide**.

Markdown is canonical. Navigation and view changes preserve its bytes; actual WYSIWYG edits may normalize syntax. Rendering is bounded and falls back to source when limits are exceeded. See [editing conventions](docs/supported-markdown.md) and [regex search](docs/regex-search.md). Independent windows, plugins, draw.io and PDF export are not implemented.

## Build and develop

Use Node.js 24 or newer, npm 9 or newer, Rust 1.90 or newer and the platform’s Tauri prerequisites. See [CI](.github/workflows/v2-ci.yml) for platform dependencies.

```sh
npm install
npm --prefix frontend ci
npm run frontend:test
npm run frontend:lint
npm run frontend:build
npm run tauri:test
```

For native development, run `npm run frontend:dev` and, in another terminal, `cd frontend && npm exec tauri dev`. For a native bundle, build the frontend first, then run `cd frontend && npm exec tauri build`. A browser-only server does not provide native file dialogs, storage or menus.

## Project information

[Changelog](CHANGELOG.md) · [Release notes](docs/releases/) · [Document ownership](docs/document-ownership.md) · [Preview correspondence](docs/preview-correspondence.md) · [Project guidance](AGENTS.md)

Historical implementation and qualification documents are available in [Git history before cleanup](https://github.com/rheiger/markWriter/tree/3dcf648b412eaf9f73bef82e846f83ced0008156). Bundled dependency licenses and attribution are provided in the app and release notices. MarkWriter uses the [MIT License](LICENSE).
