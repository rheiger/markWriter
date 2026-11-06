import React, { useState, useEffect, useRef } from 'react'
import { useAppStore, useTheme, confirmDiscardChanges } from '../store/useAppStore'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { EditorViewRef, EditorMode } from './EditorView'
import './MenuBar.css'
import { mermaidErdTemplate, dotTemplate, mathTemplate } from '../lib/templates'
import { SettingsDialog } from './SettingsDialog'
import { AboutDialog } from './AboutDialog'
import { HelpDialog } from './HelpDialog'

interface MenuBarProps {
  editorMode?: EditorMode
  editorViewRef?: React.RefObject<EditorViewRef>
}

export const MenuBar: React.FC<MenuBarProps> = ({ editorViewRef, editorMode = 'wysiwyg' }) => {
  const {
    currentDocument,
    config,
    updateConfig,
    createNewDocument,
    openDocument,
    saveDocument,
    saveDocumentAs,
    exportDocument,
  } = useAppStore()
  const fontSizeKey = editorMode === 'markdown' ? 'fontSize' : 'renderedFontSize'
  const defaultTextSize = editorMode === 'markdown' ? 14 : 16

  const { theme, setTheme } = useTheme()
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  useEffect(() => {
    if (!activeMenu) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation()
      const trigger = document.querySelector<HTMLButtonElement>('.menu-bar .menu-trigger.active')
      setActiveMenu(null); trigger?.focus()
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [activeMenu])

  const [helpOpen, setHelpOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const helpRef = useRef<HTMLButtonElement>(null)

  // File menu handlers
  const handleNew = async () => {
    setActiveMenu(null)
    console.log('[DEBUG] handleNew called')
    try {
      console.log('[MENU] Creating new document...')
      await createNewDocument()
      console.log('[MENU] Created new document successfully')
    } catch (error) {
      console.error('[MENU] Failed to create new document:', error)
      alert(`Failed to create new document: ${error}`)
    }
  }

  const handleOpen = async () => {
    setActiveMenu(null)
    console.log('[DEBUG] handleOpen called')
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
      alert(`Failed to open file: ${error}`)
    }
  }

  const handleSave = async () => {
    setActiveMenu(null)
    console.log('[DEBUG] handleSave called')
    try {
      if (currentDocument?.path) {
        console.log('[MENU] Saving document to:', currentDocument.path)
        await saveDocument(currentDocument.id)
        console.log('[MENU] Document saved successfully')
      } else {
        console.log('[MENU] No path available, using Save As')
        await handleSaveAs()
      }
    } catch (error) {
      console.error('[MENU] Failed to save document:', error)
      alert(`Failed to save document: ${error}`)
    }
  }

  const handleSaveAs = async () => {
    setActiveMenu(null)
    const snapshot = currentDocument
    if (!snapshot) return
    console.log('[DEBUG] handleSaveAs called')
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
        await saveDocumentAs(selected, snapshot.id, snapshot)
        console.log('[MENU] Document saved as successfully')
      }
    } catch (error) {
      console.error('[MENU] Failed to save file:', error)
      alert(`Failed to save file: ${error}`)
    }
  }

  const handleExportHTML = async () => {
    setActiveMenu(null)
    const snapshot = currentDocument
    if (!snapshot) return
    console.log('[DEBUG] handleExportHTML called')
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
        await exportDocument(selected, 'html', snapshot)
        console.log('[MENU] Document exported successfully')
      }
    } catch (error) {
      console.error('[MENU] Failed to export file:', error)
      alert(`Failed to export file: ${error}`)
    }
  }

  const handleQuit = async () => {
    setActiveMenu(null)
    try {
      if (!await confirmDiscardChanges()) return
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

  // Clipboard permission/OS work may finish after navigation or another edit.
  // A cancelled Cut still copies text, but must never delete a newer selection.
  const clipboardTarget = () => {
    const editor = editorViewRef?.current, document = useAppStore.getState().currentDocument
    const selection = editor?.getSelectionIdentity()
    if (!editor || !document || selection == null) return null
    const revision = document.revision ?? 0
    return { editor, valid: () => {
      const current = useAppStore.getState().currentDocument
      const activeSelection = editorViewRef?.current?.getSelectionIdentity()
      return current?.id === document.id && (current.revision ?? 0) === revision &&
        activeSelection?.editor === selection.editor && activeSelection.selection === selection.selection
    } }
  }

  const handleCut = async () => {
    setActiveMenu(null)
    const target = clipboardTarget()
    if (target) {
      try {
        const selection = target.editor.getSelection()
        if (selection) {
          await navigator.clipboard.writeText(selection)
          if (!target.valid()) return
          target.editor.insertText('') // Replace only the captured, still-current selection.
          console.log('[MENU] Cut selection to clipboard')
        }
      } catch (error) {
        console.error('[MENU] Cut failed:', error)
      }
    }
  }

  const handleCopy = async () => {
    setActiveMenu(null)
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
  }

  const handlePaste = async () => {
    setActiveMenu(null)
    const target = clipboardTarget()
    if (target) {
      try {
        const text = await navigator.clipboard.readText()
        if (!target.valid()) return
        target.editor.insertText(text)
        console.log('[MENU] Pasted from clipboard')
      } catch (error) {
        console.error('[MENU] Paste failed:', error)
      }
    }
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

  const handleFind = (replace = false) => {
    editorViewRef?.current?.openFind(replace)
    setActiveMenu(null)
  }
  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const mac = navigator.userAgent.includes('Mac')
      const mod = mac ? event.metaKey : event.ctrlKey
      if (!currentDocument || !mod) return
      const key = event.key.toLowerCase()
      if (key === 'f' || (mac ? key === 'h' && event.shiftKey : key === 'h')) {
        event.preventDefault(); event.stopPropagation()
        editorViewRef?.current?.openFind(key === 'h')
      }
    }
    document.addEventListener('keydown', search, true)
    return () => document.removeEventListener('keydown', search, true)
  }, [currentDocument, editorViewRef])

  // View menu handlers
  const handleZoomIn = () => { updateConfig({ [fontSizeKey]: Math.min(config[fontSizeKey] + 2, 32) }); setActiveMenu(null) }
  const handleZoomOut = () => { updateConfig({ [fontSizeKey]: Math.max(config[fontSizeKey] - 2, 10) }); setActiveMenu(null) }
  const handleActualSize = () => { updateConfig({ [fontSizeKey]: defaultTextSize }); setActiveMenu(null) }
  const handleAbout = () => { setAboutOpen(true); setActiveMenu(null) }

  const toggleMenu = (menuName: string) => {
    setActiveMenu(activeMenu === menuName ? null : menuName)
  }

  const closeMenus = () => setActiveMenu(null)

  // Keyboard shortcut handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || e.defaultPrevented) return
      const isMac = navigator.userAgent.includes('Mac')
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation()
        const state = useAppStore.getState(), docs = state.documents
        if (!docs.length) return
        const index = docs.findIndex(doc => doc.id === state.currentDocument?.id)
        state.activateDocument(docs[(index + (e.shiftKey ? -1 : 1) + docs.length) % docs.length].id)
        return
      }
      const target = e.target as HTMLElement
      if (target?.closest('input, textarea, select, .markwriter-preview')) {
        // The math source field edits the active document. Save must work while
        // it owns focus; other form fields retain their ordinary input shortcuts.
        const owner = target.closest<HTMLElement>('[data-active="true"]')
        if (!e.isComposing && modKey && e.key.toLowerCase() === 's' && target.closest('.math-source-editor') && owner?.dataset.documentId === currentDocument?.id) {
          e.preventDefault(); e.stopPropagation()
          if (e.shiftKey) void handleSaveAs(); else void handleSave()
        }
        return
      }
      if (modKey) {
        let shouldPrevent = false
        let actionToExecute: (() => void) | null = null

        switch (e.key) {
          case ',':
            shouldPrevent = true
            actionToExecute = () => setSettingsOpen(true)
            break
          case 'w':
            shouldPrevent = true
            actionToExecute = () => { if (currentDocument) void useAppStore.getState().closeDocument(currentDocument.id) }
            break
          case 'Tab': {
            shouldPrevent = true
            actionToExecute = () => {
              const state = useAppStore.getState(), docs = state.documents
              if (!docs.length) return
              const i = docs.findIndex(doc => doc.id === state.currentDocument?.id)
              state.activateDocument(docs[(i + (e.shiftKey ? -1 : 1) + docs.length) % docs.length].id)
            }
            break
          }
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
  })

  return (
    <div className="menu-bar">
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
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
            <button className="menu-option" onClick={() => { void useAppStore.getState().saveAll(); closeMenus() }}>Save All</button>
            <button className="menu-option" disabled={!currentDocument} onClick={() => { if (currentDocument) void useAppStore.getState().closeDocument(currentDocument.id); closeMenus() }}>Close Tab</button>
            <div className="menu-separator" />
            <button
              className="menu-option"
              onClick={handleExportHTML}
              disabled={!currentDocument}
            >
              <span>Export as HTML...</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-option" onClick={() => { closeMenus(); setSettingsOpen(true) }}>Settings…</button>
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
              onClick={() => handleFind()}
              disabled={!currentDocument}
            >
              <span>Find...</span>
              <span className="shortcut">⌘F / Ctrl+F</span>
            </button>
            <button className="menu-option" disabled={!currentDocument} onClick={() => handleFind(true)}>
              <span>Replace...</span><span className="shortcut">⌘⇧H / Ctrl+H</span>
            </button>
          </div>
        )}
      </div>

      <div className="menu-item">
        <button className={`menu-trigger ${activeMenu === 'insert' ? 'active' : ''}`} onClick={() => toggleMenu('insert')}>Insert</button>
        {activeMenu === 'insert' && <div className="menu-dropdown">
          <div className="menu-label">Diagram</div>
          <button className="menu-option" disabled={!currentDocument} onClick={() => { editorViewRef?.current?.insertMarkdown(mermaidErdTemplate); closeMenus() }}>Mermaid ERD</button>
          <button className="menu-option" disabled={!currentDocument} onClick={() => { editorViewRef?.current?.insertMarkdown(dotTemplate); closeMenus() }}>DOT</button>
          <button className="menu-option" disabled={!currentDocument} onClick={() => { editorViewRef?.current?.insertMarkdown(mathTemplate); closeMenus() }}>Math block</button>
        </div>}
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
            <button className="menu-option" aria-pressed={editorMode === 'markdown'} disabled={!currentDocument}
              onClick={() => { editorViewRef?.current?.setMode('markdown'); setActiveMenu(null) }}>
              <span>Markdown with preview</span><span aria-hidden="true">{editorMode === 'markdown' ? '✓' : ''}</span>
            </button>
            <button className="menu-option" aria-pressed={editorMode === 'wysiwyg'} disabled={!currentDocument}
              onClick={() => { editorViewRef?.current?.setMode('wysiwyg'); setActiveMenu(null) }}>
              <span>WYSIWYG</span><span aria-hidden="true">{editorMode === 'wysiwyg' ? '✓' : ''}</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-option" role="menuitemcheckbox" aria-checked={config.syntaxHighlighting}
              onClick={() => { updateConfig({ syntaxHighlighting: !config.syntaxHighlighting }); setActiveMenu(null) }}>
              <span>Syntax highlighting</span><span aria-hidden="true">{config.syntaxHighlighting ? '✓' : ''}</span>
            </button>
            <div className="menu-separator" />
            <div className="menu-label">Theme</div>
            {(['system', 'light', 'dark'] as const).map(value => <button key={value} className="menu-option"
              role="menuitemradio" aria-checked={theme === value}
              onClick={() => { setTheme(value); setActiveMenu(null) }}>
              <span>{value === 'system' ? 'Auto' : value === 'light' ? 'Light' : 'Dark'}</span>
              <span aria-hidden="true">{theme === value ? '✓' : ''}</span>
            </button>)}
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
          ref={helpRef}
          className={`menu-trigger ${activeMenu === 'help' ? 'active' : ''}`}
          onClick={() => toggleMenu('help')}
        >
          Help
        </button>
        {activeMenu === 'help' && (
          <div className="menu-dropdown">
            <button className="menu-option" onClick={() => { closeMenus(); setHelpOpen(true) }}>User Guide</button>
            <button className="menu-option" onClick={handleAbout}>
              <span>About MarkWriter</span>
            </button>
          </div>
        )}
      </div>

      {helpOpen && <HelpDialog returnFocusRef={helpRef} onClose={() => { setHelpOpen(false); helpRef.current?.focus() }} />}
      {aboutOpen && <AboutDialog onClose={() => { setAboutOpen(false); helpRef.current?.focus() }} />}

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
