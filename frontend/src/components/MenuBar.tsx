import React, { useState, useEffect } from 'react'
import { useAppStore, useTheme } from '../store/useAppStore'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { EditorViewRef } from './EditorView'
import './MenuBar.css'

interface MenuBarProps {
  editorViewRef?: React.RefObject<EditorViewRef>
}

export const MenuBar: React.FC<MenuBarProps> = ({ editorViewRef }) => {
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
    try {
      await createNewDocument()
      console.log('[MENU] Created new document')
    } catch (error) {
      console.error('[MENU] Failed to create new document:', error)
    }
    setActiveMenu(null)
  }

  const handleOpen = async () => {
    try {
      console.log('[MENU] Opening file dialog...')
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown', 'txt']
          }
        ]
      })
      
      console.log('[MENU] File dialog result:', selected)
      
      if (selected && typeof selected === 'string') {
        console.log('[MENU] Opening document:', selected)
        await openDocument(selected)
        console.log('[MENU] Document opened successfully')
      }
    } catch (error) {
      console.error('[MENU] Failed to open file:', error)
      // Show user-friendly error
      alert(`Failed to open file: ${error}`)
    }
    setActiveMenu(null)
  }

  const handleSave = async () => {
    try {
      if (currentDocument?.path) {
        console.log('[MENU] Saving document to:', currentDocument.path)
        await saveDocument()
        console.log('[MENU] Document saved successfully')
      } else {
        console.log('[MENU] No path available, using Save As')
        await handleSaveAs()
      }
    } catch (error) {
      console.error('[MENU] Failed to save document:', error)
      alert(`Failed to save document: ${error}`)
    }
    setActiveMenu(null)
  }

  const handleSaveAs = async () => {
    try {
      console.log('[MENU] Opening Save As dialog...')
      const selected = await save({
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown']
          }
        ]
      })
      
      console.log('[MENU] Save As dialog result:', selected)
      
      if (selected) {
        console.log('[MENU] Saving document as:', selected)
        await saveDocumentAs(selected)
        console.log('[MENU] Document saved as successfully')
      }
    } catch (error) {
      console.error('[MENU] Failed to save file:', error)
      alert(`Failed to save file: ${error}`)
    }
    setActiveMenu(null)
  }

  const handleExportHTML = async () => {
    try {
      console.log('[MENU] Opening Export HTML dialog...')
      const selected = await save({
        filters: [
          {
            name: 'HTML',
            extensions: ['html']
          }
        ]
      })
      
      console.log('[MENU] Export dialog result:', selected)
      
      if (selected) {
        console.log('[MENU] Exporting document as HTML:', selected)
        await exportDocument(selected, 'html')
        console.log('[MENU] Document exported successfully')
      }
    } catch (error) {
      console.error('[MENU] Failed to export file:', error)
      alert(`Failed to export file: ${error}`)
    }
    setActiveMenu(null)
  }

  const handleQuit = async () => {
    try {
      await invoke('quit_app')
    } catch (error) {
      console.error('[MENU] Failed to quit app:', error)
    }
  }

  // Edit menu handlers - CodeMirror 6 integration
  const handleUndo = () => {
    if (editorViewRef?.current) {
      try {
        editorViewRef.current.undo()
        console.log('[MENU] Executed undo')
      } catch (error) {
        console.error('[MENU] Undo failed:', error)
      }
    } else {
      console.warn('[MENU] Editor reference not available for undo')
    }
    setActiveMenu(null)
  }

  const handleRedo = () => {
    if (editorViewRef?.current) {
      try {
        editorViewRef.current.redo()
        console.log('[MENU] Executed redo')
      } catch (error) {
        console.error('[MENU] Redo failed:', error)
      }
    } else {
      console.warn('[MENU] Editor reference not available for redo')
    }
    setActiveMenu(null)
  }

  const handleCut = async () => {
    if (editorViewRef?.current) {
      try {
        const selection = editorViewRef.current.getSelection()
        if (selection) {
          await navigator.clipboard.writeText(selection)
          editorViewRef.current.insertText('') // Replace selection with empty string
          console.log('[MENU] Cut selection to clipboard')
        }
      } catch (error) {
        console.error('[MENU] Cut failed:', error)
      }
    }
    setActiveMenu(null)
  }

  const handleCopy = async () => {
    if (editorViewRef?.current) {
      try {
        const selection = editorViewRef.current.getSelection()
        if (selection) {
          await navigator.clipboard.writeText(selection)
          console.log('[MENU] Copied selection to clipboard')
        }
      } catch (error) {
        console.error('[MENU] Copy failed:', error)
      }
    }
    setActiveMenu(null)
  }

  const handlePaste = async () => {
    if (editorViewRef?.current) {
      try {
        const text = await navigator.clipboard.readText()
        editorViewRef.current.insertText(text)
        console.log('[MENU] Pasted from clipboard')
      } catch (error) {
        console.error('[MENU] Paste failed:', error)
      }
    }
    setActiveMenu(null)
  }

  const handleSelectAll = () => {
    if (editorViewRef?.current) {
      try {
        editorViewRef.current.selectAll()
        console.log('[MENU] Selected all text')
      } catch (error) {
        console.error('[MENU] Select All failed:', error)
      }
    }
    setActiveMenu(null)
  }

  const handleFind = () => {
    if (editorViewRef?.current) {
      try {
        // Focus the editor first
        editorViewRef.current.focus()
        
        // Use keyboard shortcut to trigger CodeMirror's built-in search
        const isMac = navigator.userAgent.includes('Mac')
        const event = new KeyboardEvent('keydown', { 
          key: 'f', 
          [isMac ? 'metaKey' : 'ctrlKey']: true,
          bubbles: true
        })
        
        // Get the editor view and dispatch the event to it
        const editorView = editorViewRef.current.getEditorView()
        if (editorView?.dom) {
          editorView.dom.dispatchEvent(event)
        }
        
        console.log('[MENU] Triggered find dialog')
      } catch (error) {
        console.error('[MENU] Find failed:', error)
      }
    }
    setActiveMenu(null)
  }

  // View menu handlers
  const handleThemeToggle = () => {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(nextTheme)
    setActiveMenu(null)
  }

  // Updated zoom handlers for CodeMirror 6
  const handleZoomIn = () => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement
    const previewPane = document.querySelector('.markwriter-preview') as HTMLElement
    
    if (editorContainer || previewPane) {
      // Get current font sizes or use defaults
      const currentEditorSize = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size') || '14', 10
      )
      const currentPreviewSize = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--preview-font-size') || '16', 10
      )
      
      // Increase font sizes (max 24px for editor, 26px for preview)
      const newEditorSize = Math.min(currentEditorSize + 2, 24)
      const newPreviewSize = Math.min(currentPreviewSize + 2, 26)
      
      // Set CSS variables
      document.documentElement.style.setProperty('--editor-font-size', `${newEditorSize}px`)
      document.documentElement.style.setProperty('--preview-font-size', `${newPreviewSize}px`)
      
      console.log('[MENU] Zoomed in - Editor:', newEditorSize, 'Preview:', newPreviewSize)
    }
    setActiveMenu(null)
  }

  const handleZoomOut = () => {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement
    const previewPane = document.querySelector('.markwriter-preview') as HTMLElement
    
    if (editorContainer || previewPane) {
      // Get current font sizes or use defaults
      const currentEditorSize = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size') || '14', 10
      )
      const currentPreviewSize = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--preview-font-size') || '16', 10
      )
      
      // Decrease font sizes (min 10px for editor, 12px for preview)
      const newEditorSize = Math.max(currentEditorSize - 2, 10)
      const newPreviewSize = Math.max(currentPreviewSize - 2, 12)
      
      // Set CSS variables
      document.documentElement.style.setProperty('--editor-font-size', `${newEditorSize}px`)
      document.documentElement.style.setProperty('--preview-font-size', `${newPreviewSize}px`)
      
      console.log('[MENU] Zoomed out - Editor:', newEditorSize, 'Preview:', newPreviewSize)
    }
    setActiveMenu(null)
  }

  const handleActualSize = () => {
    // Reset to default sizes
    document.documentElement.style.setProperty('--editor-font-size', '14px')
    document.documentElement.style.setProperty('--preview-font-size', '16px')
    console.log('[MENU] Reset to actual size - Editor: 14px, Preview: 16px')
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

  // Keyboard shortcut handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.userAgent.includes('Mac')
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (modKey) {
        let shouldPrevent = false
        let actionToExecute: (() => void) | null = null

        switch (e.key) {
          case 'n':
            shouldPrevent = true
            actionToExecute = handleNew
            break
          case 'o':
            shouldPrevent = true
            actionToExecute = handleOpen
            break
          case 's':
            shouldPrevent = true
            actionToExecute = e.shiftKey ? handleSaveAs : handleSave
            break
          case 'q':
            if (isMac) {
              shouldPrevent = true
              actionToExecute = handleQuit
            }
            break
          case 'z':
            if (e.shiftKey) {
              shouldPrevent = true
              actionToExecute = handleRedo
            } else {
              shouldPrevent = true
              actionToExecute = handleUndo
            }
            break
          case 'x':
            shouldPrevent = true
            actionToExecute = handleCut
            break
          case 'c':
            shouldPrevent = true
            actionToExecute = handleCopy
            break
          case 'v':
            shouldPrevent = true
            actionToExecute = handlePaste
            break
          case 'a':
            shouldPrevent = true
            actionToExecute = handleSelectAll
            break
          case '=':
          case '+':
            shouldPrevent = true
            actionToExecute = handleZoomIn
            break
          case '-':
            shouldPrevent = true
            actionToExecute = handleZoomOut
            break
          case '0':
            shouldPrevent = true
            actionToExecute = handleActualSize
            break
        }

        if (shouldPrevent) {
          e.preventDefault()
          e.stopPropagation()
          
          // Execute action
          if (actionToExecute) {
            setTimeout(actionToExecute, 0)
          }
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