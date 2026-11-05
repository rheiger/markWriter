import React, { useEffect, useRef } from 'react'
import { useAppStore, useTheme, confirmDiscardChanges } from './store/useAppStore'
import { EditorView, EditorViewRef } from './components/EditorView'
import { MenuBar } from './components/MenuBar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ErrorToast } from './components/ErrorToast'
import { LoadingSpinner } from './components/LoadingSpinner'
import { isTauri, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'

const App: React.FC = () => {
  const { currentDocument, isLoading, error, createNewDocument } = useAppStore()
  const { theme } = useTheme()
  const editorViewRef = useRef<EditorViewRef>(null)

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
      if (!useAppStore.getState().currentDocument?.isDirty) return
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
      <MenuBar editorViewRef={editorViewRef} />
      <Toolbar editorViewRef={editorViewRef} />

      <main className="app-main">
        {isLoading && <LoadingSpinner />}
        <EditorView ref={editorViewRef} />
      </main>

      <StatusBar />

      {error && <ErrorToast message={error} />}
    </div>
  )
}

export default App
