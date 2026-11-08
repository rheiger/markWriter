# MarkWriter

MarkWriter is a cross-platform Markdown editor built with Rust, Tauri 2, React and TypeScript. Edit in CodeMirror 6 Markdown mode or Tiptap WYSIWYG mode, with a read-only Preview and self-contained HTML export.

## Current release

[MarkWriter 2.7.0](https://github.com/rheiger/markWriter/releases/tag/v2.7.0) adds offline DBML diagrams and improves Finder Quick Look with Markdown tables, emphasis, inline code, inert link labels, and highlighting for supported standalone code files. See the [changelog](CHANGELOG.md) and [installation and rollback guide](docs/install-2.7.0.md).

Packages are available for Apple silicon macOS, Windows x64 and Ubuntu 26.04 x64. Optional add-ons provide Markdown previews in Windows File Explorer and GNOME Files with Sushi, and Markdown thumbnails in KDE Dolphin. The Mac app and Finder extension use ad hoc seals. Windows packages are unsigned.

## Features

- Markdown and WYSIWYG editing, live Preview, document tabs and per-tab Undo/Redo.
- Native Open, Save, Save As and HTML export, plus local session recovery.
- Find/Replace in both editors, contextual tables and embedded-source folding.
- Auto/Light/Dark themes and independent source/rendered font preferences.
- Bundled offline syntax highlighting, Mermaid and DOT/Graphviz diagrams, and explicit `math` fences. Includes [bounded DBML schema diagrams](docs/dbml-2.7.md).
- Searchable offline documentation through **Help → User Guide**.

Markdown is the canonical document source. Navigation and view changes preserve its bytes. Actual WYSIWYG edits may normalize Markdown syntax; consult the acceptance report for fidelity boundaries. Syntax highlighting and diagram/math rendering are bounded and fall back to readable source when their limits are exceeded. Inline dollar math, arbitrary TeX packages and PDF export are not supported.

Independent windows, plugins, draw.io and SQL DDL remain backlog work. See [current project status](CURRENT_STATUS.md) and [issue dispositions](docs/issue-status-2026-11-06.md).

## Build and develop

Use Node.js 24 or newer, npm 9 or newer and Rust 1.90 or newer with the platform’s Tauri build prerequisites. The supported dependencies and native build steps are recorded in [the CI workflow](.github/workflows/v2-ci.yml).

Install JavaScript dependencies from the repository root:

```sh
npm install
npm --prefix frontend ci
```

For native development, run these in separate terminals:

```sh
npm run frontend:dev
```

```sh
cd frontend
npm exec tauri dev
```

For frontend checks:

```sh
npm run frontend:test
npm run frontend:lint
npm run frontend:build
```

For Rust tests and a native bundle:

```sh
npm run tauri:test
cd frontend
npm exec tauri build
```

The native bundle requires a built frontend; run `npm run frontend:build` first. A browser-only development server does not provide native file dialogs, storage or menus.

## Documentation and history

This README is the maintained project entry point. [README-v2.md](README-v2.md) is a compatibility pointer; there is no separate active v2 development branch to switch to.

- [Current status](CURRENT_STATUS.md)
- [Proposed next increment and session prompts](docs/next-increment-2.6-plan.md)
- [2.5 implementation details](docs/technical-writing-2.5-alpha1.md)
- [2.5.1 release acceptance](docs/2.5.1-release-acceptance.md)
- [Release notes](docs/releases/2.5.1.md)
- [Historical changelog](CHANGELOG.md)

The former Python/Qt instructions and early rewrite notes remain available in [Git history](https://github.com/rheiger/markWriter/tree/7887a2ba60bb265a9f18420840adc2aa0700cab8). They do not describe the current application.

## License

MarkWriter is licensed under the [MIT License](LICENSE). Bundled dependency licenses and attributions are supplied in the application and each release’s `THIRD_PARTY_NOTICES.txt`.
