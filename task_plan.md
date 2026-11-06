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
