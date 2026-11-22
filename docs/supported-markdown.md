# Markdown and editing

Markdown is the canonical document. Opening, searching, selecting, scrolling, folding, changing settings and switching modes do not rewrite it. A genuine WYSIWYG edit serializes supported structure and may normalize whitespace, list markers, fences and tables; use source mode where exact syntax matters.

MarkWriter supports common Markdown and GFM tables, tasks, fenced code, Mermaid and offline [DOT](dot-security.md) and [DBML](dbml-2.7.md) diagrams, plus explicit math fences. Use **Help → User Guide** for editing instructions and feature limits. Diagram and math rendering is bounded; unsupported or oversized input remains readable as source. HTML export is self-contained and contains static diagram output.

Find and Replace is scoped to the current document. Source mode searches Markdown, including folded content; rendered mode searches editable text and excludes opaque diagram interiors. See [regular-expression search](regex-search.md) for syntax, limits and replacement behavior. The source and rendered editor fonts are independent display settings.

### Large explicit SQL fences

Both editors, Preview and HTML export can highlight one explicitly labeled SQL fence up to 131,072 UTF-16 code units. Explicit SQL shares that budget across the document. Each line can contain up to 2,048 UTF-16 code units and each fence can produce up to 24,576 styled spans. The highlighter considers at most 64 code blocks per document pass. If a bound is exceeded, the affected SQL remains readable as literal source with a highlighting notice. Source bytes and edit history stay with the document.

Finder uses a separate bounded renderer. The per-fence and span limits above also apply there, with up to 262,144 UTF-16 units of ordinary highlighted code in aggregate, 16,384 UTF-16 units per line and 65,536 aggregate spans. The whole-file read, WebKit enrichment and deadline limits also apply. SQL import uses a different 64 KiB UTF-8 file limit.

### Large explicit TOML fences

Preview and self-contained HTML export highlight explicit TOML fences with a shared limit of 131,072 UTF-16 code units and 12,288 styled spans per document pass. Each fence can have up to 4,096 lines, with up to 2,048 UTF-16 code units per line. Before tokenizing, the highlighter budgets up to 8,192 syntax markers per document pass, including punctuation, numbers and boolean keywords even inside strings and comments. The highlighter considers at most 64 code blocks per pass. Fences that exceed the limits keep their full text and show a highlighting notice. UTF-8 byte sizes vary with the characters used.

Highlighting runs locally. Preview coalesces source edits for large documents and drops pending work when the active tab changes. HTML export renders the captured document revision. The editor and Finder continue using their own highlighting budgets.
