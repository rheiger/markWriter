# 🚀 MarkWriter Quick Status - August 27, 2025

## ✅ **What's Working NOW**
- **UI**: Full application visible with menu bar, toolbar, and tabs
- **Markdown Mode**: CodeMirror editor working (wraps long lines); sample content displays
- **Preview**: HTML rendering working in Markdown mode; Mermaid renders correctly
- **Layout**: Split view defaults to 50/50 and divider is draggable (20–80%)
- **WYSIWYG (partial)**: Tiptap integrated; toolbar actions (bold/italic/headings/lists/HR/blockquote/code block) working; content syncs with Markdown

## 🔴 **What's BROKEN / Gaps**
- **WYSIWYG Mermaid**: Mermaid code fences not rendered as diagrams yet
- **WYSIWYG Tables**: Not rendering consistently (raw HTML shown)
- **Scroll Sync**: Basic ratio sync works but needs accuracy; selection highlight missing
- **Caret Preservation**: Needs refinement across mode switches

## 🎯 **Next Session Priorities**
1. **WYSIWYG Mermaid Node** - Implement Node/NodeView using preview pipeline
2. **WYSIWYG Table Fidelity** - Ensure Markdown imports to Tiptap Table; fix insert
3. **Scroll Sync 2.0** - Anchor-based sync + selection highlight
4. **Caret/Selection Preservation** across mode switches

## 📁 **Key Files to Check**
- `frontend/src/components/EditorView.tsx` - Markdown/Preview/WYSIWYG glue
- `frontend/src/components/MermaidRenderer.tsx` - Reference for WYSIWYG NodeView
- Browser console - render errors in WYSIWYG NodeView setup

## 🚫 **Don't Waste Time On**
- CSP string configurations (already tried)
- Dialog plugin configs (already tried)
- Current WYSIWYG implementation (needs complete rewrite)

---
**Status**: UI Working; Markdown+Preview stable; WYSIWYG partially functional
**Next**: WYSIWYG Mermaid and Tables; scroll/caret polish
