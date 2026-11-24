# MarkWriter

MarkWriter is a cross-platform Markdown editor built with Rust, Tauri 2, React and TypeScript. Edit in CodeMirror 6 Markdown or Tiptap WYSIWYG, with a read-only Preview and self-contained HTML export.

## Download

[MarkWriter 2.12.2](https://github.com/rheiger/markWriter/releases/tag/v2.12.2) adds highlighting for large TOML fences in both editors and clearer SQL import recovery. Download the Apple silicon macOS DMG, Windows x64 installer or Ubuntu 26.04 x64 DEB and verify `SHA256SUMS`. The macOS app and Quick Look extension use ad hoc integrity seals. Windows packages are unsigned. See [installation, removal and rollback](docs/install-2.12.2.md) and [release notes](docs/releases/2.12.2.md).

## Features

- Markdown and WYSIWYG editing, live Preview, tabs, per-tab Undo/Redo, Find/Replace and tables.
- Native file operations and HTML export, local session recovery, themes and independent editor fonts.
- Offline syntax highlighting, Mermaid, [DOT](docs/dot-security.md), [DBML](docs/dbml-2.7.md), explicit math fences and [SQL DDL import preview](docs/sql-import-preview.md).
- Searchable offline **Help → User Guide**.

Markdown is canonical. Navigation and view changes preserve its bytes; actual WYSIWYG edits may normalize syntax. Rendering is bounded and falls back to source when limits are exceeded. See [editing conventions](docs/supported-markdown.md) and [regex search](docs/regex-search.md). Independent windows, plugins, draw.io and PDF export are not implemented.

## Build and develop

Start with [development environment setup](docs/development-setup.md) for machine checks, minimal installation, locked dependencies and an isolated desktop profile. The same guide applies to human developers and AI agents.

Use Node.js 24 or newer, npm 9 or newer, Rust 1.90 or newer and the platform’s Tauri prerequisites. See [CI](.github/workflows/v2-ci.yml) for platform dependencies.

```sh
npm --prefix frontend ci
npm run frontend:test
npm run frontend:lint
npm run frontend:build
(cd src-tauri && cargo test --locked)
```

On Windows x64, run `pwsh -File tools/stage-windows-preview.ps1` from the repository root before native tests or bundles. This step uses CMake and Visual Studio C++ to stage the bundled Explorer handler.

For native development and a debug build without installation, follow the [isolated desktop launch and build instructions](docs/development-setup.md#5-launch-with-isolated-preferences-and-recovery). They use the pinned frontend Tauri CLI without a global CLI installation. A browser-only server does not provide native file dialogs, storage or menus.

## How we track work

MarkWriter uses [GitHub Issues](https://github.com/rheiger/markWriter/issues) as its public backlog. One repository keeps reports, implementation, and verification together. The legacy GitHub Project serves as a historical reference.

- Open or update an issue for a bug or feature. Include the affected version and platform, reproduction steps or expected behavior, and any remaining work. Use labels such as `bug`, `enhancement`, and `high priority` to make the backlog easier to scan. Use a milestone when work is committed to a release.
- Link the issue from the [pull request](https://github.com/rheiger/markWriter/pulls) and record what was tested. Use `Fixes #…` when the PR resolves the full issue. For partial work, link the PR and summarize what remains in the issue.
- Review [GitHub Actions](https://github.com/rheiger/markWriter/actions) before merging and record shipped changes in the release notes. CI and packaging use GitHub-hosted runners. Record installed-app or physical desktop checks separately when they are needed.

## Project information

[Changelog](CHANGELOG.md) · [Release notes](docs/releases/) · [Architecture](docs/architecture.md) · [Document ownership](docs/document-ownership.md) · [Preview correspondence](docs/preview-correspondence.md) · [Project guidance](AGENTS.md)

Historical implementation and qualification documents are available in [Git history before cleanup](https://github.com/rheiger/markWriter/tree/3dcf648b412eaf9f73bef82e846f83ced0008156). Bundled dependency licenses and attribution are provided in the app and release notices. MarkWriter uses the [MIT License](LICENSE).
