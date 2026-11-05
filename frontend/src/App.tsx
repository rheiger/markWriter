import React, { useEffect, useRef, useState } from 'react'
import { useAppStore, useTheme, confirmDiscardChanges } from './store/useAppStore'
import { EditorView, EditorViewRef, EditorMode } from './components/EditorView'
import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ErrorToast } from './components/ErrorToast'
import { LoadingSpinner } from './components/LoadingSpinner'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'
import { DocumentTabs, UnsavedDialog } from './components/DocumentTabs'

const App: React.FC = () => {
  const { currentDocument, isLoading, error, createNewDocument, config } = useAppStore()
  const { theme } = useTheme()
  const editorViewRef = useRef<EditorViewRef>(null)

  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg')
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${config.fontSize}px`)
    document.documentElement.style.setProperty('--preview-font-size', `${config.fontSize + 2}px`)
  }, [config.fontSize])

  // Initialize the application
  const didInitRef = useRef(false)
  useEffect(() => {
    // Apply theme on startup
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    if (!currentDocument) createNewDocument()
  }, [currentDocument, createNewDocument])

  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    getCurrentWindow().onCloseRequested(async event => {
      if (!useAppStore.getState().documents.some(doc => doc.isDirty)) return
      event.preventDefault()
      try {
        if (await confirmDiscardChanges()) await invoke('quit_app')
      } catch (error) {
        useAppStore.getState().setError(String(error))
      }
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(error => {
      useAppStore.getState().setError(String(error))
    })
    return () => { disposed = true; unlisten?.() }
  }, [])

  return (
    <div className="app">
      <MenuBar editorViewRef={editorViewRef} editorMode={editorMode} />
      <Toolbar editorViewRef={editorViewRef} editorMode={editorMode} />

      <DocumentTabs />
      <main className="app-main">
        {isLoading && <LoadingSpinner />}
        <EditorView ref={editorViewRef} onModeChange={setEditorMode} />
      </main>

      <StatusBar />
      <UnsavedDialog />

      {error && <ErrorToast message={error} />}
    </div>
  )
}

export default App
