import React, { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { open, save } from '@tauri-apps/plugin-dialog'
import { EditorViewRef } from './EditorView'
import './Toolbar.css'

interface ToolbarProps {
  editorViewRef?: React.RefObject<EditorViewRef>
}

export const Toolbar: React.FC<ToolbarProps> = ({ editorViewRef }) => {
  const {
    currentDocument,
    openDocument,
    saveDocument,
    saveDocumentAs,
  } = useAppStore()

  const [showHeadingsMenu, setShowHeadingsMenu] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)

  // File operations
  const handleOpen = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown', 'txt']
          }
        ]
      })

      if (selected && typeof selected === 'string') {
        await openDocument(selected)
      }
    } catch (error) {
      console.error('[TOOLBAR] Failed to open file:', error)
    }
  }

  const handleSave = async () => {
    try {
      if (currentDocument?.path) {
        await saveDocument()
      } else {
        await handleSaveAs()
      }
    } catch (error) {
      console.error('[TOOLBAR] Failed to save document:', error)
    }
  }

  const handleSaveAs = async () => {
    try {
      const selected = await save({
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown']
          }
        ]
      })

      if (selected) {
        await saveDocumentAs(selected)
      }
    } catch (error) {
      console.error('[TOOLBAR] Failed to save file:', error)
    }
  }

  // Text formatting
  const insertBold = () => {
    if (editorViewRef?.current?.toggleBold) {
      editorViewRef.current.toggleBold()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('**bold text**')
    }
  }

  const insertItalic = () => {
    if (editorViewRef?.current?.toggleItalic) {
      editorViewRef.current.toggleItalic()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('*italic text*')
    }
  }

  const insertStrikethrough = () => {
    if (editorViewRef && (editorViewRef.current as any)?.toggleStrike) {
      ;(editorViewRef.current as any).toggleStrike()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('~~strikethrough text~~')
    }
  }

  const insertHorizontalRule = () => {
    if (editorViewRef?.current?.insertHorizontalRule) {
      editorViewRef.current.insertHorizontalRule()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('\n---\n')
    }
  }

  const insertLink = () => {
    if (editorViewRef?.current?.setLink) {
      editorViewRef.current.setLink()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('[link text](url)')
    }
  }

  const insertImage = () => {
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('![alt text](image-url)')
    }
  }

  const insertCodeBlock = () => {
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('\n```\ncode here\n```\n')
    }
  }

  const insertTable = (rows: number, cols: number) => {
    // Try WYSIWYG table first
    const api: any = editorViewRef?.current
    if (api && api.insertTable) {
      api.insertTable(rows, cols)
      setShowTableMenu(false)
      return
    }
    if (editorViewRef?.current) {
      let table = '\n'
      table += '| ' + Array(cols).fill('Header').join(' | ') + ' |\n'
      table += '| ' + Array(cols).fill('---').join(' | ') + ' |\n'
      for (let i = 0; i < rows; i++) table += '| ' + Array(cols).fill('').join(' | ') + ' |\n'
      editorViewRef.current.insertText(table)
    }
    setShowTableMenu(false)
  }

  const insertBulletList = () => {
    if (editorViewRef?.current?.toggleBulletList) {
      editorViewRef.current.toggleBulletList()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('\n- List item\n')
    }
  }

  const insertNumberedList = () => {
    if (editorViewRef?.current?.toggleOrderedList) {
      editorViewRef.current.toggleOrderedList()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('\n1. List item\n')
    }
  }

  const insertCheckbox = () => {
    if (editorViewRef && (editorViewRef.current as any)?.toggleTask) {
      (editorViewRef.current as any).toggleTask()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('\n- [ ] Task item\n')
    }
  }

  const insertHeading = (level: number) => {
    if (editorViewRef?.current?.setHeadingLevel) {
      editorViewRef.current.setHeadingLevel(level)
      setShowHeadingsMenu(false)
      return
    }
    if (editorViewRef?.current) {
      const prefix = '#'.repeat(level) + ' '
      editorViewRef.current.insertText(prefix)
    }
    setShowHeadingsMenu(false)
  }

  return (
    <div className="toolbar">
      {/* File Operations */}
      <div className="toolbar-section">
        <button className="toolbar-btn" onClick={handleOpen} title="Open">
          📁
        </button>
        <button className="toolbar-btn" onClick={handleSave} title="Save">
          💾
        </button>
        <button className="toolbar-btn" onClick={handleSaveAs} title="Save As">
          💾✏️
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* View Controls */}
      <div className="toolbar-section">
        <button className="toolbar-btn" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, metaKey: true }))} title="Zoom In">🔍+</button>
        <button className="toolbar-btn" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '-', ctrlKey: true, metaKey: true }))} title="Zoom Out">🔍-</button>
        <button className="toolbar-btn" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, metaKey: true }))} title="Actual Size">🔍</button>
      </div>

      <div className="toolbar-separator" />

      {/* Text Formatting */}
      <div className="toolbar-section">
        <div className="toolbar-dropdown">
          <button
            className="toolbar-btn"
            onClick={() => setShowHeadingsMenu(!showHeadingsMenu)}
            title="Headings"
          >
            H
          </button>
          {showHeadingsMenu && (
            <div className="toolbar-dropdown-menu">
              <div className="toolbar-dropdown-header">Headings</div>
              <button onClick={() => insertHeading(1)}>Heading 1</button>
              <button onClick={() => insertHeading(2)}>Heading 2</button>
              <button onClick={() => insertHeading(3)}>Heading 3</button>
              <button onClick={() => insertHeading(4)}>Heading 4</button>
              <button onClick={() => insertHeading(5)}>Heading 5</button>
              <button onClick={() => insertHeading(6)}>Heading 6</button>
              <button onClick={() => insertHeading(0)}>Paragraph</button>
            </div>
          )}
        </div>

        <button className="toolbar-btn" onClick={insertBold} title="Bold">B</button>
        <button className="toolbar-btn" onClick={insertItalic} title="Italic">I</button>
        <button className="toolbar-btn" onClick={insertStrikethrough} title="Strikethrough">S</button>
        <button className="toolbar-btn" onClick={insertHorizontalRule} title="Horizontal Rule">─</button>
      </div>

      <div className="toolbar-separator" />

      {/* Content Insertion */}
      <div className="toolbar-section">
        <button className="toolbar-btn" onClick={insertBulletList} title="Bullet List">•</button>
        <button className="toolbar-btn" onClick={insertNumberedList} title="Numbered List">1.</button>
        <button className="toolbar-btn" onClick={insertCheckbox} title="Checkbox">☐</button>

        <div className="toolbar-dropdown">
          <button
            className="toolbar-btn"
            onClick={() => setShowTableMenu(!showTableMenu)}
            title="Insert Table"
          >
            ⊞
          </button>
          {showTableMenu && (
            <div className="toolbar-dropdown-menu">
              <div className="toolbar-dropdown-header">Table Size</div>
              <div className="table-grid">
                {[1, 2, 3, 4, 5, 6].map(cols =>
                  [1, 2, 3, 4, 5, 6].map(rows => (
                    <button
                      key={`${cols}x${rows}`}
                      className="table-cell"
                      onClick={() => insertTable(rows, cols)}
                      title={`${cols} x ${rows} table`}
                    >
                      {cols}×{rows}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button className="toolbar-btn" onClick={insertLink} title="Insert Link">🔗</button>
        <button className="toolbar-btn" onClick={insertImage} title="Insert Image">🖼️</button>
        <button className="toolbar-btn" onClick={insertCodeBlock} title="Code Block">&lt;/&gt;</button>
        <button className="toolbar-btn" title="Clipboard">CB</button>
      </div>

      <div className="toolbar-separator" />

      {/* Font Size */}
      <div className="toolbar-section">
        <span className="font-size">66</span>
      </div>
    </div>
  )
}
