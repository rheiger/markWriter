import React, { useEffect, useRef, forwardRef, useState, useCallback } from 'react'
import { EditorView as CodeMirrorView, keymap, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { marked } from 'marked'
import { useAppStore } from '../store/useAppStore'
import { MermaidRenderer } from './MermaidRenderer'
import './EditorView.css'
import { useEditor, EditorContent } from '@tiptap/react'
import mermaid from 'mermaid'
import StarterKit from '@tiptap/starter-kit'
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
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from 'lowlight'
import MarkdownIt from 'markdown-it'
import markdownItIns from 'markdown-it-ins'
import TurndownService from 'turndown'
// @ts-expect-error types
import { gfm } from 'turndown-plugin-gfm'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { MermaidNode } from '../extensions/MermaidNode'


export interface EditorViewRef {
  getMarkdown: () => string
  setMarkdown: (content: string) => void
  // CodeMirror 6 specific methods for menu integration
  undo: () => void
  redo: () => void
  focus: () => void
  getSelection: () => string
  insertText: (text: string) => void
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

interface MermaidBlock {
  id: string
  chart: string
  index: number
}

export const EditorView = forwardRef<EditorViewRef>((_props, ref) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<CodeMirrorView | null>(null)
  const [mermaidBlocks, setMermaidBlocks] = useState<MermaidBlock[]>([])
  const [editorMode, setEditorMode] = useState<'markdown' | 'wysiwyg'>('wysiwyg')
  const [splitPos, setSplitPos] = useState<number>(50)
  const isDraggingSplit = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isSyncingFromEditor = useRef(false)
  const isSyncingFromPreview = useRef(false)
  const positionMarkerRef = useRef<HTMLDivElement>(null)
  const wysiwygContainerRef = useRef<HTMLDivElement>(null)
  const isUpdatingFromTiptap = useRef(false)
  const isUpdatingFromMarkdown = useRef(false)
  const isSwitchingModeRef = useRef(false)
  const lastMarkdownAnchorRef = useRef(0)
  const formattingListenerRef = useRef<null | ((state: any) => void)>(null)

  const { currentDocument, updateDocumentContent, config } = useAppStore()

  // Configure Marked to support extended underline syntax ++text++ for Preview
  React.useMemo(() => {
    const underlineExt = {
      name: 'underline',
      level: 'inline' as const,
      start: (src: string) => src.indexOf('++'),
      tokenizer(src: string) {
        const rule = /^\+\+([\s\S]+?)\+\+/
        const match = rule.exec(src)
        if (match) {
          return {
            type: 'underline',
            raw: match[0],
            text: match[1]
          }
        }
        return undefined
      },
      renderer(token: any) {
        return `<u>${token.text}</u>`
      }
    }
    marked.use({ extensions: [underlineExt] as any })
  }, [])

  // Markdown <-> HTML converter for initial Tiptap content
  const md = React.useMemo(() => {
    const m = new MarkdownIt({ html: false, linkify: true, breaks: true })
    m.use(markdownItIns)
    return m
  }, [])
  const turndown = React.useMemo(() => {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

    // Convert HTML tables to GFM tables (robust against colgroups/inline wrappers)
    td.addRule('tableToMarkdown', {
      filter: (node) => node.nodeName === 'TABLE',
      replacement: (_content, node) => {
        const table = node as HTMLElement
        const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('th,td')).map(cell => (cell.textContent || '').trim())
        )
        if (rows.length === 0) return ''
        const header = rows[0]
        let md = '\n| ' + header.join(' | ') + ' |\n'
        md += '| ' + header.map(() => '---').join(' | ') + ' |\n'
        for (let i = 1; i < rows.length; i++) md += '| ' + rows[i].join(' | ') + ' |\n'
        return md + '\n'
      }
    })

    // Task list items: <li><input type="checkbox"> ... -> - [ ] text
    td.addRule('taskListItem', {
      filter: (node) => node.nodeName === 'LI' && !!(node as HTMLElement).querySelector('input[type="checkbox"]'),
      replacement: (_content, node) => {
        const el = node as HTMLElement
        const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
        const checked = input?.checked ? 'x' : ' '
        // Extract text content without checkbox
        const clone = el.cloneNode(true) as HTMLElement
        clone.querySelectorAll('input[type="checkbox"]').forEach(inp => inp.remove())
        const text = (clone.textContent || '').trim()
        return `\n- [${checked}] ${text}\n`
      }
    })

    // Serialize Mermaid NodeViews/divs back to fenced code
    td.addRule('mermaid', {
      filter: (node) => {
        if (node.nodeType !== 1) return false
        const el = node as HTMLElement
        return el.getAttribute('data-type') === 'mermaid' || el.classList?.contains('mermaid')
      },
      replacement: (_content, node) => {
        const el = node as HTMLElement
        const chart = (el.getAttribute('data-chart') || el.textContent || '').trim()
        return `\n\`\`\`mermaid\n${chart}\n\`\`\`\n`
      }
    })

    // Serialize underline tags as extended markdown ++text++
    td.addRule('underline', {
      filter: ['u', 'ins'],
      replacement: (content) => `++${content}++`
    })

    // Remove colgroup/col so GFM table conversion works
    td.addRule('removeColgroup', {
      filter: (node) => node.nodeName === 'COLGROUP' || node.nodeName === 'COL',
      replacement: () => ''
    })

    // Unwrap <p> inside table cells to avoid nested paragraphs in table markdown
    td.addRule('unwrapParagraphInCells', {
      filter: (node) => node.nodeName === 'P' && !!node.parentElement && (node.parentElement.nodeName === 'TD' || node.parentElement.nodeName === 'TH'),
      replacement: (content) => content
    })

    // Unwrap <p> inside list items to avoid blank lines between list items
    td.addRule('unwrapParagraphInLi', {
      filter: (node) => node.nodeName === 'P' && !!node.parentElement && node.parentElement.nodeName === 'LI',
      replacement: (content) => content
    })

    // enable GitHub-flavored markdown (tables, strikethrough, task lists)
    td.use(gfm)

    return td
  }, [])

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
      CodeBlockLowlight.configure({ lowlight }),
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
      Link,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      MermaidNode,
    ],
    content: currentDocument?.content ? md.render(currentDocument.content) : '',
    onUpdate: ({ editor }) => {
      if (isUpdatingFromMarkdown.current) return
      isUpdatingFromTiptap.current = true
      const html = editor.getHTML()
      const markdownFromHtml = turndown.turndown(html)
      updateDocumentContent(markdownFromHtml)
      // Defer clearing the update flag until after the selection is applied
      queueMicrotask(() => { isUpdatingFromTiptap.current = false })
    },
    editable: true,
    autofocus: false,
  })

  // Compute formatting state for WYSIWYG toolbar label
  const computeFormattingState = useCallback(() => {
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
    if (tiptap.isActive('mermaid')) blockLabel = 'Body'

    return {
      blockLabel,
      bold: tiptap.isActive('bold'),
      italic: tiptap.isActive('italic'),
      strike: tiptap.isActive('strike'),
      underline: tiptap.isActive('underline'),
      code: tiptap.isActive('code'),
      link: tiptap.isActive('link'),
    }
  }, [tiptap])

  useEffect(() => {
    if (!tiptap) return
    const fire = () => {
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
  }, [tiptap, computeFormattingState])

  // Helper to convert markdown → HTML for WYSIWYG and map mermaid fences
  const toWysiwygHtml = useCallback((markdownText: string): string => {
    let html = md.render(markdownText || '')
    // Normalize <ins> to <u> for Tiptap Underline parsing
    html = html.replace(/<ins>/g, '<u>').replace(/<\/ins>/g, '</u>')
    const re = new RegExp('<pre><code class="language-mermaid">([\\s\\S]*?)<\\/code><\\/pre>', 'g')
    html = html.replace(re, (_m, code) => {
      const decoded = String(code)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
      return `<div class="mermaid">${decoded}</div>`
    })
    return html
  }, [md])

  // Keep tiptap in sync when switching documents (avoid resetting caret on every keystroke)
  useEffect(() => {
    if (tiptap && currentDocument) {
      if (isUpdatingFromTiptap.current) return
      const html = toWysiwygHtml(currentDocument.content || '')
      if (tiptap.getHTML() !== html) {
        isUpdatingFromMarkdown.current = true
        tiptap.commands.setContent(html)
        isUpdatingFromMarkdown.current = false
      }
      // Mermaid diagrams are rendered by MermaidNode's React NodeView
    }
  }, [tiptap, currentDocument?.id, config.theme, toWysiwygHtml])

  // When entering WYSIWYG or when content changes while in Markdown, ensure WYSIWYG reflects store
  // Avoid setContent during lifecycle; we'll sync WYSIWYG explicitly on tab click

  // Expose editor methods to parent components (MenuBar integration)
  React.useImperativeHandle(ref, () => ({
    getMarkdown: () => editorViewRef.current?.state.doc.toString() || '',
    setMarkdown: (content: string) => {
      if (editorViewRef.current) {
        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: editorViewRef.current.state.doc.length,
            insert: content
          }
        })
      }
    },
    undo: () => {
      if (editorViewRef.current) {
        undo(editorViewRef.current)
      }
    },
    redo: () => {
      if (editorViewRef.current) {
        redo(editorViewRef.current)
      }
    },
    focus: () => {
      if (editorViewRef.current) {
        editorViewRef.current.focus()
      }
    },
    getSelection: () => {
      if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        return editorViewRef.current.state.doc.sliceString(selection.from, selection.to)
      }
      return ''
    },
    insertText: (text: string) => {
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
      if (editorViewRef.current) {
        editorViewRef.current.dispatch({
          selection: { anchor: 0, head: editorViewRef.current.state.doc.length }
        })
      }
    },
    getEditorView: () => editorViewRef.current,
    toggleBold: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleBold().run()
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        const selected = editorViewRef.current.state.doc.sliceString(selection.from, selection.to) || 'bold text'
        const insert = `**${selected}**`
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length }
        })
      }
    },
    toggleItalic: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleItalic().run()
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        const selected = editorViewRef.current.state.doc.sliceString(selection.from, selection.to) || 'italic text'
        const insert = `*${selected}*`
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length }
        })
      }
    },
    setHeadingLevel: (level: number) => {
      if (editorMode === 'wysiwyg' && tiptap) {
        const chain = tiptap.chain().focus()
        if (level === 0) {
          if (tiptap.isActive('codeBlock')) chain.toggleCodeBlock()
          if (tiptap.isActive('blockquote')) chain.toggleBlockquote()
          chain.setParagraph().run()
        } else {
          chain.setHeading({ level: Math.min(Math.max(level,1),6) as 1|2|3|4|5|6 }).run()
        }
      } else if (editorViewRef.current) {
        const hash = level > 0 ? '#'.repeat(level) + ' ' : ''
        const view = editorViewRef.current
        const sel = view.state.selection.main
        const doc = view.state.doc
        const fromLine = doc.lineAt(sel.from)
        const toLine = doc.lineAt(sel.to)
        // If switching to Body, also remove fenced code if the whole selection is fenced
        if (level === 0) {
          const selectedText = doc.sliceString(fromLine.from, toLine.to)
          const fencedStart = selectedText.match(/^\s*```.*?\n/)
          const fencedEnd = selectedText.match(/\n```\s*$/)
          if (fencedStart && fencedEnd) {
            const withoutFence = selectedText
              .replace(/^\s*```.*?\n/, '')
              .replace(/\n```\s*$/, '')
            view.dispatch({ changes: { from: fromLine.from, to: toLine.to, insert: withoutFence } })
            return
          }
        }
        let changes: { from: number, to: number, insert: string }[] = []
        for (let n = fromLine.number; n <= toLine.number; n++) {
          const line = doc.line(n)
          const text = line.text
          const newText = level === 0
            ? text.replace(/^\s{0,3}(>\s?)?#{1,6}\s?/, '').replace(/^\s{0,3}>\s?/, '')
            : text.replace(/^(\s{0,3}(?:>\s?)?)(?:#{1,6}\s*)?/, `$1${hash}`)
          if (newText !== text) changes.push({ from: line.from, to: line.to, insert: newText })
        }
        if (changes.length) view.dispatch({ changes })
      }
    },
    toggleBulletList: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleBulletList().run()
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert: '\n- ' },
          selection: { anchor: selection.from + 3 }
        })
      }
    },
    toggleOrderedList: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleOrderedList().run()
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert: '\n1. ' },
          selection: { anchor: selection.from + 4 }
        })
      }
    },
    insertHorizontalRule: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().setHorizontalRule().run()
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
        tiptap.chain().focus().toggleBlockquote().run()
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
        if (changes.length) view.dispatch({ changes })
      }
    },
    toggleCodeBlock: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleCodeBlock().run()
      } else if (editorViewRef.current) {
        const view = editorViewRef.current
        const sel = view.state.selection.main
        const doc = view.state.doc
        const fromLine = doc.lineAt(sel.from)
        const toLine = doc.lineAt(sel.to)
        // Determine if all selected lines are already fenced
        const selectedText = doc.sliceString(fromLine.from, toLine.to)
        const isFenced = /^\s*```[\s\S]*```\s*$/.test(selectedText)
        if (isFenced) {
          const withoutFence = selectedText.replace(/^\s*```\n?/, '').replace(/\n?```\s*$/, '')
          view.dispatch({ changes: { from: fromLine.from, to: toLine.to, insert: withoutFence } })
        } else {
          const withFence = `\n\n\`\`\`\n${selectedText}\n\`\`\`\n\n`
          view.dispatch({ changes: { from: fromLine.from, to: toLine.to, insert: withFence } })
        }
      }
    },
    setLink: (url?: string) => {
      const href = url ?? (typeof window !== 'undefined' ? window.prompt('Enter URL', 'https://') || '' : '')
      if (editorMode === 'wysiwyg' && tiptap) {
        if (href) tiptap.chain().focus().setLink({ href }).run()
        else tiptap.chain().focus().unsetLink().run()
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
    toggleStrike: () => { if (editorMode === 'wysiwyg' && tiptap) tiptap.chain().focus().toggleStrike().run() },
    toggleTask: () => { if (editorMode === 'wysiwyg' && tiptap) tiptap.chain().focus().toggleTaskList().run() },
    insertTable: (rows: number, cols: number) => { if (editorMode === 'wysiwyg' && tiptap) tiptap.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run() }
    ,
    toggleUnderline: () => {
      if (editorMode === 'wysiwyg' && tiptap) {
        tiptap.chain().focus().toggleUnderline().run()
      } else if (editorViewRef.current) {
        const selection = editorViewRef.current.state.selection.main
        const selected = editorViewRef.current.state.doc.sliceString(selection.from, selection.to) || 'underlined'
        const insert = `++${selected}++`
        editorViewRef.current.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length }
        })
      }
    },
    getFormattingState: () => computeFormattingState(),
    onFormattingChange: (listener) => { formattingListenerRef.current = listener }
  }))

  // Parse mermaid blocks from markdown content
  // Parse mermaid blocks from markdown content
  const parseMermaidBlocks = useCallback((content: string): MermaidBlock[] => {
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g
    const blocks: MermaidBlock[] = []
    let match
    let index = 0

    while ((match = mermaidRegex.exec(content)) !== null) {
      blocks.push({
        id: `mermaid-${index}-${Date.now()}`,
        chart: match[1].trim(),
        index: index++
      })
    }

    return blocks
  }, [])

  // Update preview with mermaid support
  const updatePreview = useCallback((content: string) => {
    if (!previewRef.current) return

    try {
      // Parse mermaid blocks first
      const blocks = parseMermaidBlocks(content)
      setMermaidBlocks(blocks)

      // Replace mermaid blocks with placeholders for HTML rendering
      let processedContent = content
      blocks.forEach((_, index) => {
        const placeholder = `<div class="mermaid-placeholder" data-mermaid-index="${index}">[Mermaid Diagram ${index + 1}]</div>`
        processedContent = processedContent.replace(
          /```mermaid\n[\s\S]*?```/,
          placeholder
        )
      })

      // Parse markdown to HTML
      const html = marked.parse(processedContent)
      previewRef.current.innerHTML = html

      // Render mermaid diagrams in-place inside placeholders
      const isDark = config.theme === 'dark' || (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: isDark ? 'dark' : 'default' })
      requestAnimationFrame(async () => {
        if (!previewRef.current) return
        const placeholders = Array.from(previewRef.current.querySelectorAll('.mermaid-placeholder')) as HTMLElement[]
        await Promise.all(
          placeholders.map(async (el, i) => {
            const chart = blocks[i]?.chart || ''
            const id = `mermaid-${i}-${Date.now()}`
            try {
              const { svg } = await mermaid.render(id, chart)
              el.innerHTML = svg
            } catch (e) {
              el.innerHTML = `<pre style="color:#dc2626">Mermaid error: ${String(e)}</pre>`
            }
          })
        )
      })

      console.log('[EDITOR] Preview updated with', blocks.length, 'mermaid diagrams')
    } catch (error) {
      console.error('Error parsing markdown:', error)
      if (previewRef.current) {
        previewRef.current.innerHTML = `<p>Error parsing markdown: ${error}</p>`
      }
    }
  }, [parseMermaidBlocks, config.theme])

  // Initialize CodeMirror editor when entering markdown mode (lazy init)
  useEffect(() => {
    if (editorMode !== 'markdown') return
    if (editorViewRef.current) return
    console.log('[EDITOR] useEffect triggered for editor initialization')
    console.log('[EDITOR] editorRef.current:', editorRef.current)
    console.log('[EDITOR] currentDocument:', currentDocument)

    // Wait for DOM to be ready
    const timer = setTimeout(() => {
      if (!editorRef.current) return

    const isDark = config.theme === 'dark' ||
      (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    console.log('[EDITOR] Theme is dark:', isDark)
    console.log('[EDITOR] Config theme:', config.theme)

    const defaultContent = currentDocument?.content ?? ''

    console.log('[EDITOR] Creating CodeMirror editor with content length:', defaultContent.length)

    // Create CodeMirror editor state
    const state = EditorState.create({
      doc: defaultContent,
      extensions: [
        markdown(),
        history(), // Enable undo/redo functionality
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        CodeMirrorView.lineWrapping,
        drawSelection(),
        CodeMirrorView.updateListener.of((update) => {
          if (isSwitchingModeRef.current) return
          if (update.selectionSet) {
            lastMarkdownAnchorRef.current = update.state.selection.main.anchor
          }
          if (update.docChanged) {
            const newContent = update.state.doc.toString()
            console.log('[EDITOR] Content changed, length:', newContent.length)
            updateDocumentContent(newContent)
            updatePreview(newContent)
          }
        }),
        CodeMirrorView.theme({
          '&': {
            fontSize: 'var(--editor-font-size, 14px)', // Support zoom functionality
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
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
            overflowX: 'hidden', // prevent horizontal scrolling, wrap instead
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }
        }),
        ...(isDark ? [oneDark] : [])
      ]
    })

    // Create and mount the editor
    const view = new CodeMirrorView({
      state,
      parent: editorRef.current
    })

    editorViewRef.current = view
    console.log('[EDITOR] CodeMirror editor created successfully')

    // Restore previous caret position if available; otherwise place at end
    const anchor = Math.min(
      lastMarkdownAnchorRef.current || defaultContent.length,
      defaultContent.length
    )
    try {
      view.dispatch({ selection: { anchor } })
      view.focus()
    } catch {}

    // Initial preview update
    // Force equal split at mount
    setSplitPos(50)
    updatePreview(defaultContent)

    }, 100) // 100ms delay to ensure DOM is ready

    return () => {
      clearTimeout(timer)
      // Keep CodeMirror view alive across mode switches to preserve selection/state
    }
  }, [editorMode, currentDocument?.id, config.theme, updatePreview, updateDocumentContent])

  // Ensure preview and editor are restored when switching back to markdown
  useEffect(() => {
    if (editorMode === 'markdown') {
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
        if (currentDocument) {
          updatePreview(currentDocument.content || '')
        }
      })
    }
  }, [editorMode, currentDocument?.id, updatePreview])

  // Always start in WYSIWYG when opening or creating a document
  useEffect(() => {
    if (currentDocument?.id) {
      setEditorMode('wysiwyg')
    }
  }, [currentDocument?.id])

  // Update CodeMirror content only when switching docs (not on every keystroke from WYSIWYG)
  useEffect(() => {
    if (editorMode !== 'markdown') return
    if (editorViewRef.current && currentDocument) {
      const view = editorViewRef.current
      const oldDoc = view.state.doc.toString()
      if (oldDoc !== (currentDocument.content || '')) {
        isSwitchingModeRef.current = true
        const prevAnchor = lastMarkdownAnchorRef.current || view.state.selection.main.anchor
        const newLen = (currentDocument.content || '').length
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: currentDocument.content || '' },
          selection: { anchor: Math.min(prevAnchor, newLen) }
        })
        view.focus()
        lastMarkdownAnchorRef.current = Math.min(prevAnchor, newLen)
        updatePreview(currentDocument.content || '')
        queueMicrotask(() => { isSwitchingModeRef.current = false })
      }
    }
  }, [editorMode, currentDocument?.content, updatePreview])

  // Scroll synchronization between editor and preview
  useEffect(() => {
    const cm = editorViewRef.current?.scrollDOM
    const pv = previewScrollRef.current
    if (!cm || !pv) return

    const onCmScroll = () => {
      if (isSyncingFromPreview.current) return
      isSyncingFromEditor.current = true
      const ratio = cm.scrollTop / Math.max(1, cm.scrollHeight - cm.clientHeight)
      pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight)
      if (positionMarkerRef.current) positionMarkerRef.current.style.top = `${ratio * 100}%`
      isSyncingFromEditor.current = false
    }

    const onPvScroll = () => {
      if (isSyncingFromEditor.current) return
      isSyncingFromPreview.current = true
      const ratio = pv.scrollTop / Math.max(1, pv.scrollHeight - pv.clientHeight)
      cm.scrollTop = ratio * (cm.scrollHeight - cm.clientHeight)
      isSyncingFromPreview.current = false
    }

    cm.addEventListener('scroll', onCmScroll)
    pv.addEventListener('scroll', onPvScroll)
    return () => {
      cm.removeEventListener('scroll', onCmScroll)
      pv.removeEventListener('scroll', onPvScroll)
    }
  }, [editorMode])

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
      {editorMode === 'markdown' ? (
        <>
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
            </div>
            <div
              ref={editorRef}
              style={{
                flex: 1,
                overflow: 'auto',
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
              Preview {mermaidBlocks.length > 0 && (
                <span style={{
                  fontSize: '12px',
                  opacity: 0.7,
                  marginLeft: '8px'
                }}>
                  ({mermaidBlocks.length} diagram{mermaidBlocks.length !== 1 ? 's' : ''})
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
                className="markwriter-preview"
                style={{
                  padding: '16px',
                  color: 'var(--text-primary)',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
                  lineHeight: '1.6',
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
              {/* Position marker */}
              <div
                ref={positionMarkerRef}
                style={{ position: 'absolute', left: 0, right: 0, height: '2px', background: 'var(--accent-primary)', opacity: 0.25, pointerEvents: 'none' }}
              />

              {/* Overlay Mermaid diagrams over placeholders */}
              {mermaidBlocks.map((block, index) => (
                <MermaidRenderer
                  key={block.id}
                  chart={block.chart}
                  id={`${block.id}-${index}`}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        /* WYSIWYG Mode - Full Window Editing */
        <div style={{
          flex: 1,
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
      )}

      {/* Editor Mode Tabs */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        right: '16px',
        display: 'flex',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderBottom: 'none',
        borderRadius: '6px 6px 0 0',
        overflow: 'hidden'
      }}>
        <button
          onClick={() => {
            // On switching to Markdown, sync from the live WYSIWYG state for freshest content
            const view = editorViewRef.current
            if (view) {
              isSwitchingModeRef.current = true
              const prevAnchor = lastMarkdownAnchorRef.current || view.state.selection.main.anchor
              let markdownText = currentDocument?.content || ''
              if (tiptap) {
                const html = tiptap.getHTML()
                markdownText = turndown.turndown(html)
                updateDocumentContent(markdownText)
              }
              const newLen = markdownText.length
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: markdownText },
                selection: { anchor: Math.min(prevAnchor, newLen) }
              })
              lastMarkdownAnchorRef.current = Math.min(prevAnchor, newLen)
              updatePreview(markdownText)
              view.focus()
              queueMicrotask(() => { isSwitchingModeRef.current = false })
            }
            setEditorMode('markdown');
            // Re-mount CodeMirror view if needed and refresh preview
            requestAnimationFrame(() => {
              if (editorRef.current && editorViewRef.current) {
                try {
                  if (editorViewRef.current.dom.parentElement !== editorRef.current) {
                    editorRef.current.appendChild(editorViewRef.current.dom)
                  }
                } catch {}
              }
              // preview already updated above from markdownText
              if (editorViewRef.current) {
                editorViewRef.current.focus()
              }
              queueMicrotask(() => { isSwitchingModeRef.current = false })
            })
          }}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: editorMode === 'markdown' ? 'var(--bg-primary)' : 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s ease'
          }}
        >
          Markdown
        </button>
        <button
          onClick={() => {
            // Sync WYSIWYG from store explicitly to avoid lifecycle setContent warnings
            if (tiptap && currentDocument) {
              const html = toWysiwygHtml(currentDocument.content || '')
              isUpdatingFromMarkdown.current = true
              requestAnimationFrame(() => {
                tiptap.commands.setContent(html)
                isUpdatingFromMarkdown.current = false
                setEditorMode('wysiwyg')
              })
              return
            }
            setEditorMode('wysiwyg');
          }}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: editorMode === 'wysiwyg' ? 'var(--bg-primary)' : 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s ease'
          }}
        >
          WYSIWYG
        </button>
      </div>
    </div>
  )
})

EditorView.displayName = 'EditorView'
