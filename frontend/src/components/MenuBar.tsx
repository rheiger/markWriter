import React, { useState } from 'react'
import { useAppStore, useTheme } from '../store/useAppStore'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import './MenuBar.css'

export const MenuBar: React.FC = () => {
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

  // View menu handlers
  const handleThemeToggle = () => {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(nextTheme)
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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
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
          e.preventDefault()
          handleQuit()
          break
      }
    }
  }

  return (
    <div className="menu-bar" onKeyDown={handleKeyDown} tabIndex={-1}>
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
            <button className="menu-option" onClick={closeMenus}>
              <span>Undo</span>
              <span className="shortcut">⌘Z</span>
            </button>
            <button className="menu-option" onClick={closeMenus}>
              <span>Redo</span>
              <span className="shortcut">⇧⌘Z</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-option" onClick={closeMenus}>
              <span>Cut</span>
              <span className="shortcut">⌘X</span>
            </button>
            <button className="menu-option" onClick={closeMenus}>
              <span>Copy</span>
              <span className="shortcut">⌘C</span>
            </button>
            <button className="menu-option" onClick={closeMenus}>
              <span>Paste</span>
              <span className="shortcut">⌘V</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-option" onClick={closeMenus}>
              <span>Select All</span>
              <span className="shortcut">⌘A</span>
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
            <button className="menu-option" onClick={closeMenus}>
              <span>Zoom In</span>
              <span className="shortcut">⌘+</span>
            </button>
            <button className="menu-option" onClick={closeMenus}>
              <span>Zoom Out</span>
              <span className="shortcut">⌘-</span>
            </button>
            <button className="menu-option" onClick={closeMenus}>
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
