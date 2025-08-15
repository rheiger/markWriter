# Mermaid Diagram Test

This is a test file to verify that Mermaid diagrams are working correctly in MarkWrite.

## Flowchart Example

```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    C --> E[Continue]
    D --> F[Fix issues]
    F --> B
```

## Sequence Diagram Example

```mermaid
sequenceDiagram
    participant User
    participant MarkWrite
    participant Mermaid
    
    User->>MarkWrite: Open .md file
    MarkWrite->>Mermaid: Parse mermaid code blocks
    Mermaid->>MarkWrite: Return rendered SVG
    MarkWrite->>User: Display diagram
```

## Class Diagram Example

```mermaid
classDiagram
    class MarkWrite {
        +String version
        +String build
        +loadFile()
        +saveFile()
        +exportHTML()
    }
    
    class Editor {
        +String content
        +renderMarkdown()
        +renderMermaid()
    }
    
    MarkWrite --> Editor
```

## Gantt Chart Example

```mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Research           :done,    des1, 2024-01-01, 2024-01-15
    Design             :active,  des2, 2024-01-16, 2024-01-30
    section Phase 2
    Implementation     :         des3, 2024-02-01, 2024-02-28
    Testing            :         des4, 2024-03-01, 2024-03-15
```

This file should now display all the diagrams correctly when opened in MarkWrite!
