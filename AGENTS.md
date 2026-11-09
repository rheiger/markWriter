# MarkWriter project guidance

MarkWriter is a Rust/Tauri 2, React and TypeScript desktop Markdown editor. The maintained project entry point is [README.md](README.md); release notes are in [docs/releases](docs/releases/). Check current code and live release state rather than assuming an old plan is current.

## Core contracts

- Canonical Markdown, per-document ownership, revisions, histories, captured I/O and recovery/discard behavior must survive view changes and asynchronous operations. See [document ownership](docs/document-ownership.md).
- Preview is read-only; exact source correspondence and dashed block fallbacks are distinct. Exported links remain active. See [preview correspondence](docs/preview-correspondence.md).
- Source and rendered fonts are independent. Preserve native input/composition, safe bounded offline rendering, recovery and explicit error paths. See [DOT security](docs/dot-security.md).
- Preserve the project’s icon artwork and the exact Richie credit in About. Do not modify existing releases, tags, signing, update feeds or user documents without specific authorization.
- Use isolated test profiles and synthetic fixtures. Preserve unrelated local work. Distinguish unit, CI, installed and actual desktop acceptance; do not claim untested platforms or user workflows.

## Development

Use Node 24+, the pinned frontend lockfile and the Rust version in `src-tauri/Cargo.toml`. Run the frontend tests, lint and build for frontend changes, relevant Rust tests for native changes, and inspect CI workflows for platform/package gates. Keep issues and documentation aligned with evidence and current scope. Existing release notes are historical and should not be rewritten.
