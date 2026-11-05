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
6. Remediate dependency advisories, establish v2 CI, broaden corpus and qualify remaining supported platforms — pending; broad goal remains active.

## Boundaries
Preserve existing samples and test evidence. No release or push implied. Settings, plugins, Draw.io and multi-window work are deferred.
