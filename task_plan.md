# Current task — implement MarkWriter 2.1.0-alpha2

Authority: user attachment and docs/next-increment-2.1.0-alpha2-plan.md. Implement required safe offline DOT #32 and verifiable production prerelease #35. DBML #33 only after required gates. Commit/push/merge/release authorized after acceptance; never publish failed gates or replace releases.

- [complete] 0 Baseline, refs, preservation inventory and owning-source inspection
- [complete] 1 DOT safety ADR, failing tests, killable bounded offline renderer and production worker policy
- [complete] 2 Preview/WYSIWYG/codec/Insert/folds/search/correspondence/export integration and alpha2 versions
- [complete] 3 Single Tauri package/publisher workflow, notices, provenance and installed-package native UI acceptance
- [complete] 4 Local/browser/macOS and final-source three-platform CI/artifact acceptance; independent final review
- [complete] 5 Issues/docs/PR integration, post-merge checks, draft bytes verification and qualified prerelease publication

Preserve all user work inventoried in /tmp/markwriter-alpha2-preserved.json. Explicit staging only; no reset/clean/stash. Current preparation tip f6ceda7 includes d49154b About credit. Keep exact Richie sentence. One primary implementer; no competing shared editor/store edits. Built-in browser preferred. Start renderer budgets 64KiB input / 2MiB SVG / 2s layout; prove actual CSP/asset offline behavior on each native target. Normal packages: macOS arm64 DMG, Windows x64 NSIS, Ubuntu26.04x64 DEB. No release until installed ordinary-dialog acceptance passes.

Historical plan is in Git / preparation docs; completed alpha1 work is not to be restarted.
