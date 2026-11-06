# Current task — implement MarkWriter 2.1.0-alpha1

Authority/scope: user attachment and docs/next-increment-2.1.0-alpha1-plan.md. One implementer; no competing edits. Start ed40277 on codex/editing-navigation-plan. Preserve user files inventoried in /tmp/markwriter-2.1-preserved.json.

- 0 Baseline/branch/inventory: complete
- 1 Mapping ADR and tested renderer sidecar: complete
- 2 Find/Replace in both editors: complete
- 3 Wrap continuation and adaptive picker: complete
- 4 Remaining editing and Markdown guide: complete
- 5 Content-aware scroll/caret/selection synchronization: complete
- 6 Browser/native integration and final-source CI: complete (2895d1c / CI42145312950; both22-case artifacts inspected)
- 7 Independently gated notation spikes after core: complete (all three actual runtimes attempted; independently deferred at documented gates)
- 8 Review, issue reconciliation, review app and handoff: in_progress (review app/evidence complete; qualified issue closure and final handoff pending)

Version remains exactly 2.1.0-alpha1. Commit verified slices; push feature branch only. No merge/tag/release. Keep #10 umbrella open; #5/#29 backlog. Do not claim old evidence as new-feature acceptance.

---
## Completed handoff preparation (historical)

# Current task — prepare the 2.1.0-alpha1 implementation handoff

Scope: write the next-session plan/prompt, update GitHub core/stretch/backlog scope, and increment version metadata. Feature implementation belongs to the next session.

- Scope, code-owner and model/source checks: complete.
- GitHub #30 synchronization, #31 PlantUML, #32 DOT, #33 DBML created; #10/#21/#26/#28 core and #5/#29 backlog recorded: complete.
- Plan/prompt/issue index and current-entry docs: complete.
- Version metadata: complete (`2.1.0-alpha1`); no new feature acceptance claimed.
- Final local checks, preservation verification and handoff delivery: complete. Metadata commit `53598fa`; see Git for the final docs commit/pushed branch. No new feature/native UI acceptance claimed.

Next implementation follows `docs/next-increment-2.1.0-alpha1-plan.md`, not the completed historical plan below. Planning branch `codex/editing-navigation-plan`; feature baseline `6c6eb56` / CI42132949169 remains historical evidence. Preserve user Samples/Testresults and older untracked plans/prompts.

---

## Completed historical task (reference)

# Productivity increment — 6 November 2026

Agreed scope: docs/next-increment-plan-2026-11-06.md. Starting HEAD 1fe311c; branch codex/productivity-increment. Historical control-polish work is complete.

## Phases
- Baseline / ownership ADR: complete
- Document-ID store and safe asynchronous file operations: complete
- Tabs and retained editor sessions: complete
- Native settings/schema persistence and Settings dialog: complete
- Session restore / recovery / conflicts: complete
- Accessible table management and boundaries: complete
- Non-destructive embedded-source folds: complete
- Mermaid ERD template / acceptance: complete
- Integration, optional read-only review, native/CI qualification and closeout: complete
- Separate draw.io offline feasibility spike after core gates: complete (product integration deferred; see docs/drawio-offline-spike-2026-11-06.md)

Preserve pre-existing Samples/, Testresults/ and untracked planning documents. No merge/release/issue messages. Commit verified slices and push feature branch.

Final gate passed at source6c6eb56 in CI42132949169: 68 frontend tests, all three native jobs and16 Windows/Linux application cases each; both artifacts inspected. Ordinary macOS alpha.2 review app rebuilt and checked, original clean document restored. Draw.io product integration remains explicitly deferred after its isolated spike. Closeout is documentation only.
