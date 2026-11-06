# Next increment — 2.1.0-alpha2

Prepared 6 November 2026. **Planned, not implemented or released.** [Implementation prompt](next-increment-2.1.0-alpha2-prompt.md).

## Product outcome and priorities

Ship a verifiable experimental Tauri prerelease that can render embedded DOT graphs offline, preserve their editable Markdown source, and export safe self-contained HTML. Finish the distribution path before adding more notation runtimes.

| Priority | Scope | Completion rule |
| --- | --- | --- |
| Required | [#32 DOT/Graphviz](https://github.com/rheiger/markWriter/issues/32) | Safe bounded offline renderer, full editor/persistence/export integration, three-platform qualification |
| Required | [#35 Tauri prereleases](https://github.com/rheiger/markWriter/issues/35) | Installed production packages, exact-source evidence, checksums/notices, qualified GitHub prerelease |
| Conditional stretch | [#33 DBML](https://github.com/rheiger/markWriter/issues/33) | Only after required feature and packaging gates pass; complete schema semantics and independent acceptance |
| Deferred | #31 PlantUML, #5 draw.io, #29 logs | Retain documented blockers/backlog; no placeholder UI |

Independent windows, plugins, graphical designers, standalone JSON/XML, broad preferences, per-selection font/color formatting, database connections and SQL import are outside this increment. #3/#4/#10 remain partial until their own remaining requirements are satisfied. New notation is textual visualization, not a diagram designer.

## Starting point and authority

- `2.1.0-alpha1` was accepted by Richard and merged into `main` in [PR #34](https://github.com/rheiger/markWriter/pull/34), merge `7e29c6fa769c0a944623373883562a3496ad2442`. Qualified feature source `2895d1c` passed [CI 42145312950](https://github.com/rheiger/markWriter/actions/runs/42145312950): 93 frontend tests, 17 Rust tests, all three native builds, and 22 actual application cases each on Windows/Linux. This is historical baseline evidence, not alpha2 acceptance.
- Preparation branch `codex/alpha2-plan-about` adds the requested About sentence: **This program was completely built using vibe coding under the direction of 'Richie'.** It was visibly verified in the ordinary rebuilt macOS app. Preserve it, version display, Close/Escape and focus behavior.
- Create `codex/offline-dot-alpha2` from the verified preparation tip, reconcile any newer `main` safely, and retain the preparation commits. Do not start from a stale main and lose this handoff/credit. Inspect current refs and worktree changes first; never reset user work.
- Preparation keeps version `2.1.0-alpha1`. During implementation, synchronize root/frontend manifests and appropriate locks, Cargo manifest/lock, Tauri metadata and About to exact **`2.1.0-alpha2`**. Do not invent `alpha.2`; do not force-add the ignored root lockfile.
- Richard explicitly requests issue maintenance and, **once implementation and acceptance are complete, commit, push, merge and release**. This supersedes historical no-merge/no-release instructions for the new increment. No extra routine approval is needed. Failed required gates prevent publication; record a concrete blocker and keep the candidate draft instead of declaring success.
- One primary implementer owns shared editor/store/parser changes. Do not create another Codex chat or competing parallel edits. Preserve modified/untracked Samples, Testresults, older untracked plans/prompts and any other user changes with a fresh inventory; explicit staging only. Use generated fixtures and isolated acceptance storage.

## Ordered implementation

### 1. Establish the renderer and packaging decisions

Read the [actual notation spike](notation-offline-spike-2026-11-06.md), its pinned reproduction sources and [document ownership](adr-document-ownership.md) / [Preview correspondence](adr-preview-correspondence.md) ADRs. Production Rust commands are in `src-tauri/src/main.rs`; frontend state is in `frontend/src/store/useAppStore.ts`. Read actual owners before changing them.

Write a short notation ADR defining supported DOT attributes, external-resource rejection, SVG sanitization, worker policy, job ownership, limits and inline errors. Reuse existing diagram/opaque-node infrastructure narrowly; avoid a new plugin framework. Review current official runtime/Tauri documentation before implementing APIs and record dependency pins, asset sizes and complete notices, including compiled Graphviz components.

Alongside design work, inspect `.github/workflows/build.yml` and `v2-ci.yml`. The current tag publisher still packages Python/PyInstaller while v2 CI builds debug executables. Neither qualifies a Tauri release. Define one Tauri publisher, pinned toolchains/actions, least-privilege publication, explicit supported platform baselines, and reproducible asset provenance. Prevent legacy `v*` triggers from publishing Python under v2 tags or racing the Tauri publisher; preserve existing tags/releases and historical source. Primary references: [Tauri distribution](https://v2.tauri.app/distribute/), [Tauri CSP](https://v2.tauri.app/security/csp/) and [Viz runtime API](https://viz-js.com/api/). These describe upstream capabilities; the application's own tests must prove integration.

### 2. Complete DOT safety before exposing controls

Use the actual pinned Viz/Graphviz engine, initially `@viz-js/viz` 3.31.0 / Graphviz 16.1.0 from the spike unless a documented verified reason requires changing it. Support canonical `dot` fences and a documented `graphviz` alias without rewriting existing fence bytes on view changes.

- Render in a locally bundled killable worker. Bound queued jobs and input/output size; terminate timed-out/stale jobs and retain document ID/revision/generation through every callback. Starting budgets to test are 64 KiB source, 2 MiB SVG and 2 seconds of layout; select measured limits and document them. Do not claim a hard heap limit the runtime cannot enforce. Stress fixtures must demonstrate UI responsiveness and recovery.
- Reject filesystem/network/resource-loading features (including images, external includes/resources and unsafe URLs), and sanitize output through a strict SVG element/attribute/URL/style policy before any DOM insertion or export. Cover `javascript:`, scripts, event handlers, `foreignObject`, external href/xlink references, CSS `url()`/imports and resource exhaustion. Valid-looking SVG is not proof of safety. Document intentional unsupported DOT attributes.
- Ship all WASM/worker/font/runtime assets locally, with no renderer service, source upload, CDN, runtime download or user-installed Graphviz/Java. Prove network-disabled operation.
- Qualify the worker's own policy and native asset responses. The spike proved document meta CSP does not establish worker policy, and the matching worker policy blocked WASM. If needed, use only a documented narrowly scoped WASM permission; no general `unsafe-eval`, global policy removal or unsupported security claim. Verify the actual production app on macOS, Windows and Linux.
- Fail malformed, empty, oversized, unsupported-resource and timed-out input visibly and recoverably while preserving its source. Do not expose a starter/menu control until this gate passes.

### 3. Complete the DOT product slice

Add a valid Insert → Diagram → DOT starter and an opaque source-preserving WYSIWYG diagram node using the same qualified renderer as Preview/export. Support source editing, repeated mode/tab changes, undo/redo, dirty tracking, save/reopen, session recovery and error recovery. Include folding, source search and block-level Preview correspondence; diagrams remain explicit block fallbacks rather than invented exact text mappings.

Export sanitized static inline SVG in self-contained HTML with no scripts, runtime fetches, acceptance bridge or internal mapping attributes. Preserve existing Mermaid, tables, links and embedded images. Theme changes and renderer completion must not change canonical Markdown or another tab. Extend user documentation with examples, supported subset and bounds.

### 4. Produce and exercise real installation packages

Declare a narrow initial matrix and record the exact OS/WebView baselines used. Targets are macOS Apple Silicon `.dmg` containing `.app`, Windows x64 NSIS installer, and Ubuntu 26.04 x64 `.deb`. Verify that chosen CI runners actually match these targets; a runner label alone does not prove a supported user OS. Other architectures, Fedora/Arch/Debian and AppImage are unqualified unless separately installed and tested.

Use normal production frontend/release binaries, never the isolated acceptance build. Install and launch the actual candidate packages in clean locations/isolated profiles. Exercise ordinary OS Open, Save As and Export dialogs, editing/undo, both-editor search, tabs, Settings/independent fonts, restart/recovery, source/Preview navigation, Mermaid and DOT offline. Existing explicit-path IPC tests remain useful but do not substitute for these OS-dialog checks. CI/native UI automation is acceptable evidence when it really drives the installed application; do not demand a human merely because an automated path is unfamiliar.

If existing authorized signing/notarization credentials are available, use and verify them. Otherwise an **explicitly unsigned experimental prerelease** is permitted: label each asset's status, describe standard installation and actual launch limitations, and make no signed/notarized/trusted-distribution claim. Do not disable OS protections or invent signing credentials. If normal installation/launch cannot be qualified on a target, that is a release gate failure, not a successful unsigned qualification.

Include dependency/runtime notices, installation and upgrade guidance, old Python-vs-Tauri product distinction, recovery/rollback guidance, SHA-256 sums and a machine-readable manifest tying each asset to source SHA, version, build run, platform/architecture, signing state and tested baseline. Do not promise original-file autosave or lossless recovery of unflushed keystrokes.

### 5. Optional DBML, only after required gates pass

If adding #33, use the actual DBML parser with a narrow/lazy load; the spike's all-grammar bundle is 32.96 MB and is not an acceptable accidental startup regression. Complete the real schema-to-layout adapter: escaped labels/metacharacters, schema-qualified identifiers, duplicate names, types, PK/UK/nullability, composite keys/references, correct field ports and all supported cardinalities. Define and test unsupported constructs/errors explicitly. A parser, Mermaid substitution or plausible boxes are insufficient.

DBML inherits qualified DOT layout but needs its own full codec/edit/save/reopen/recovery/export/native/offline acceptance. If any gate fails, remove incomplete product controls/dependencies and keep #33 open with the exact failed gate. Do not delay a fully qualified DOT/package core for DBML.

### 6. Integrate and publish only qualified work

1. Commit verified slices and push the implementation branch. Update issues with implemented scope, exact source and evidence; preserve history. Close #32/#35 only when all relevant gates pass; #33 only if it actually ships. Keep partial umbrellas/backlogs open.
2. Review the complete diff, resolve material findings, and update acceptance/status/changelog/issue index with exact version, shipped subset, platform/installation evidence and limits. Preserve the About credit. Verify user-file hashes before staging.
3. Open a PR into current `main`; wait for successful CI at the final source. Inspect downloaded native and package artifacts rather than inferring success from green job summaries. Merge after all required checks and packaging acceptance pass, handling newer main changes with a retest.
4. Verify merged `main` and its exact SHA with post-merge quality/package checks. If merge content differs from the candidate, requalify the changed paths. Tag that qualified merged SHA as **`v2.1.0-alpha2`**. Never retag or replace an existing release.
5. Let the single Tauri publication workflow create a **draft GitHub prerelease**, or create that draft through the authenticated repository tools. Download its final assets; verify hashes, manifest/source correspondence and installed-app behavior. Build once and promote the verified bytes when possible; any rebuilt asset needs its own checks.
6. Publish as **prerelease with `make_latest=false`**, with complete notes/install guidance and the tested platform limits. Verify the public release, tag target, asset names/downloads, SHA-256 sums, embedded versions and absence of Python/acceptance artifacts. No stable/latest promotion, updater rollout, unrelated infrastructure changes or forced history rewrite is authorized.

## Required verification and evidence

- Retain the 93 frontend / 17 Rust / 22 Windows + 22 Linux application-case baseline and add meaningful renderer/security/ownership/codec regressions. Counts may grow; old green runs are not alpha2 acceptance.
- Run frontend tests, lint/typecheck, production/isolated acceptance builds, bridge exclusion, dependency audit, relevant locked Rust tests and all-three-platform CI. Investigate advisories rather than weakening the audit threshold.
- Exercise actual browser geometry and ordinary native app behavior: keyboard-only use, light/dark, 800/1024/1440px layouts/footer, unequal source/rendered fonts, folds/large documents, tab-switch/close races, malicious/malformed/large DOT, worker timeout/cancellation, clean source and no console errors in accepted flows. Extend the native harness; separately qualify installed packages and OS dialogs.
- Record explicit expected errors in hostile fixtures. Preserve canonical bytes through all view-only actions, per-tab histories, captured document/revision I/O and recovery/discard semantics. Search/render/navigation callbacks must never target another document or clear newer edits.
- Deliver an alpha2 acceptance report with source/CI/artifact links, measurements, notices, supported subset/platforms, release URL and remaining limits. Stop only at completion or a concrete external blocker; do not call a partially qualified release complete.

## Next-session model

Use **GPT-6.1 Sol**, thinking **Extra High (`xhigh`)**, for the primary implementation session. The installed Codex model catalog exposes that model/effort combination. This is an engineering recommendation for the combined renderer isolation, editor ownership and release work, not a benchmark claim. Keep one primary owner; use the applicable agent rules if later delegation is explicitly authorized. [Official reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning) explains the tradeoff for long agentic work; recheck the next session's available model controls.

Confidence in this scope: **95%**. Existing runtime experiments and accepted source establish a practical next step; worker policy, installed-package behavior and optional DBML semantics still require implementation evidence.
