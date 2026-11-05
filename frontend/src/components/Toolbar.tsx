import React, { useEffect, useRef, useState } from 'react'
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
  const [tableHover, setTableHover] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 })
  const [formatLabel, setFormatLabel] = useState<string>('H')
  const [fmt, setFmt] = useState<{ bold: boolean; italic: boolean; strike: boolean; underline: boolean; link: boolean }>({ bold: false, italic: false, strike: false, underline: false, link: false })

  const headingsMenuRef = useRef<HTMLDivElement>(null)
  const tableMenuRef = useRef<HTMLDivElement>(null)

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

  const insertUnderline = () => {
    const api: any = editorViewRef?.current
    if (api && api.toggleUnderline) {
      api.toggleUnderline()
      return
    }
    if (editorViewRef?.current) {
      editorViewRef.current.insertText('++underlined++')
    }
  }

  // Subscribe to formatting changes from editor (WYSIWYG)
  React.useEffect(() => {
    const api: any = editorViewRef?.current
    if (api && api.onFormattingChange) {
      api.onFormattingChange((state: any) => {
        setFormatLabel(state.blockLabel || 'H')
        setFmt({ bold: !!state.bold, italic: !!state.italic, strike: !!state.strike, underline: !!state.underline, link: !!state.link })
      })
    }
  }, [editorViewRef?.current])

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (showHeadingsMenu && headingsMenuRef.current && !headingsMenuRef.current.contains(t)) setShowHeadingsMenu(false)
      if (showTableMenu && tableMenuRef.current && !tableMenuRef.current.contains(t)) setShowTableMenu(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowHeadingsMenu(false); setShowTableMenu(false) } }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onEsc) }
  }, [showHeadingsMenu, showTableMenu])

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
            {formatLabel}
          </button>
          {showHeadingsMenu && (
            <div className="toolbar-dropdown-menu" ref={headingsMenuRef}>
              <div className="toolbar-dropdown-header">Headings</div>
              <button onClick={() => insertHeading(1)}>Heading 1</button>
              <button onClick={() => insertHeading(2)}>Heading 2</button>
              <button onClick={() => insertHeading(3)}>Heading 3</button>
              <button onClick={() => insertHeading(4)}>Heading 4</button>
              <button onClick={() => insertHeading(5)}>Heading 5</button>
              <button onClick={() => insertHeading(6)}>Heading 6</button>
              <button onClick={() => insertHeading(0)}>Body</button>
              <div className="toolbar-dropdown-header">Block</div>
              <button onClick={() => { editorViewRef?.current?.toggleBlockquote?.(); setShowHeadingsMenu(false) }}>Block Quote</button>
              <button onClick={() => { editorViewRef?.current?.toggleCodeBlock?.(); setShowHeadingsMenu(false) }}>Code Block</button>
            </div>
          )}
        </div>

        <button className={`toolbar-btn${fmt.bold ? ' active' : ''}`} onClick={insertBold} title="Bold">B</button>
        <button className={`toolbar-btn${fmt.italic ? ' active' : ''}`} onClick={insertItalic} title="Italic">I</button>
        <button className={`toolbar-btn${fmt.strike ? ' active' : ''}`} onClick={insertStrikethrough} title="Strikethrough">S</button>
        <button className={`toolbar-btn${fmt.underline ? ' active' : ''}`} onClick={insertUnderline} title="Underline">U</button>
        <button className="toolbar-btn" onClick={insertHorizontalRule} title="Horizontal Rule">─</button>
      </div>

      <div className="toolbar-separator" />

      {/* Content Insertion */}
      <div className="toolbar-section">
        <button className="toolbar-btn" onClick={insertBulletList} title="Bullet List">•</button>
        <button className="toolbar-btn" onClick={insertNumberedList} title="Numbered List">1.</button>
        <button className="toolbar-btn" onClick={insertCheckbox} title="Task list">☐</button>

        <div className="toolbar-dropdown">
          <button
            className="toolbar-btn"
            onClick={() => setShowTableMenu(!showTableMenu)}
            title="Insert Table"
          >
            ⊞
          </button>
          {showTableMenu && (
            <div className="toolbar-dropdown-menu" ref={tableMenuRef}>
              <div className="toolbar-dropdown-header">Table Size {tableHover.cols > 0 && tableHover.rows > 0 ? `(${tableHover.cols} × ${tableHover.rows})` : ''}</div>
              <div className="table-grid" style={{ gridTemplateColumns: `repeat(12, 1fr)` }}>
                {Array.from({ length: 12 }).map((_, r) =>
                  Array.from({ length: 12 }).map((__, c) => (
                    <button
                      key={`${r+1}x${c+1}`}
                      className={`table-cell${(c+1) <= (tableHover.cols || 0) && (r+1) <= (tableHover.rows || 0) ? ' active' : ''}`}
                      onMouseEnter={() => setTableHover({ cols: c + 1, rows: r + 1 })}
                      onClick={() => {
                        insertTable(r + 1, c + 1)
                        setTableHover({ rows: 0, cols: 0 })
                        setShowTableMenu(false)
                      }}
                      title={`${c + 1} x ${r + 1} table`}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button className="toolbar-btn" onClick={insertLink} title="Insert Link">🔗</button>
        <button className="toolbar-btn" onClick={insertImage} title="Insert Image">🖼️</button>
        {/* Code Block button removed; available in Headings dropdown */}
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
