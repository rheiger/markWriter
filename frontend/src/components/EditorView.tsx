import React, { useEffect, useRef, forwardRef, useState, useCallback } from 'react'
import { EditorView as CodeMirrorView, keymap } from '@codemirror/view'
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
import TurndownService from 'turndown'


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
}

interface MermaidBlock {
  id: string
  chart: string
  index: number
}

export const EditorView = forwardRef<EditorViewRef, {}>((_props, ref) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const wysiwygRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<CodeMirrorView | null>(null)
  const [mermaidBlocks, setMermaidBlocks] = useState<MermaidBlock[]>([])
  const [editorMode, setEditorMode] = useState<'markdown' | 'wysiwyg'>('markdown')

  const { currentDocument, updateDocumentContent, config } = useAppStore()

  // Markdown <-> HTML converter for initial Tiptap content
  const md = React.useMemo(() => new MarkdownIt({ html: false, linkify: true, breaks: true }), [])
  const turndown = React.useMemo(() => new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }), [])

  // Tiptap editor instance (WYSIWYG)
  const tiptap = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Link,
      BulletList,
      OrderedList,
      ListItem,
      Heading.configure({ levels: [1,2,3,4,5,6] }),
      Blockquote,
      HardBreak,
      HorizontalRule,
      Code,
    ],
    content: currentDocument?.content ? md.render(currentDocument.content) : '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const markdownFromHtml = turndown.turndown(html)
      updateDocumentContent(markdownFromHtml)
      if (editorViewRef.current) {
        const currentContent = editorViewRef.current.state.doc.toString()
        if (currentContent !== markdownFromHtml) {
          editorViewRef.current.dispatch({
            changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: markdownFromHtml }
          })
        }
      }
    },
    editable: true,
    autofocus: false,
  })

  // Keep tiptap in sync when switching documents
  useEffect(() => {
    if (tiptap && currentDocument) {
      const html = md.render(currentDocument.content || '')
      if (tiptap.getHTML() !== html) tiptap.commands.setContent(html)
    }
  }, [tiptap, currentDocument?.id])

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
    getEditorView: () => editorViewRef.current
  }))

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

      console.log('[EDITOR] Preview updated with', blocks.length, 'mermaid diagrams')
    } catch (error) {
      console.error('Error parsing markdown:', error)
      if (previewRef.current) {
        previewRef.current.innerHTML = `<p>Error parsing markdown: ${error}</p>`
      }
    }
  }, [parseMermaidBlocks])

  // Initialize CodeMirror editor
  useEffect(() => {
    console.log('[EDITOR] useEffect triggered for editor initialization')
    console.log('[EDITOR] editorRef.current:', editorRef.current)
    console.log('[EDITOR] currentDocument:', currentDocument)

    // Wait for DOM to be ready
    const timer = setTimeout(() => {
      if (!editorRef.current) {
        console.error('[EDITOR] No editor ref available after delay')
        return
      }

    const isDark = config.theme === 'dark' ||
      (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    console.log('[EDITOR] Theme is dark:', isDark)
    console.log('[EDITOR] Config theme:', config.theme)

    const defaultContent = currentDocument?.content || '# Welcome to MarkWriter\n\nStart writing your markdown here...\n\n## Try Mermaid Diagrams!\n\n```mermaid\ngraph TD\n    A[Start] --> B{Is it working?}\n    B -->|Yes| C[Great!]\n    B -->|No| D[Let\'s fix it]\n    D --> E[Debug]\n    E --> F[Fix]\n    F --> C\n```'

    console.log('[EDITOR] Creating CodeMirror editor with content length:', defaultContent.length)

    // Create CodeMirror editor state
    const state = EditorState.create({
      doc: defaultContent,
      extensions: [
        markdown(),
        history(), // Enable undo/redo functionality
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        CodeMirrorView.updateListener.of((update) => {
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
            fontFamily: 'inherit'
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

    // Initial preview update
    updatePreview(defaultContent)

    }, 100) // 100ms delay to ensure DOM is ready

    return () => {
      clearTimeout(timer)
      console.log('[EDITOR] Cleaning up CodeMirror editor')
      if (editorViewRef.current) {
        editorViewRef.current.destroy()
      }
    }
  }, [currentDocument?.id, config.theme, updatePreview, updateDocumentContent])

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

  // Update content when document changes
  useEffect(() => {
    if (editorViewRef.current && currentDocument) {
      const currentContent = editorViewRef.current.state.doc.toString()
      if (currentContent !== currentDocument.content) {
        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: editorViewRef.current.state.doc.length,
            insert: currentDocument.content || ''
          }
        })
        updatePreview(currentDocument.content || '')
      }
    }

    // Keep WYSIWYG view in sync with plain text (no HTML injection)
    if (
      editorMode === 'wysiwyg' &&
      currentDocument &&
      wysiwygRef.current &&
      document.activeElement !== wysiwygRef.current
    ) {
      const desired = currentDocument.content || ''
      if (wysiwygRef.current.textContent !== desired) {
        wysiwygRef.current.textContent = desired
      }
    }
  }, [currentDocument?.id, currentDocument?.content, editorMode, updatePreview])

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
    >
      {editorMode === 'markdown' ? (
        <>
          {/* Editor Pane */}
          <div style={{
            flex: 1,
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
                overflow: 'hidden',
                backgroundColor: 'var(--bg-primary)',
                fontSize: 'var(--editor-font-size, 14px)' // Support zoom
              }}
            />
          </div>

          {/* Preview Pane */}
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
            <div style={{
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
          <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--bg-primary)'}}>
            <EditorContent editor={tiptap} />
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
            // When switching to markdown, ensure the editor has the latest content
            if (editorViewRef.current && currentDocument) {
              const currentContent = editorViewRef.current.state.doc.toString();
              if (currentContent !== currentDocument.content) {
                editorViewRef.current.dispatch({
                  changes: {
                    from: 0,
                    to: editorViewRef.current.state.doc.length,
                    insert: currentDocument.content || ''
                  }
                });
              }
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
              if (currentDocument) {
                updatePreview(currentDocument.content || '')
              }
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
            // When switching to WYSIWYG, render formatted HTML once
            if (currentDocument && wysiwygRef.current) {
              try {
                wysiwygRef.current.innerHTML = marked.parse(currentDocument.content || '')
              } catch {
                wysiwygRef.current.textContent = currentDocument.content || ''
              }
              // focus caret at end
              const range = document.createRange()
              const sel = window.getSelection()
              range.selectNodeContents(wysiwygRef.current)
              range.collapse(false)
              sel?.removeAllRanges()
              sel?.addRange(range)
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
