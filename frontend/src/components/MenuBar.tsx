import React, { useState, useRef, useEffect } from 'react'
import { useAppStore, useTheme } from '../store/useAppStore'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Editor } from '@toast-ui/react-editor'
import './MenuBar.css'

interface MenuBarProps {
  editorRef?: React.RefObject<Editor>
}

export const MenuBar: React.FC<MenuBarProps> = ({ editorRef }) => {
  const {
    currentDocument,
    createNewDocument,
    openDocument,
    saveDocument,
    saveDocumentAs,
    exportDocument,
  } = useAppStore()
  
  const { theme, setTheme } = useTheme()
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  // File menu handlers
  const handleNew = async () => {
    await createNewDocument()
    setActiveMenu(null)
  }

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
      console.error('Failed to open file:', error)
    }
    setActiveMenu(null)
  }

  const handleSave = async () => {
    if (currentDocument?.path) {
      await saveDocument()
    } else {
      await handleSaveAs()
    }
    setActiveMenu(null)
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
      console.error('Failed to save file:', error)
    }
    setActiveMenu(null)
  }

  const handleExportHTML = async () => {
    try {
      const selected = await save({
        filters: [
          {
            name: 'HTML',
            extensions: ['html']
          }
        ]
      })
      
      if (selected) {
        await exportDocument(selected, 'html')
      }
    } catch (error) {
      console.error('Failed to export file:', error)
    }
    setActiveMenu(null)
  }

  const handleQuit = async () => {
    try {
      await invoke('quit_app')
    } catch (error) {
      console.error('Failed to quit app:', error)
    }
  }

  // Edit menu handlers - Toast UI Editor integration
  const handleUndo = () => {
    if (editorRef?.current) {
      const editorInstance = editorRef.current.getInstance()
      if (editorInstance && typeof editorInstance.exec === 'function') {
        editorInstance.exec('undo')
      }
    }
    setActiveMenu(null)
  }

  const handleRedo = () => {
    if (editorRef?.current) {
      const editorInstance = editorRef.current.getInstance()
      if (editorInstance && typeof editorInstance.exec === 'function') {
        editorInstance.exec('redo')
      }
    }
    setActiveMenu(null)
  }

  const handleCut = () => {
    if (editorRef?.current) {
      const editorInstance = editorRef.current.getInstance()
      // For Toast UI Editor, we'll use the browser's built-in cut
      document.execCommand('cut')
    }
    setActiveMenu(null)
  }

  const handleCopy = () => {
    if (editorRef?.current) {
      const editorInstance = editorRef.current.getInstance()
      // Use browser's built-in copy
      document.execCommand('copy')
    }
    setActiveMenu(null)
  }

  const handlePaste = () => {
    if (editorRef?.current) {
      const editorInstance = editorRef.current.getInstance()
      // Use browser's built-in paste
      document.execCommand('paste')
    }
    setActiveMenu(null)
  }

  const handleSelectAll = () => {
    if (editorRef?.current) {
      const editorInstance = editorRef.current.getInstance()
      // Use browser's built-in select all
      document.execCommand('selectAll')
    }
    setActiveMenu(null)
  }

  const handleFind = () => {
    // TODO: Implement find/replace functionality
    // For now, just use browser's built-in find
    if (navigator.userAgent.includes('Mac')) {
      // Use Cmd+F on Mac
      const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true })
      document.dispatchEvent(event)
    } else {
      // Use Ctrl+F on Windows/Linux
      const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true })
      document.dispatchEvent(event)
    }
    setActiveMenu(null)
  }

  // View menu handlers
  const handleThemeToggle = () => {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(nextTheme)
    setActiveMenu(null)
  }

  const handleZoomIn = () => {
    // Implement zoom functionality
    const currentZoom = parseFloat(document.body.style.zoom || '1')
    const newZoom = Math.min(currentZoom + 0.1, 2.0)
    document.body.style.zoom = newZoom.toString()
    setActiveMenu(null)
  }

  const handleZoomOut = () => {
    // Implement zoom functionality  
    const currentZoom = parseFloat(document.body.style.zoom || '1')
    const newZoom = Math.max(currentZoom - 0.1, 0.5)
    document.body.style.zoom = newZoom.toString()
    setActiveMenu(null)
  }

  const handleActualSize = () => {
    // Reset zoom to 100%
    document.body.style.zoom = '1'
    setActiveMenu(null)
  }

  // Help menu handlers
  const handleAbout = () => {
    // This will show the About dialog via Tauri
    invoke('show_about_dialog').catch(console.error)
    setActiveMenu(null)
  }

  const toggleMenu = (menuName: string) => {
    setActiveMenu(activeMenu === menuName ? null : menuName)
  }

  const closeMenus = () => setActiveMenu(null)

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.userAgent.includes('Mac')
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (modKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault()
            handleNew()
            break
          case 'o':
            e.preventDefault()
            handleOpen()
            break
          case 's':
            e.preventDefault()
            if (e.shiftKey) {
              handleSaveAs()
            } else {
              handleSave()
            }
            break
          case 'q':
            if (isMac) {
              e.preventDefault()
              handleQuit()
            }
            break
          case 'z':
            if (e.shiftKey) {
              e.preventDefault()
              handleRedo()
            } else {
              e.preventDefault()
              handleUndo()
            }
            break
          case '=':
          case '+':
            e.preventDefault()
            handleZoomIn()
            break
          case '-':
            e.preventDefault()
            handleZoomOut()
            break
          case '0':
            e.preventDefault()
            handleActualSize()
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentDocument])

  return (
    <div className="menu-bar">
      {/* File Menu */}
      <div className="menu-item">
        <button
          className={`menu-trigger ${activeMenu === 'file' ? 'active' : ''}`}
          onClick={() => toggleMenu('file')}
        >
          File
        </button>
        {activeMenu === 'file' && (
          <div className="menu-dropdown">
            <button className="menu-option" onClick={handleNew}>
              <span>New</span>
              <span className="shortcut">⌘N</span>
            </button>
            <button className="menu-option" onClick={handleOpen}>
              <span>Open...</span>
              <span className="shortcut">⌘O</span>
            </button>
            <div className="menu-separator" />
            <button 
              className="menu-option" 
              onClick={handleSave}
              disabled={!currentDocument}
            >
              <span>Save</span>
              <span className="shortcut">⌘S</span>
            </button>
            <button 
              className="menu-option" 
              onClick={handleSaveAs}
              disabled={!currentDocument}
            >
              <span>Save As...</span>
              <span className="shortcut">⇧⌘S</span>
            </button>
            <div className="menu-separator" />
            <button 
              className="menu-option" 
              onClick={handleExportHTML}
              disabled={!currentDocument}
            >
              <span>Export as HTML...</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-option" onClick={handleQuit}>
              <span>Quit</span>
              <span className="shortcut">⌘Q</span>
            </button>
          </div>
        )}
      </div>

      {/* Edit Menu */}
      <div className="menu-item">
        <button
          className={`menu-trigger ${activeMenu === 'edit' ? 'active' : ''}`}
          onClick={() => toggleMenu('edit')}
        >
          Edit
        </button>
        {activeMenu === 'edit' && (
          <div className="menu-dropdown">
            <button 
              className="menu-option" 
              onClick={handleUndo}
              disabled={!currentDocument}
            >
              <span>Undo</span>
              <span className="shortcut">⌘Z</span>
            </button>
            <button 
              className="menu-option" 
              onClick={handleRedo}
              disabled={!currentDocument}
            >
              <span>Redo</span>
              <span className="shortcut">⇧⌘Z</span>
            </button>
            <div className="menu-separator" />
            <button 
              className="menu-option" 
              onClick={handleCut}
              disabled={!currentDocument}
            >
              <span>Cut</span>
              <span className="shortcut">⌘X</span>
            </button>
            <button 
              className="menu-option" 
              onClick={handleCopy}
              disabled={!currentDocument}
            >
              <span>Copy</span>
              <span className="shortcut">⌘C</span>
            </button>
            <button 
              className="menu-option" 
              onClick={handlePaste}
              disabled={!currentDocument}
            >
              <span>Paste</span>
              <span className="shortcut">⌘V</span>
            </button>
            <div className="menu-separator" />
            <button 
              className="menu-option" 
              onClick={handleSelectAll}
              disabled={!currentDocument}
            >
              <span>Select All</span>
              <span className="shortcut">⌘A</span>
            </button>
            <div className="menu-separator" />
            <button 
              className="menu-option" 
              onClick={handleFind}
              disabled={!currentDocument}
            >
              <span>Find...</span>
              <span className="shortcut">⌘F</span>
            </button>
          </div>
        )}
      </div>

      {/* View Menu */}
      <div className="menu-item">
        <button
          className={`menu-trigger ${activeMenu === 'view' ? 'active' : ''}`}
          onClick={() => toggleMenu('view')}
        >
          View
        </button>
        {activeMenu === 'view' && (
          <div className="menu-dropdown">
            <button className="menu-option" onClick={handleThemeToggle}>
              <span>Theme: {theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-option" onClick={handleZoomIn}>
              <span>Zoom In</span>
              <span className="shortcut">⌘+</span>
            </button>
            <button className="menu-option" onClick={handleZoomOut}>
              <span>Zoom Out</span>
              <span className="shortcut">⌘-</span>
            </button>
            <button className="menu-option" onClick={handleActualSize}>
              <span>Actual Size</span>
              <span className="shortcut">⌘0</span>
            </button>
          </div>
        )}
      </div>

      {/* Help Menu */}
      <div className="menu-item">
        <button
          className={`menu-trigger ${activeMenu === 'help' ? 'active' : ''}`}
          onClick={() => toggleMenu('help')}
        >
          Help
        </button>
        {activeMenu === 'help' && (
          <div className="menu-dropdown">
            <button className="menu-option" onClick={handleAbout}>
              <span>About MarkWriter</span>
            </button>
          </div>
        )}
      </div>

      {/* Document Title Display */}
      <div className="document-title">
        {currentDocument ? (
          <>
            <span className="title">{currentDocument.title || 'Untitled'}</span>
            {currentDocument.isDirty && <span className="dirty-indicator">•</span>}
          </>
        ) : (
          <span className="no-document">No document</span>
        )}
      </div>

      {/* Click outside to close menus */}
      {activeMenu && (
        <div className="menu-overlay" onClick={closeMenus} />
      )}
    </div>
  )
}
