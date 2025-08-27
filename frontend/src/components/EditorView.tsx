import React, { useEffect, useRef, forwardRef } from 'react'
import { EditorView as CodeMirrorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { marked } from 'marked'
import { useAppStore } from '../store/useAppStore'

export interface EditorViewRef {
  getMarkdown: () => string
  setMarkdown: (content: string) => void
}

export const EditorView = forwardRef<EditorViewRef, {}>((props, ref) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<CodeMirrorView | null>(null)
  
  const { currentDocument, updateDocumentContent, config } = useAppStore()
  
  // Expose editor methods to parent components
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
    }
  }))

  // Update preview
  const updatePreview = (content: string) => {
    if (previewRef.current) {
      try {
        const html = marked.parse(content)
        previewRef.current.innerHTML = html
      } catch (error) {
        console.error('Error parsing markdown:', error)
        previewRef.current.innerHTML = `<p>Error parsing markdown: ${error}</p>`
      }
    }
  }

  // Initialize CodeMirror editor
  useEffect(() => {
    if (!editorRef.current) return

    const isDark = config.theme === 'dark' || 
      (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    const state = EditorState.create({
      doc: currentDocument?.content || '# Welcome to MarkWriter\n\nStart writing your markdown here...',
      extensions: [
        markdown(),
        keymap.of([...defaultKeymap, ...searchKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString()
            updateDocumentContent(content)
            updatePreview(content)
          }
        }),
        EditorView.theme({
          '&': {
            fontSize: '14px',
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

    const view = new CodeMirrorView({
      state,
      parent: editorRef.current
    })

    editorViewRef.current = view

    // Initial preview update
    updatePreview(currentDocument?.content || '# Welcome to MarkWriter\n\nStart writing your markdown here...')

    return () => {
      view.destroy()
    }
  }, []) // Only run once on mount

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
  }, [currentDocument?.id])

  // Update theme when config changes
  useEffect(() => {
    if (editorViewRef.current) {
      const isDark = config.theme === 'dark' || 
        (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      
      // Recreate editor with new theme
      const content = editorViewRef.current.state.doc.toString()
      const parent = editorViewRef.current.dom.parentNode
      editorViewRef.current.destroy()

      const state = EditorState.create({
        doc: content,
        extensions: [
          markdown(),
          keymap.of([...defaultKeymap, ...searchKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newContent = update.state.doc.toString()
              updateDocumentContent(newContent)
              updatePreview(newContent)
            }
          }),
          EditorView.theme({
            '&': {
              fontSize: '14px',
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

      const view = new CodeMirrorView({
        state,
        parent: parent as Element
      })

      editorViewRef.current = view
    }
  }, [config.theme])
  
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
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'row', 
      overflow: 'hidden',
      backgroundColor: 'var(--bg-primary)'
    }}>
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
            backgroundColor: 'var(--bg-primary)'
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
          Preview
        </div>
        <div 
          ref={previewRef}
          style={{ 
            flex: 1, 
            overflow: 'auto',
            padding: '16px',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
            lineHeight: '1.6'
          }}
        />
      </div>
    </div>
  )
})

EditorView.displayName = 'EditorView'
