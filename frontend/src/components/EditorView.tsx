import React, { useEffect, useRef, forwardRef, useState, useCallback } from 'react'
import { EditorView as CodeMirrorView, keymap, drawSelection } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { foldEffect, unfoldAll } from '@codemirror/language'
import { embeddedSourceFolds, findEmbeddedSource, synchronizeSource } from '../lib/sourceFolds'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { useAppStore } from '../store/useAppStore'
import './EditorView.css'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import mermaid from 'mermaid'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Code from '@tiptap/extension-code'
import { HighlightedCodeBlock, codeHighlightKey, sourceCodeHighlighting } from '../lib/editorCodeHighlight'
import { useResolvedDark } from '../lib/theme'
import '../lib/codeHighlight.css'
import { toWysiwygHtml, fromWysiwygHtml, renderMappedMarkdown } from '../lib/markdown'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { TableTools } from './TableTools'
import { MermaidNode } from '../extensions/MermaidNode'
import { DotNode } from '../extensions/DotNode'
import { dotRenderer } from '../lib/dotRenderer'
import { FindReplace } from './FindReplace'
import { renderedSearchDecorations, sourceSearchDecorations } from '../lib/editorSearch'
import { synchronizePreview } from '../lib/previewSync'
import type { PreviewMap } from '../lib/sourceMap'
import { sourceCoordinates, applyEditorChanges, editorText } from '../lib/sourceCoordinates'
import { wrapContinuation } from '../lib/wrapContinuation'
import { toggleSourceCode, toggleSourceList, clearSourceCode, toggleSourceMark, toggleRenderedCode, finishRenderedFormat, sourceFormatting } from '../lib/editingCommands'

// Source synchronization is a view update, never a rendered Undo event. Close
// the prior group as well, so the next real rendered edit starts its own event.
function synchronizeRendered(editor: Editor, source: string) {
  editor.chain()
    .command(({ tr }) => { closeHistory(tr); tr.setMeta('addToHistory', false); return true })
    .setContent(toWysiwygHtml(source), { emitUpdate: false })
    .run()
}

export type EditorMode = 'markdown' | 'wysiwyg'
interface EditorViewProps { onModeChange?: (mode: EditorMode) => void }
interface DocumentEditorProps extends EditorViewProps { documentId?: string, active: boolean }

export interface EditorViewRef {
  setMode: (mode: EditorMode) => void
  openFind: (replace?: boolean) => void
  getMarkdown: () => string
  setMarkdown: (content: string) => void
  // CodeMirror 6 specific methods for menu integration
  undo: () => void
  redo: () => void
  focus: () => void
  getSelection: () => string
  getSelectionIdentity: () => { editor: object; selection: string } | null
  insertText: (text: string) => void
  insertMarkdown: (text: string) => void
  selectAll: () => void
  // Editor instance access for advanced operations
  getEditorView: () => CodeMirrorView | null
  // WYSIWYG formatting controls
  toggleBold: () => void
  toggleItalic: () => void
  setHeadingLevel: (level: number) => void // 0 -> paragraph
  toggleBulletList: () => void
  toggleOrderedList: () => void
  insertHorizontalRule: () => void
  toggleBlockquote: () => void
  toggleCodeBlock: () => void
  setLink: (url?: string) => void
  // Additional actions for toolbar
  toggleStrike?: () => void
  toggleTask?: () => void
  insertTable?: (rows: number, cols: number) => void
  toggleUnderline?: () => void
  // Formatting state for toolbar
  getFormattingState?: () => {
    blockLabel: string
    bold: boolean
    italic: boolean
    strike: boolean
    underline: boolean
    code: boolean
    link: boolean
  }
  onFormattingChange?: (listener: (state: {
    blockLabel: string
    bold: boolean
    italic: boolean
    strike: boolean
    underline: boolean
    code: boolean
    link: boolean
  }) => void) => void
}


