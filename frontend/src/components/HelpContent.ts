type HelpBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'example'; label: string; code: string }
  | { kind: 'shortcuts'; rows: { action: string; mac: string; other: string }[] }

export interface HelpTopic { id: string; title: string; blocks: HelpBlock[] }

// Bundled plain text: it is searchable without fetching content or rendering HTML.
export const helpTopics: HelpTopic[] = [
  {
    id: 'start', title: 'Getting started', blocks: [
      { kind: 'paragraph', text: 'Create a document with File → New, or use File → Open to open a Markdown file. Each document has its own tab; the dot beside its title marks unsaved changes.' },
      { kind: 'paragraph', text: 'Choose Markdown with preview or WYSIWYG using the toolbar or View menu. Markdown is the document source in both views. The Preview is read-only; WYSIWYG lets you edit the rendered document.' },
      { kind: 'paragraph', text: 'Switching views alone does not change the source. A rendered edit can change the Markdown syntax used to represent that edit, so use the Markdown view when exact notation matters.' },
      { kind: 'paragraph', text: 'Use File → Save or Save As to write a Markdown file. File → Export as HTML creates a separate HTML document with rendered diagrams and styling. Linked images and links can still depend on their external locations.' },
    ],
  },
  {
    id: 'markdown', title: 'Markdown conventions', blocks: [
      { kind: 'paragraph', text: 'Use a blank line to separate paragraphs. Headings begin with #, lists with - or a number, and blockquotes with >. Use **bold**, *italic*, backticks for inline code, and [label](address) for a link.' },
      { kind: 'example', label: 'A small document', code: '# Project notes\n\n- [ ] Review the draft\n- [x] Save a copy\n\n> A useful quotation\n\n[Project site](https://example.com)' },
      { kind: 'paragraph', text: 'The toolbar also offers formatting, tables and lists in both editors. In Markdown with preview, the source and Preview can synchronize scrolling and selections when enabled in Settings. Exact text matches and dashed block-level fallbacks have different precision.' },
      { kind: 'paragraph', text: 'Preview link labels select the corresponding source instead of opening a link. Links remain active in exported HTML.' },
    ],
  },
  {
    id: 'code', title: 'Code and diagrams', blocks: [
      { kind: 'paragraph', text: 'Start a code block with three backticks and an optional language name, then close it with three backticks. A recognized name, such as python, javascript, rust or css, requests syntax highlighting.' },
      { kind: 'example', label: 'Code fence', code: '```python\nprint("Hello, MarkWriter")\n```' },
      { kind: 'paragraph', text: 'View → Syntax highlighting turns highlighting on or off. Explicit Python/JSON blocks support up to 16 Ki characters each and share a 32 Ki character document budget. Other explicit languages support 4 Ki characters per block with a separate 16 Ki document budget; automatic detection and individual lines are limited to 2 Ki characters. Unknown languages, uncertain automatic detection and blocks beyond these limits remain plain text; their source is preserved.' },
      { kind: 'paragraph', text: 'Use a mermaid fence for Mermaid diagrams, or a dot or graphviz fence for Graphviz DOT. Insert → Mermaid ERD and Insert → DOT provide starting examples. Diagram rendering is bundled for offline use.' },
      { kind: 'example', label: 'Mermaid fence', code: '```mermaid\nflowchart LR\n    Draft --> Review\n```' },
      { kind: 'example', label: 'DOT fence', code: '```dot\ndigraph { Draft -> Review }\n```' },
      { kind: 'paragraph', text: 'Edit diagram source in the Markdown view. If a diagram cannot be rendered, check its source and syntax. Diagram support does not imply support for other notation formats.' },
    ],
  },
  {
    id: 'math', title: 'Mathematics', blocks: [
      { kind: 'paragraph', text: 'Use Insert → Math block for a starter, or an explicit math fence for a mathematical block. Put the expression on lines between the opening and closing fences, and edit its source in the Markdown view or with Edit math source in WYSIWYG. Typing changes the document immediately; use Save to write it to disk. Done closes the source field.' },
      { kind: 'example', label: 'Math fence', code: '```math\n\\frac{a}{b} = c\n```' },
      { kind: 'paragraph', text: 'Math blocks use supported TeX-style expressions and render offline. This is a bounded subset, not arbitrary TeX. Inline dollar delimiters, equation numbering and cross-references are not supported.' },
      { kind: 'paragraph', text: 'If an expression is invalid or unsupported, its source remains available for correction and HTML export includes a readable source fallback. Rendering is limited to 16 KiB per block and 64 blocks / 256 KiB source per document. To copy exact TeX, use Edit math source or the Markdown view.' },
    ],
  },
  {
    id: 'find', title: 'Find and navigate', blocks: [
      { kind: 'paragraph', text: 'Choose Edit → Find or Replace. Search is literal, with optional case-sensitive and whole-word matching. Enter moves to the next match; Shift+Enter moves to the previous match. Navigation wraps at the end.' },
      { kind: 'paragraph', text: 'Markdown search covers the source, including folded content, and supports multiline queries. WYSIWYG search covers editable rendered text within each text block; diagram and image internals are excluded. Use Search source in the find panel to search the Markdown instead.' },
      { kind: 'paragraph', text: 'In Markdown with preview, diagram and embedded-image source can be folded. Settings controls whether these blocks start collapsed and whether Preview synchronization is enabled.' },
    ],
  },
  {
    id: 'files', title: 'Files and recovery', blocks: [
      { kind: 'paragraph', text: 'Save writes your document to its chosen file. A new document needs a path; use Save As to choose one. Close Tab and Quit ask what to do with unsaved changes.' },
      { kind: 'paragraph', text: 'MarkWriter keeps local recovery copies of workspace drafts. Settings → Restore tabs on startup controls restoring clean tabs; unsaved drafts can be recovered after an interruption. Recovery copies are not a substitute for saving and backing up files.' },
      { kind: 'paragraph', text: 'If the original file has changed externally or is unavailable when a draft is restored, MarkWriter opens a separate recovery copy and reports the problem. Review the draft and use Save As to choose where to save it.' },
    ],
  },
  {
    id: 'settings', title: 'Appearance and settings', blocks: [
      { kind: 'paragraph', text: 'Choose Auto, Light or Dark in the View menu or Settings. Auto follows the system appearance.' },
      { kind: 'paragraph', text: 'Settings has independent source and rendered font families and text sizes. The source font is used in the Markdown editor; the rendered font is used for the rendered view and Preview. View → Zoom adjusts the active editor’s text size.' },
      { kind: 'paragraph', text: 'Settings also controls source tab width, wrapping, continuation markers, Preview synchronization and default folding. Changing a view or preference does not itself edit the document.' },
    ],
  },
  {
    id: 'shortcuts', title: 'Keyboard shortcuts', blocks: [
      { kind: 'paragraph', text: 'The application shortcuts below use Command on macOS and Control on Windows and Linux. Some shortcuts are available while an editor has focus; operating-system shortcuts can vary.' },
      { kind: 'shortcuts', rows: [
        { action: 'New document', mac: '⌘ N', other: 'Ctrl+N' },
        { action: 'Open', mac: '⌘ O', other: 'Ctrl+O' },
        { action: 'Save', mac: '⌘ S', other: 'Ctrl+S' },
        { action: 'Close tab', mac: '⌘ W', other: 'Ctrl+W' },
        { action: 'Undo', mac: '⌘ Z', other: 'Ctrl+Z' },
        { action: 'Find', mac: '⌘ F', other: 'Ctrl+F' },
        { action: 'Replace', mac: '⌘ ⇧ H', other: 'Ctrl+H' },
        { action: 'Settings', mac: '⌘ ,', other: 'Ctrl+,' },
        { action: 'Zoom in / out / actual size', mac: '⌘ + / − / 0', other: 'Ctrl+ + / − / 0' },
        { action: 'Next / previous tab', mac: 'Ctrl+Tab / Ctrl+Shift+Tab', other: 'Ctrl+Tab / Ctrl+Shift+Tab' },
      ] },
      { kind: 'paragraph', text: 'In Find, Enter goes to the next result and Shift+Enter to the previous result. Escape closes Find or a dialog.' },
    ],
  },
]

function blockText(block: HelpBlock): string {
  switch (block.kind) {
    case 'paragraph': return block.text
    case 'example': return `${block.label} ${block.code}`
    case 'shortcuts': return block.rows.map(row => `${row.action} ${row.mac} ${row.other}`).join(' ')
  }
}

export function findHelpTopics(query: string): HelpTopic[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return helpTopics.filter(topic => {
    const content = `${topic.title} ${topic.blocks.map(blockText).join(' ')}`.toLowerCase()
    return terms.every(term => content.includes(term))
  })
}
