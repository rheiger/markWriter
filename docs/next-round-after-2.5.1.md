# Proposed next round after 2.5.1

Planning proposal only; not new implementation authority or a promise that every open feature is nearly complete.

## Recommended focus: desktop completion and release confidence

1. **Responsive highlighting and language coverage (#44).** Add the requested Java, Perl, AWK, sed and CMake grammars/aliases, and move expensive highlighting to cancellable bounded workers. Preserve explicit-language/plain authority, document ownership and fair work for later blocks. Qualify typing/mode-switch latency and exact source across both editors, Preview and export. The bounded Python/JSON fix in 2.5.1 solves the reported case; pathological input can still take longer before plain fallback.
2. **Windows, layouts and menus (#8/#10).** Independent windows, moving tabs, window list, Close Others, fullscreen and source-only/preview-only/split layouts. Establish cross-window document ownership, Save As reservations, captured callbacks, dirty-close protection and recovery before adding controls. Tabs and Help are already shipped.
3. **Practical preferences (#9).** Settings import/export, shortcut conflicts and default file/export locations. Treat original-file autosave/backups as a separately reviewed data-safety contract with atomic writes, external-change conflicts and visible failures. Existing recovery snapshots are not original-file autosave.
4. **Distribution and support.** Pursue real Developer ID signing/notarization and browser-quarantine upgrade/rollback acceptance; qualify Windows signing/SmartScreen separately. Profile startup/large-document rendering/memory before optimizing. Reconcile stale status/umbrella issues without erasing their remaining scope. Automate the qualification, accepted-asset and historical-integrity checks so future regular releases remain reviewable without repeating manual release bookkeeping.

**Start the native-preview feasibility spike (#48/#49) in parallel:** these are the only currently open issues marked high priority. Resolve provider/signing/package constraints early, then promote a qualified preview slice into the delivery round rather than postponing that risk until the end.

These lanes can proceed with separate ownership, but window/recovery/autosave work needs focused integration review and native acceptance. Trusted signing also requires real account credentials; regular GitHub release classification does not supply it.

## Wider delivery programme

If “almost everything except backlog” means a broader programme, add these as separate accepted increments:

- **#48/#49 native Markdown and structured-file previews:** establish actual platform-provider/signing/package feasibility; respect chosen associations; then bounded read-only JSON/JSONL/XML/YAML formatting with no network/entities or user-file changes. An in-app Preview is not shell Quick Look.
- **#41 PDF:** prove actual offline multipage output on every supported OS, including Unicode, tables, long code, images, diagrams and math; then native save/cancel and pagination acceptance.
- **#33 DBML → #42 SQL DDL:** deliver schema-aware DBML parsing/layout/edit/export first; choose a declared DDL dialect and real fixtures before import. No execution or silent partial conversion.
- **#31 PlantUML:** independently prove bundled runtime/fonts/licenses and isolation; host Java alone is not offline distribution.
- **#7 standalone formats, #22 per-selection formatting and #6 plugins:** substantial new format/trust contracts. Markdown fences and display-font preferences do not already implement them.

## Backlog interpretation

Current issue metadata has no literal backlog label. The bodies explicitly mark #5 draw.io, #19 graphical designers and #29 console-log tooling as backlog. Other deferred features are still substantive scope; they must not silently disappear from an “all remaining” commitment.

Keep #3/#4 and the #8/#9/#10 umbrellas qualified: current Ubuntu26.04x64 support does not prove other distributions/architectures; a shipped tab/settings/menu slice does not complete independent windows, broad preferences or every menu action. Close only the agreed residual contracts after actual native/package evidence.

## Gates

Preserve canonical Markdown, user data, per-document/revision ownership, histories, recovery, independent fonts, offline bounds and exact Richie credit/artwork. Each shipped slice requires automated regression plus actual native and installed-package acceptance on the claimed baselines, with immutable releases and signing limits clearly stated. Feasibility spikes determine the risky PDF/provider/runtime boundaries before calendar commitments.
