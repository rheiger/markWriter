# Markdown and editing

Markdown is the canonical document. Opening, searching, selecting, scrolling, folding, changing settings and switching modes do not rewrite it. A genuine WYSIWYG edit serializes supported structure and may normalize whitespace, list markers, fences and tables; use source mode where exact syntax matters.

MarkWriter supports common Markdown and GFM tables, tasks, fenced code, Mermaid and offline [DOT](dot-security.md) and [DBML](dbml-2.7.md) diagrams, plus explicit math fences. Use **Help → User Guide** for editing instructions and feature limits. Diagram and math rendering is bounded; unsupported or oversized input remains readable as source. HTML export is self-contained and contains static diagram output.

Find and Replace is scoped to the current document. Source mode searches Markdown, including folded content; rendered mode searches editable text and excludes opaque diagram interiors. See [regular-expression search](regex-search.md) for syntax, limits and replacement behavior. The source and rendered editor fonts are independent display settings.