const DocumentEditor = forwardRef<EditorViewRef, DocumentEditorProps>(({ onModeChange, documentId, active }, ref) => {
  const preferences = useRef(new Compartment())
  const highlighting = useRef(new Compartment())
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<CodeMirrorView | null>(null)
  const [sourceView, setSourceView] = useState<CodeMirrorView | null>(null)
  const [find, setFind] = useState({ open: false, replace: false, request: 0 })
  const [diagramCount, setDiagramCount] = useState(0)
  const [editorMode, setEditorMode] = useState<EditorMode>(useAppStore.getState().documents.find(doc => doc.id === documentId)?.mode ?? 'wysiwyg')
  const [splitPos, setSplitPos] = useState<number>(50)
  const isDraggingSplit = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const syncRef = useRef<ReturnType<typeof synchronizePreview> | null>(null)
  const previewMap = useRef<PreviewMap | null>(null)
  const wysiwygContainerRef = useRef<HTMLDivElement>(null)
  const isUpdatingFromMarkdown = useRef(false)
  const isSwitchingModeRef = useRef(false)
  const initialViewState = useRef(useAppStore.getState().documents.find(doc => doc.id === documentId)?.viewState)
  const lastMarkdownAnchorRef = useRef(initialViewState.current?.sourceAnchor ?? 0)
  const sourceNewline = useRef(useAppStore.getState().documents.find(doc => doc.id === documentId)?.content.includes('\r\n') ? '\r\n' : '\n')
  const captureView = useRef<() => void>(() => {})
  const formattingListenerRef = useRef<null | ((state: any) => void)>(null)

  const currentDocument = useAppStore(state => state.documents.find(doc => doc.id === documentId) ?? null)
  const config = useAppStore(state => state.config)
  const isDark = useResolvedDark(config.theme)
  const updateDocumentContent = useCallback((content: string) => useAppStore.getState().updateDocumentContent(content, documentId), [documentId])
  const source = useCallback(() => useAppStore.getState().documents.find(doc => doc.id === documentId)?.content ?? '', [documentId])

  const [initialHtml] = useState(() => toWysiwygHtml(currentDocument?.content ?? ''))
  const lastTiptapSource = useRef(currentDocument?.content ?? '')
  const lastTiptapSemantic = useRef<string | null>(null)
  if (lastTiptapSemantic.current === null) lastTiptapSemantic.current = fromWysiwygHtml(initialHtml)
  // Tiptap editor instance (WYSIWYG)
  const tiptap = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        // Disable to avoid duplicate extensions; we add our own below
        bulletList: false,
        orderedList: false,
        listItem: false,
        heading: false,
        blockquote: false,
        hardBreak: false,
        horizontalRule: false,
        code: false,
        strike: false,
        underline: false,
        link: false,
      }),
      renderedSearchDecorations,
      HighlightedCodeBlock.configure({ highlighting: config.syntaxHighlighting }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      BulletList,
      OrderedList,
      ListItem,
      Heading.configure({ levels: [1,2,3,4,5,6] }),
      Blockquote,
      HardBreak,
      HorizontalRule,
      Code,
      Strike,
      Underline,
      Link.configure({ autolink: false, linkOnPaste: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['tableCell', 'tableHeader'] }),
      MermaidNode,
      DotNode.configure({ documentId }),
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: initialHtml,
    onCreate: ({ editor }) => {
      lastTiptapSemantic.current = fromWysiwygHtml(editor.getHTML())
      const remembered = initialViewState.current
      if (remembered?.renderedAnchor !== undefined) editor.commands.setTextSelection({ from: Math.min(editor.state.doc.content.size, remembered.renderedAnchor), to: Math.min(editor.state.doc.content.size, remembered.renderedHead ?? remembered.renderedAnchor) })
      requestAnimationFrame(() => { if (wysiwygContainerRef.current && remembered?.renderedScroll !== undefined) wysiwygContainerRef.current.scrollTop = remembered.renderedScroll })
    },
    onUpdate: ({ editor }) => {
      if (!editor.isInitialized || isUpdatingFromMarkdown.current) return
      const html = editor.getHTML()
      const markdownFromHtml = fromWysiwygHtml(html)
      if (markdownFromHtml === lastTiptapSemantic.current) return
      lastTiptapSemantic.current = markdownFromHtml
      lastTiptapSource.current = markdownFromHtml
      updateDocumentContent(markdownFromHtml)
    },
    editable: true,
    autofocus: false,
    enableInputRules: false,
    enablePasteRules: false,
  })

  // Compute formatting state for WYSIWYG toolbar label
  const computeFormattingState = useCallback(() => {
    if (editorMode === 'markdown' && editorViewRef.current) return sourceFormatting(editorViewRef.current)
    if (!tiptap) {
      return {
        blockLabel: 'Body', bold: false, italic: false, strike: false, underline: false, code: false, link: false,
      }
    }
    let blockLabel = 'Body'
    for (let lvl = 1 as 1|2|3|4|5|6; lvl <= 6; lvl = (lvl + 1) as 1|2|3|4|5|6) {
      if (tiptap.isActive('heading', { level: lvl })) { blockLabel = `H${lvl}`; break }
    }
    if (tiptap.isActive('blockquote')) blockLabel = 'Quote'
    if (tiptap.isActive('codeBlock')) blockLabel = 'Code'
    if (tiptap.isActive('table')) blockLabel = 'Table'
    if (tiptap.isActive('taskItem') || tiptap.isActive('taskList')) blockLabel = 'Task'
    if (tiptap.isActive('mermaid') || tiptap.isActive('dot')) blockLabel = 'Body'

    return {
      blockLabel,
      bold: tiptap.isActive('bold'),
      italic: tiptap.isActive('italic'),
      strike: tiptap.isActive('strike'),
      underline: tiptap.isActive('underline'),
      code: tiptap.isActive('code'),
      link: tiptap.isActive('link'),
    }
  }, [tiptap, editorMode])
  const latestFormatting = useRef(computeFormattingState)
  latestFormatting.current = computeFormattingState

  useEffect(() => {
    if (!tiptap) return
    const fire = () => {
      if (useAppStore.getState().currentDocument?.id !== documentId) return
      const state = computeFormattingState()
      if (formattingListenerRef.current) formattingListenerRef.current(state)
    }
    fire()
    tiptap.on('selectionUpdate', fire)
    tiptap.on('transaction', fire)
    return () => {
      tiptap.off('selectionUpdate', fire)
      tiptap.off('transaction', fire)
    }
  }, [tiptap, computeFormattingState, documentId])

  // All mode controls share the same fidelity-preserving transition.
  const modeRequest = useRef(0)
  useEffect(() => () => { modeRequest.current++ }, [])
  useEffect(() => {
    if (documentId) {
      const state = useAppStore.getState()
      const documents = state.documents.map(doc => doc.id === documentId && doc.mode !== editorMode ? { ...doc, mode: editorMode } : doc)
      if (documents.some((doc, i) => doc !== state.documents[i])) useAppStore.setState({ documents, currentDocument: documents.find(doc => doc.id === state.currentDocument?.id) ?? null })
    }
    if (active) onModeChange?.(editorMode)
  }, [documentId, active, editorMode, onModeChange])
  useEffect(() => { if (!active) { modeRequest.current++; isUpdatingFromMarkdown.current = false; previewGeneration.current++ } }, [active])
  const changeMode = (mode: EditorMode) => {
    const request = ++modeRequest.current
    isUpdatingFromMarkdown.current = false
    if (mode === editorMode) return
    if (mode === 'wysiwyg') {
      if (tiptap && currentDocument) {
        isUpdatingFromMarkdown.current = true
        requestAnimationFrame(() => {
          if (request !== modeRequest.current || tiptap.isDestroyed) return
          const text = source()
          if (lastTiptapSource.current !== text) {
            synchronizeRendered(tiptap, text)
            lastTiptapSemantic.current = fromWysiwygHtml(tiptap.getHTML())
          }
          lastTiptapSource.current = text
          isUpdatingFromMarkdown.current = false
          setEditorMode('wysiwyg')
        })
      } else {
        setEditorMode('wysiwyg')
      }
      return
    }
    // Tiptap edits already update canonical Markdown; switching must not serialize again.
    const view = editorViewRef.current
    if (view) {
      isSwitchingModeRef.current = true
      const text = source()
      const anchor = Math.min(lastMarkdownAnchorRef.current, text.length)
      synchronizeSource(view, text, anchor, config.collapseSource)
      lastMarkdownAnchorRef.current = anchor
      updatePreview(text)
      queueMicrotask(() => { isSwitchingModeRef.current = false })
    }
    setEditorMode('markdown')
    requestAnimationFrame(() => {
      if (request !== modeRequest.current) return
      if (editorRef.current && editorViewRef.current && editorViewRef.current.dom.parentElement !== editorRef.current) {
        editorRef.current.appendChild(editorViewRef.current.dom)
      }
      editorViewRef.current?.focus()
    })
  }

  // Expose editor methods to parent components (MenuBar integration)
  React.useImperativeHandle(ref, () => ({
    setMode: changeMode,
    openFind: (replace = false) => setFind(current => ({ open: true, replace, request: current.request + 1 })),
    getMarkdown: () => source(),
    setMarkdown: (content: string) => {
      updateDocumentContent(content)
      if (tiptap) synchronizeRendered(tiptap, content)
      if (tiptap) lastTiptapSemantic.current = fromWysiwygHtml(tiptap.getHTML())
      lastTiptapSource.current = content
      if (editorViewRef.current) {
        isSwitchingModeRef.current = true
        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: editorViewRef.current.state.doc.length,
            insert: content
          }
        })
        isSwitchingModeRef.current = false
        latestPreview.current(content)
      }
    },
    undo: () => {
      if (editorMode === 'wysiwyg' && tiptap) { tiptap.commands.undo(); return }
      if (editorViewRef.current) {
        undo(editorViewRef.current)
      }
    },
    redo: () => {
      if (editorMode === 'wysiwyg' && tiptap) { tiptap.commands.redo(); return }
      if (editorViewRef.current) {
        redo(editorViewRef.current)
      }
    },
    focus: () => {
      if (editorMode === 'wysiwyg' && tiptap) { tiptap.commands.focus(); return }
      if (editorViewRef.current) {
        editorViewRef.current.focus()
      }
    },
    getSelectionIdentity: () => {
      if (editorMode === 'wysiwyg') return tiptap && !tiptap.isDestroyed
        ? { editor: tiptap, selection: JSON.stringify({ mode: editorMode, selection: tiptap.state.selection.toJSON() }) } : null
      return editorViewRef.current
        ? { editor: editorViewRef.current, selection: JSON.stringify({ mode: editorMode, selection: editorViewRef.current.state.selection.toJSON() }) } : null
    },
    getSelection: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        const { from, to } = tiptap.state.selection
        return tiptap.state.doc.textBetween(from, to, '\n')
      }
      if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        const text = source(), coordinates = sourceCoordinates(text)
        return text.slice(coordinates.toSource(selection.from), coordinates.toSource(selection.to))
      }
      return ''
    },
    insertMarkdown: (text: string) => {
      if (editorMode === 'wysiwyg' && tiptap) {
        const { $from } = tiptap.state.selection
        const position = $from.depth ? $from.after(1) : tiptap.state.doc.content.size
        tiptap.chain().focus().insertContentAt(position, toWysiwygHtml(text)).run(); return
      }
      const view = editorViewRef.current
      if (view) view.dispatch(view.state.replaceSelection(text))
    },
    insertText: (text: string) => {
      if (editorMode === 'wysiwyg' && tiptap) {
        if (!text) { tiptap.commands.deleteSelection(); return }
        const content: JSONContent[] = []
        text.split(/\r\n?|\n/).forEach((line, index) => {
          if (index) content.push({ type: 'hardBreak' })
          if (line) content.push({ type: 'text', text: line })
        })
        tiptap.commands.insertContent(content)
        return
      }
      if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        editorViewRef.current.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: text
          },
          selection: { anchor: selection.from + text.length }
        })
      }
    },
    selectAll: () => {
      if (editorMode === 'wysiwyg' && tiptap) { tiptap.commands.selectAll(); return }
      if (editorViewRef.current) {
        editorViewRef.current.dispatch({
          selection: { anchor: 0, head: editorViewRef.current.state.doc.length }
        })
      }
    },
    getEditorView: () => editorViewRef.current,
    toggleBold: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleBold().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        toggleSourceMark(editorViewRef.current, '**', 'bold text')
      }
    },
    toggleItalic: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleItalic().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        toggleSourceMark(editorViewRef.current, '*', 'italic text')
      }
    },
    setHeadingLevel: (level: number) => {
      if (editorMode === 'wysiwyg' && tiptap) {
        const chain = tiptap.chain().focus()
        if (level === 0) {
          if (tiptap.isActive('codeBlock')) chain.toggleCodeBlock()
          if (tiptap.isActive('blockquote')) chain.toggleBlockquote()
          chain.setParagraph().run(); finishRenderedFormat(tiptap)
        } else {
          chain.setHeading({ level: Math.min(Math.max(level,1),6) as 1|2|3|4|5|6 }).run(); finishRenderedFormat(tiptap)
        }
      } else if (editorViewRef.current) {
        const hash = level > 0 ? '#'.repeat(level) + ' ' : ''
        const view = editorViewRef.current
        const sel = view.state.selection.main
        const doc = view.state.doc
        const fromLine = doc.lineAt(sel.from)
        const toLine = doc.lineAt(sel.to)
        if (level === 0 && clearSourceCode(view)) return
        let changes: { from: number, to: number, insert: string }[] = []
        for (let n = fromLine.number; n <= toLine.number; n++) {
          const line = doc.line(n)
          const text = line.text
          const newText = level === 0
            ? text.replace(/^\s{0,3}(>\s?)?#{1,6}\s?/, '').replace(/^\s{0,3}>\s?/, '')
            : text.replace(/^(\s{0,3}(?:>\s?)?)(?:#{1,6}\s*)?/, `$1${hash}`)
          if (newText !== text) changes.push({ from: line.from, to: line.to, insert: newText })
        }
        if (changes.length) {
          const transaction = view.state.update({ changes })
          view.dispatch({ changes, selection: { anchor: transaction.changes.mapPos(sel.to, 1) } })
        }
      }
    },
    toggleBulletList: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleBulletList().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        toggleSourceList(editorViewRef.current, 'bullet')
      }
    },
    toggleOrderedList: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleOrderedList().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        toggleSourceList(editorViewRef.current, 'ordered')
      }
    },
    insertHorizontalRule: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().setHorizontalRule().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert: '\n---\n' },
          selection: { anchor: selection.from + 5 }
        })
      }
    },
    toggleBlockquote: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleBlockquote().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        const view = editorViewRef.current
        const sel = view.state.selection.main
        const doc = view.state.doc
        const fromLine = doc.lineAt(sel.from)
        const toLine = doc.lineAt(sel.to)
        let allQuoted = true
        for (let n = fromLine.number; n <= toLine.number; n++) {
          if (!/^\s{0,3}>\s?/.test(doc.line(n).text)) { allQuoted = false; break }
        }
        let changes: { from: number, to: number, insert: string }[] = []
        for (let n = fromLine.number; n <= toLine.number; n++) {
          const line = doc.line(n)
          const text = line.text
          const newText = allQuoted ? text.replace(/^\s{0,3}>\s?/, '') : `> ${text}`
          if (newText !== text) changes.push({ from: line.from, to: line.to, insert: newText })
        }
        if (changes.length) {
          const transaction = view.state.update({ changes })
          view.dispatch({ changes, selection: { anchor: transaction.changes.mapPos(sel.to, 1) } })
        }
      }
    },
    toggleCodeBlock: () => {
      if (editorMode === 'wysiwyg' && tiptap) toggleRenderedCode(tiptap)
      else if (editorViewRef.current) toggleSourceCode(editorViewRef.current)
    },
    setLink: (url?: string) => {
      const href = url ?? (typeof window !== 'undefined' ? window.prompt('Enter URL', 'https://') || '' : '')
      if (editorMode === 'wysiwyg' && tiptap) {
        if (href) tiptap.chain().focus().setLink({ href }).run()
        else tiptap.chain().focus().unsetLink().run()
        finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        const selected = editorViewRef.current.state.doc.sliceString(selection.from, selection.to) || 'link text'
        const insert = href ? `[${selected}](${href})` : selected
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length }
        })
      }
    },
    toggleStrike: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleStrike().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        toggleSourceMark(editorViewRef.current, '~~', 'strikethrough text')
      }
    },
    toggleTask: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleTaskList().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        const view = editorViewRef.current
        const { from, to } = view.state.selection.main
        const start = view.state.doc.lineAt(from)
        const end = view.state.doc.lineAt(to > from && view.state.doc.lineAt(to).from === to ? to - 1 : to)
        const lines = Array.from({ length: end.number - start.number + 1 }, (_, index) => view.state.doc.line(start.number + index))
        const task = /^(\s*)[-*+]\s+\[[ xX]\]\s?/
        const remove = lines.every(line => task.test(line.text))
        const changes = lines.map(line => ({
          from: line.from, to: line.to,
          insert: remove ? line.text.replace(task, '$1') : task.test(line.text) ? line.text
            : line.text.replace(/^(\s*)(?:[-*+]\s+)?(.*)$/, '$1- [ ] $2'),
        }))
        const transaction = view.state.update({ changes })
        view.dispatch({ changes, selection: { anchor: transaction.changes.mapPos(to, 1) } })
        view.focus()
      }
    },
    insertTable: (rows: number, cols: number) => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
      } else if (editorViewRef.current) {
        const row = '| ' + Array(cols).fill('').join(' | ') + ' |'
        const separator = '| ' + Array(cols).fill('---').join(' | ') + ' |'
        const table = '\n\n' + [row, separator, ...Array(Math.max(0, rows - 1)).fill(row)].join('\n') + '\n\n'
        const view = editorViewRef.current
        const { from, to } = view.state.selection.main
        view.dispatch({ changes: { from, to, insert: table }, selection: { anchor: from + table.length } })
        view.focus()
      }
    },
    toggleUnderline: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleUnderline().run(); finishRenderedFormat(tiptap)
      } else if (editorViewRef.current) {
        toggleSourceMark(editorViewRef.current, '++', 'underlined')
      }
    },
    getFormattingState: () => computeFormattingState(),
    onFormattingChange: (listener) => { formattingListenerRef.current = listener }
  }))

  // Parse fenced blocks through the Markdown parser, then render only this preview generation.
  const previewGeneration = useRef(0)
  const dotPreviewAbort = useRef<AbortController | null>(null)
  useEffect(() => { if (!active || editorMode !== 'markdown') dotPreviewAbort.current?.abort(); return () => { dotPreviewAbort.current?.abort() } }, [active, editorMode])
  const updatePreview = useCallback((content: string) => {
    const container = previewRef.current
    if (!container || !active || useAppStore.getState().currentDocument?.id !== documentId) return
    dotPreviewAbort.current?.abort()
    const abort = dotPreviewAbort.current = new AbortController()
    const generation = ++previewGeneration.current
    const doc = useAppStore.getState().documents.find(item => item.id === documentId)
    const map = renderMappedMarkdown(content, { documentId: documentId ?? '', revision: doc?.revision ?? 0, generation }, config.syntaxHighlighting)
    previewMap.current = map
    container.innerHTML = map.html
    syncRef.current?.invalidate()
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-type="mermaid"]'))
    const blocks = elements.map((element, index) => ({
      id: `preview-${generation}-${index}`, chart: element.getAttribute('data-chart') ?? '', index,
    }))
    const dotElements = Array.from(container.querySelectorAll<HTMLElement>('[data-type="dot"]'))
    setDiagramCount(elements.length + dotElements.length)
    for (const element of dotElements) {
      const chart = element.getAttribute('data-chart') ?? ''
      element.textContent = 'Rendering DOT…'
      const owner = `${documentId}:${doc?.revision ?? 0}:${generation}`
      dotRenderer.render(chart, owner, abort.signal).then(svg => {
        const current = useAppStore.getState()
        if (!abort.signal.aborted && generation === previewGeneration.current && element.isConnected && current.currentDocument?.id === documentId && (current.documents.find(item => item.id === documentId)?.revision ?? 0) === map.owner.revision) {
          element.innerHTML = svg; syncRef.current?.invalidate()
        }
      }).catch(error => {
        if (!abort.signal.aborted && generation === previewGeneration.current && element.isConnected) { element.textContent = `DOT error: ${error.message}`; syncRef.current?.invalidate() }
      })
    }
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: isDark ? 'dark' : 'default' })
    requestAnimationFrame(async () => {
      for (const [index, element] of elements.entries()) {
        if (generation !== previewGeneration.current || !element.isConnected) return
        try {
          const { svg } = await mermaid.render(`preview-${generation}-${index}-${Date.now()}`, blocks[index].chart)
          if (generation === previewGeneration.current && element.isConnected) element.innerHTML = svg
        } catch (error) {
          if (generation === previewGeneration.current && element.isConnected) element.textContent = `Mermaid error: ${String(error)}`
        }
      }
    })
  }, [isDark, config.syntaxHighlighting, active, documentId])

  const latestPreview = useRef(updatePreview)
  latestPreview.current = updatePreview

  // Initialize CodeMirror editor when entering markdown mode (lazy init)
  useEffect(() => {
    if (editorMode !== 'markdown' || !active) return
    if (editorViewRef.current) return
    console.log('[EDITOR] useEffect triggered for editor initialization')
    console.log('[EDITOR] editorRef.current:', editorRef.current)

    // Wait for DOM to be ready
    const timer = setTimeout(() => {
      if (!editorRef.current) return

    console.log('[EDITOR] Theme is dark:', isDark)
    console.log('[EDITOR] Config theme:', config.theme)

    const defaultContent = source()

    console.log('[EDITOR] Creating CodeMirror editor with content length:', defaultContent.length)

    // Create CodeMirror editor state
    const state = EditorState.create({
      doc: defaultContent,
      extensions: [
        markdown({ base: markdownLanguage }),
        embeddedSourceFolds(),
        sourceSearchDecorations,
        highlighting.current.of(config.syntaxHighlighting ? [sourceCodeHighlighting] : []),
        CodeMirrorView.clipboardOutputFilter.of(() => {
          const view = editorViewRef.current
          if (!view) return ''
          const text = source(), coordinates = sourceCoordinates(text), selection = view.state.selection.main
          return text.slice(coordinates.toSource(selection.from), coordinates.toSource(selection.to))
        }),
        history(), // Enable undo/redo functionality
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        preferences.current.of([
          ...(config.wordWrap ? [CodeMirrorView.lineWrapping] : []),
          ...(config.wrapContinuation ? [wrapContinuation()] : []),
          EditorState.tabSize.of(config.tabWidth), ...(isDark ? [oneDark] : []),
        ]),
        drawSelection(),
        CodeMirrorView.updateListener.of((update) => {
          if (isSwitchingModeRef.current) return
          if (update.selectionSet) {
            lastMarkdownAnchorRef.current = update.state.selection.main.anchor
            syncRef.current?.selection()
            captureView.current()
          }
          if (update.geometryChanged) syncRef.current?.invalidate()
          if ((update.selectionSet || update.docChanged) && useAppStore.getState().currentDocument?.id === documentId) formattingListenerRef.current?.(latestFormatting.current())
          if (update.docChanged) {
            const prior = source()
            const newContent = editorText(prior) === update.startState.doc.toString() ? applyEditorChanges(prior, update.changes, sourceNewline.current) : update.state.doc.toString()
            console.log('[EDITOR] Content changed, length:', newContent.length)
            updateDocumentContent(newContent)
            latestPreview.current(newContent)
          }
        }),
        CodeMirrorView.theme({
          '&': {
            height: '100%',
            minHeight: '0',
            fontSize: 'var(--editor-font-size, 14px)', // Support zoom functionality
            fontFamily: 'var(--source-font-family, monospace)'
          },
          '.cm-content': {
            padding: '16px',
            minHeight: '100%'
          },
          '.cm-focused': {
            outline: 'none'
          },
          '.cm-editor': {
            height: '100%'
          },
          '.cm-scroller': {
            fontFamily: 'inherit',
            overflowX: 'auto'
          }
        }),
      ]
    })

    // Create and mount the editor
    const view = new CodeMirrorView({
      state,
      parent: editorRef.current
    })

    editorViewRef.current = view
    setSourceView(view)
    console.log('[EDITOR] CodeMirror editor created successfully')

    // A fresh source engine starts at zero; retained engines keep their own selection.
    const anchor = Math.min(
      lastMarkdownAnchorRef.current,
      view.state.doc.length
    )
    try {
      view.dispatch({ selection: { anchor, head: Math.min(initialViewState.current?.sourceHead ?? anchor, view.state.doc.length) } })
      requestAnimationFrame(() => {
        if (editorViewRef.current !== view) return
        view.scrollDOM.scrollTop = initialViewState.current?.sourceScroll ?? 0
        if (previewScrollRef.current) previewScrollRef.current.scrollTop = initialViewState.current?.previewScroll ?? 0
      })
      view.focus()
    } catch {}

    if (config.collapseSource) view.dispatch({ effects: findEmbeddedSource(view.state).map(range => foldEffect.of(range)) })

    // Initial preview update
    // Force equal split at mount
    setSplitPos(50)
    updatePreview(defaultContent)

    }, 100) // 100ms delay to ensure DOM is ready

    return () => {
      clearTimeout(timer)
      // Keep CodeMirror view alive across mode switches to preserve selection/state
    }
  }, [source, active, editorMode, documentId, currentDocument?.id, isDark, config.theme, config.syntaxHighlighting, config.wordWrap, config.wrapContinuation, config.tabWidth, config.collapseSource, updatePreview, updateDocumentContent])

  useEffect(() => {
    editorViewRef.current?.dispatch({ effects: preferences.current.reconfigure([
      ...(config.wordWrap ? [CodeMirrorView.lineWrapping] : []), EditorState.tabSize.of(config.tabWidth), ...(isDark ? [oneDark] : []),
      ...(config.wrapContinuation ? [wrapContinuation()] : []),
    ]) })
  }, [isDark, config.wordWrap, config.wrapContinuation, config.tabWidth])

  useEffect(() => {
    editorViewRef.current?.dispatch({ effects: highlighting.current.reconfigure(config.syntaxHighlighting ? [sourceCodeHighlighting] : []) })
    if (tiptap && !tiptap.isDestroyed) tiptap.view.dispatch(tiptap.state.tr.setMeta(codeHighlightKey, config.syntaxHighlighting).setMeta('addToHistory', false))
  }, [config.syntaxHighlighting, tiptap])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    if (config.collapseSource) view.dispatch({ effects: findEmbeddedSource(view.state).map(range => foldEffect.of(range)) })
    else unfoldAll(view)
  }, [config.collapseSource])

  // Ensure preview and editor are restored when switching back to markdown
  useEffect(() => {
    if (editorMode === 'markdown' && active) {
      // Reattach editor DOM if needed
      if (editorRef.current && editorViewRef.current) {
        try {
          if (editorViewRef.current.dom.parentElement !== editorRef.current) {
            editorRef.current.appendChild(editorViewRef.current.dom)
          }
        } catch {}
      }
      // Defer preview update until ref is mounted
      requestAnimationFrame(() => {
        const current = useAppStore.getState().documents.find(doc => doc.id === documentId)
        if (current) updatePreview(current.content)
      })
    }
  }, [active, documentId, editorMode, currentDocument?.id, updatePreview])

  // Update CodeMirror content only when switching docs (not on every keystroke from WYSIWYG)
  useEffect(() => {
    if (editorMode !== 'markdown' || !active) return
    if (editorViewRef.current && currentDocument) {
      const view = editorViewRef.current
      const oldDoc = view.state.doc.toString()
      if (oldDoc !== editorText(currentDocument.content || '')) {
        isSwitchingModeRef.current = true
        const prevAnchor = lastMarkdownAnchorRef.current
        const newLen = (currentDocument.content || '').length
        synchronizeSource(view, currentDocument.content || '', Math.min(prevAnchor, newLen), config.collapseSource)
        view.focus()
        lastMarkdownAnchorRef.current = Math.min(prevAnchor, newLen)
        updatePreview(currentDocument.content || '')
        queueMicrotask(() => { isSwitchingModeRef.current = false })
      }
    }
  }, [active, editorMode, currentDocument, updatePreview, config.collapseSource])

  useEffect(() => () => {
    editorViewRef.current?.destroy()
    editorViewRef.current = null
  }, [])

  // Persist view state separately from content/revision/history. The ID remains captured.
  useEffect(() => {
    if (!documentId || !active) return
    let frame = 0
    const save = () => {
      frame = 0
      const state = useAppStore.getState()
      if (state.currentDocument?.id !== documentId) return
      const patch: NonNullable<import('../store/useAppStore').Document['viewState']> = {}
      if (sourceView) Object.assign(patch, { sourceAnchor: sourceView.state.selection.main.anchor, sourceHead: sourceView.state.selection.main.head, sourceScroll: sourceView.scrollDOM.scrollTop, previewScroll: previewScrollRef.current?.scrollTop ?? 0 })
      if (tiptap && !tiptap.isDestroyed) Object.assign(patch, { renderedAnchor: tiptap.state.selection.anchor, renderedHead: tiptap.state.selection.head, renderedScroll: wysiwygContainerRef.current?.scrollTop ?? 0 })
      state.rememberView(documentId, patch)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(save) }
    captureView.current = schedule
    sourceView?.scrollDOM.addEventListener('scroll', schedule)
    sourceView?.dom.addEventListener('keyup', schedule)
    sourceView?.dom.addEventListener('pointerup', schedule)
    const wys = wysiwygContainerRef.current, preview = previewScrollRef.current
    wys?.addEventListener('scroll', schedule); preview?.addEventListener('scroll', schedule)
    tiptap?.on('selectionUpdate', schedule)
    document.addEventListener('selectionchange', schedule)
    return () => {
      cancelAnimationFrame(frame)
      if (captureView.current === schedule) captureView.current = () => {}
      sourceView?.scrollDOM.removeEventListener('scroll', schedule); sourceView?.dom.removeEventListener('keyup', schedule); sourceView?.dom.removeEventListener('pointerup', schedule)
      wys?.removeEventListener('scroll', schedule); preview?.removeEventListener('scroll', schedule)
      tiptap?.off('selectionUpdate', schedule); document.removeEventListener('selectionchange', schedule)
    }
  }, [sourceView, tiptap, active, documentId])

  // Attach after actual lazy engine creation; each active session owns all jobs/listeners.
  useEffect(() => {
    if (!sourceView || !active || editorMode !== 'markdown' || !config.syncPreview || !previewRef.current || !previewScrollRef.current) return
    const controller = synchronizePreview({ view: sourceView, root: previewRef.current, scroller: previewScrollRef.current,
      getMap: () => previewMap.current, getSource: source,
      valid: map => {
        const state = useAppStore.getState(), doc = state.documents.find(item => item.id === documentId)
        return state.currentDocument?.id === documentId && map === previewMap.current && map.owner.documentId === documentId && map.owner.revision === (doc?.revision ?? 0)
      },
    })
    syncRef.current = controller
    return () => { controller.dispose(); if (syncRef.current === controller) syncRef.current = null }
  }, [sourceView, active, editorMode, config.syncPreview, documentId, source])

  if (!currentDocument) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            margin: '0 0 1rem 0',
            color: 'var(--text-primary)',
            fontWeight: 600
          }}>
            Welcome to MarkWriter
          </h2>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Create a new document or open an existing one to get started.
          </p>
        </div>
      </div>
    )
  }

    const isEmpty = (currentDocument?.content || '').trim().length === 0

    return (
    <div className="document-editor-session">
    <FindReplace documentId={documentId} source={currentDocument.content} view={sourceView} editor={tiptap}
      mode={editorMode} active={active} open={find.open} replace={find.replace} request={find.request}
      onClose={() => { setFind(current => ({ ...current, open: false })); if (editorMode === 'markdown') sourceView?.focus(); else tiptap?.commands.focus() }}
      onSource={() => changeMode('markdown')} />
    <div
      className="editor-container"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: editorMode === 'wysiwyg' ? 'column' : 'row',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
        position: 'relative'
      }}
      ref={containerRef}
    >
      {editorMode === 'wysiwyg' && active && <TableTools editor={tiptap} />}
      <div style={{ display: editorMode === 'markdown' ? 'flex' : 'none', flex: 1, minWidth: 0 }}>
          {/* Editor Pane */}
          <div style={{
            flexBasis: `${splitPos}%`,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border-color)'
          }}>
            <div style={{
              padding: '8px 16px',
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)'
            }}>
              Markdown
              <span className="source-fold-actions">
                <button type="button" title="Collapse embedded source (⌘⌥[ / Ctrl⇧[)" onClick={() => {
                  const view = editorViewRef.current
                  if (view) view.dispatch({ effects: findEmbeddedSource(view.state).map(range => foldEffect.of(range)) })
                }}>Collapse source</button>
                <button type="button" onClick={() => { const view = editorViewRef.current; if (view) unfoldAll(view) }}>Expand source</button>
              </span>
            </div>
            <div
              ref={editorRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                backgroundColor: 'var(--bg-primary)',
                fontSize: 'var(--editor-font-size, 14px)' // Support zoom
              }}
            />
            {isEmpty && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ textAlign: 'center', fontSize: '0.95rem' }}>Start editing or Open file</div>
              </div>
            )}
          </div>

          {/* Splitter */}
          <div
            onMouseDown={() => {
              isDraggingSplit.current = true
              const container = containerRef.current
              const onMove = (ev: MouseEvent) => {
                if (!isDraggingSplit.current || !container) return
                const rect = container.getBoundingClientRect()
                const x = Math.min(Math.max(ev.clientX - rect.left, rect.width * 0.2), rect.width * 0.8)
                const pct = (x / rect.width) * 100
                setSplitPos(Math.min(Math.max(pct, 20), 80))
              }
              const onUp = () => {
                isDraggingSplit.current = false
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
            style={{ width: '6px', cursor: 'col-resize', background: 'var(--bg-secondary)' }}
          />

          {/* Preview Pane */}
          <div style={{
            flexBasis: `${100 - splitPos}%`,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '8px 16px',
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)'
            }}>
              Preview {diagramCount > 0 && (
                <span style={{
                  fontSize: '12px',
                  opacity: 0.7,
                  marginLeft: '8px'
                }}>
                  ({diagramCount} diagram{diagramCount !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div ref={previewScrollRef} style={{
              flex: 1,
              overflow: 'auto',
              backgroundColor: 'var(--bg-primary)',
              position: 'relative'
            }}>
              {/* HTML Preview */}
              <div
                ref={previewRef}
                className="markwriter-preview" role="region" aria-label="Read-only Markdown preview" tabIndex={0}
                style={{
                  padding: '16px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--rendered-font-family, system-ui)',
                  lineHeight: 'var(--rendered-line-height, 1.6)',
                  fontSize: 'var(--preview-font-size, 16px)' // Support zoom for preview
                }}
              />
              {isEmpty && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ textAlign: 'center', fontSize: '0.95rem' }}>Start editing or Open file</div>
                </div>
              )}
            </div>
          </div>
      </div>
        {/* WYSIWYG stays mounted to preserve editor history and NodeViews. */}
        <div style={{
          flex: 1,
          display: editorMode === 'wysiwyg' ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '8px 16px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-primary)'
          }}>
            WYSIWYG Editor
          </div>
          <div ref={wysiwygContainerRef} style={{ position: 'relative', flex: 1, overflow: 'auto', backgroundColor: 'var(--bg-primary)'}}>
            <EditorContent editor={tiptap} />
            {isEmpty && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ textAlign: 'center', fontSize: '0.95rem' }}>Start editing or Open file</div>
              </div>
            )}
          </div>
        </div>


    </div></div>
  )
})

DocumentEditor.displayName = 'DocumentEditor'

// Both editing engines and their undo histories belong to one document.
export const EditorView = forwardRef<EditorViewRef, EditorViewProps>((props, ref) => {
  const documents = useAppStore(state => state.documents)
  const id = useAppStore(state => state.currentDocument?.id)
  if (!documents.length) return <DocumentEditor active ref={ref} {...props} />
  return <>{documents.map(doc => <div key={doc.id} data-active={doc.id === id} data-document-id={doc.id} hidden={doc.id !== id}
    style={{ display: doc.id === id ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
    <DocumentEditor documentId={doc.id} active={doc.id === id} ref={doc.id === id ? ref : undefined} {...props} />
  </div>)}</>
})
EditorView.displayName = 'EditorView'
