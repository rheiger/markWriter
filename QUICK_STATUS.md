# 🚀 MarkWriter Quick Status - August 27, 2025

## ✅ **What's Working NOW**
- **UI**: Full application visible with menu bar, toolbar, and tabs
- **Markdown Mode**: CodeMirror editor working (wraps long lines); selection and editing stable
- **Preview**: HTML rendering working; Mermaid renders on initial load and after first switch
- **Layout**: Split view defaults to 50/50 and divider is draggable (20–80%)
- **WYSIWYG**: Tiptap integrated; toolbar actions (bold/italic/headings/lists/HR/blockquote/code block/underline) working; content syncs with Markdown; mode switches stable for editing

## 🔴 **What's BROKEN / Gaps**
- **Mermaid**: After second switch back to Markdown (no edits), Mermaid blocks disappear from raw/preview (see Issue #28)
- **Tables**: WYSIWYG insertion → Markdown round-trip requires verification; gridlines polish in WYSIWYG
- **Scroll Sync**: Basic ratio sync ok; selection highlight missing

## 🎯 **Next Session Priorities**
1. **Mermaid stability** - re-hydrate and persist blocks across repeated tab switches; prevent late overwrites
2. **WYSIWYG Table Fidelity** - ensure GFM round-trip; improve gridlines and area highlight
3. **Scroll Sync 2.0** - anchor-based sync + selection highlight

## 📁 **Key Files to Check**
- `frontend/src/components/EditorView.tsx` - Markdown/Preview/WYSIWYG glue
- `frontend/src/components/MermaidRenderer.tsx` - Reference for WYSIWYG NodeView
- `frontend/src/App.tsx` - one-time init
- Browser console - warnings about flushSync and duplicate extensions

## 🚫 **Don't Waste Time On**
- CSP string configurations (already tried)
- Dialog plugin configs (already tried)
- Current WYSIWYG implementation (needs complete rewrite)

---
**Status**: UI Working; Markdown+Preview/WYSIWYG stable for editing; Mermaid has a repeat-switch regression
**Next**: Fix Mermaid persistence across switches; table round-trip; scroll highlight (see Issue #28)
