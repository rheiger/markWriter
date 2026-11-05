# Dependable editor stabilization

Goal: dependable Markdown editing, preview, Mermaid, tables, WYSIWYG, file operations and HTML export.

## Acceptance criteria
- Switching modes without edits preserves the original Markdown byte for byte.
- WYSIWYG edits preserve Mermaid source, table cell content/formatting, task state and ordinary Markdown semantics.
- Repeated switching, saving and reopening do not discard content.
- Tests exercise real conversion/editor implementations; native I/O is verified separately.
- Frontend and macOS native builds pass. Other platforms require their own execution evidence.

## Phases
1. Preserve baseline and reproduce failures — complete.
2. Stabilize conversion and mode synchronization with regression tests — complete for covered fixtures.
3. Verify file operations and HTML export; fix demonstrated failures — automated and macOS native UI fixture acceptance complete.
4. Run browser workflows, native checks, review and record remaining limits — complete for this engineering increment.
5. Native macOS UI acceptance, expanded fidelity and lint baseline — complete for covered workflows.
6. Dependency remediation — complete: clean install, tests/lint/build, zero npm audit findings and upgraded browser acceptance.
7. V2 CI/native platform qualification — active: First run 42083988171 passed Linux/macOS and failed Windows on missing ICO. Fixed and pushed; run 42085196968 is live at source commit fbd2910. Watch process handle 59524.
8. Final requirement-by-requirement completion audit — pending; broad goal remains active.

## Boundaries
Preserve existing samples and test evidence. No release or merge. The isolated stabilization branch is pushed solely for qualification CI; samples and test-result files remain local. Settings, plugins, Draw.io and multi-window work are deferred.
