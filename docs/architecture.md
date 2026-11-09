# MarkWriter architecture

MarkWriter's desktop window runs React in the Tauri WebView. The application owns canonical Markdown in a per-document store. OS previews run in their respective shells and can render a file with the editor closed.

## Context

```mermaid
flowchart LR
    User --> Window["MarkWriter desktop window"]
    Window --> Host["Tauri host"]
    Host --> Files["Markdown files and HTML exports"]
    Host --> Profile["Preferences and workspace recovery"]
    User --> Shell["Finder, Explorer, GNOME Files or Dolphin"]
    Shell --> Provider["Platform preview provider"]
    Files --> Provider
```

## Application structure

```mermaid
flowchart TD
    App["React App and menus"] --> Store["Zustand document store"]
    App --> Editor["EditorView"]
    Editor --> CM["CodeMirror 6 source"]
    Editor --> PM["Tiptap / ProseMirror"]
    Editor --> Preview["Read-only Preview"]
    CM --> Store
    PM --> Store
    Preview --> Render["Markdown, highlight and diagram rendering"]
    Store --> Export["Self-contained HTML export"]
    Export --> Render
    Store --> IPC["Tauri invoke"]
    App --> IPC
    Render --> Workers["Bundled DBML, DOT and math workers"]
    IPC --> Rust["Rust file, profile, menu and picker commands"]
```

| Source | Responsibility |
| --- | --- |
| [`frontend/src/components/`](../frontend/src/components/) | Menus and dialogs, editor adapters, read-only Preview and diagram components |
| [`frontend/src/store/`](../frontend/src/store/) | Documents, active identity, revision, destination ownership and captured saves |
| [`frontend/src/lib/`](../frontend/src/lib/) | Markdown conversion and correspondence, highlighter, local workers, export and persistence client |
| [`src-tauri/src/`](../src-tauri/src/) | Tauri command registration, native menus, file writes, OS-open events, picker, profile and update policy |
| [`native/`](../native/) | Finder extension, Explorer handler, Sushi viewer and Dolphin thumbnailer |
| [`tools/`](../tools/) and [`.github/workflows/`](../.github/workflows/) | Build, package, acceptance, notices and release tooling |

## Save and recovery

```mermaid
sequenceDiagram
    participant UI as Editor and menu
    participant Store as Document store
    participant Rust as Tauri host
    participant Disk as Local filesystem
    UI->>Store: Update canonical text for the owning document
    Store->>Rust: Queue workspace recovery snapshot
    Rust->>Disk: Write workspace.json
    UI->>Store: Save captured document and destination
    Store->>Rust: Canonicalize path and write captured text
    Rust->>Disk: Flush temporary file and replace destination
    Rust-->>Store: Save result
    Store-->>UI: Compare current content with saved content
```

A tab switch does not redirect a save already in flight. Recovery and discard track the captured owning document and revision. Preview derives from canonical text. Read [document ownership](document-ownership.md) and [Preview correspondence](preview-correspondence.md) for the edge cases.

## SQL DDL import

```mermaid
sequenceDiagram
    participant UI as Insert menu and dialog
    participant Picker as Rust pick_sql_source
    participant SQL as SQL worker
    participant Graph as DBML and DOT workers
    participant Editor as Owning editor
    UI->>UI: Capture destination identity and revision
    UI->>Picker: Request native file selection
    Picker-->>UI: Bounded UTF-8 text, cancel or error
    UI->>SQL: Source and declared dialect
    SQL-->>UI: Editable DBML and warnings or error
    UI->>Graph: Validate edited DBML
    Graph-->>UI: Render result or error
    UI->>UI: Check destination and cancellation again
    UI->>Editor: Append one undoable DBML fence
```

The [picker](../src-tauri/src/sql_import.rs), [worker client](../frontend/src/lib/sqlDdlClient.ts) and [menu integration](../frontend/src/components/MenuBar.tsx) enforce distinct input, deadline and ownership boundaries. The [import guide](sql-import-preview.md) describes the supported DDL subset.

## Finder preview and release packages

```mermaid
sequenceDiagram
    participant F as Finder
    participant OS as Quick Look
    participant P as PreviewProvider
    participant W as Disposable WebKit renderer
    F->>OS: Request preview by file content type
    OS->>OS: Select among registered providers
    OS->>P: Request read-only preview if selected
    P->>P: Bounded read and escaped Swift rendering
    P->>W: Local script enrichment
    W-->>P: Enriched HTML or fallback
    P-->>F: HTML preview
```

The [extension plist](../native/quicklook/Info.plist) advertises supported types. The [provider](../native/quicklook/PreviewProvider.swift) owns file reading and delegates enrichment to [QuickLookWebRenderer](../native/quicklook/QuickLookWebRenderer.swift). Selection and rendering are separate checks. See the [shell preview matrix](shell-preview-matrix.md).

```mermaid
flowchart LR
    SHA["Candidate or merged commit"] --> CI["Quality and native tests"]
    SHA --> Prod["Production packages"]
    SHA --> Shell["Native shell preview jobs"]
    Prod --> Mac["Local Quick Look staging and ad hoc seal"]
    Prod --> Set["Flat release asset set"]
    Mac --> Set
    Shell --> Set
    Set --> Verify["Installed receipts, manifests and SHA-256"]
    Verify --> Draft["Verified draft"]
```

The [production workflow](../.github/workflows/tauri-prerelease.yml) includes the Explorer package acceptance, while [shell previews](../.github/workflows/shell-previews.yml) exercises Explorer diagnostics and builds and tests Sushi and Dolphin. Mac staging from CI provides separate evidence from the final locally sealed DMG. [Release tooling](../tools/release-metadata.mjs) checks manifests and aggregates exact-source assets.

Graphify is a local navigation aid for code relationships. It does not establish IPC command registration, worker protocols, preview metadata or workflow behavior. The diagrams above use the owning source and configuration for those edges.
