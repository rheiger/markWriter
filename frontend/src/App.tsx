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
import { listen } from '@tauri-apps/api/event'
import { openOsBatch, type OsOpenBatch } from './lib/osOpen'
import './App.css'
import { loadPreferences, watchPreferences, loadWorkspace, watchWorkspace } from './lib/persistence'
import { DocumentTabs, UnsavedDialog, RecoveryNotice } from './components/DocumentTabs'

const App: React.FC = () => {
  const { currentDocument, isLoading, error, createNewDocument, config } = useAppStore()
  const { theme } = useTheme()
  const editorViewRef = useRef<EditorViewRef>(null)

  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg')
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${config.fontSize}px`)
    document.documentElement.style.setProperty('--preview-font-size', `${config.renderedFontSize}px`)
    document.documentElement.style.setProperty('--source-font-family', config.fontFamily)
    document.documentElement.style.setProperty('--rendered-font-family', config.renderedFontFamily)
    document.documentElement.style.setProperty('--rendered-line-height', String(config.renderedLineHeight))
  }, [config.fontSize, config.renderedFontSize, config.fontFamily, config.renderedFontFamily, config.renderedLineHeight])

  // Initialize the application
  const [ready, setReady] = useState(!isTauri())
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
    void loadPreferences().then(loadWorkspace).then(async () => {
      if (!useAppStore.getState().currentDocument) await createNewDocument()
      setReady(true)
    })
  }, [currentDocument, createNewDocument])

  useEffect(() => { if (ready) return watchPreferences() }, [ready])
  useEffect(() => { if (ready) return watchWorkspace() }, [ready])

  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault()
      if (!ready) return
      try {
        if (await confirmDiscardChanges()) await invoke('quit_app')
      } catch (error) {
        useAppStore.getState().setError(String(error))
      }
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(error => {
      useAppStore.getState().setError(String(error))
    })
    return () => { disposed = true; unlisten?.() }
  }, [ready])

  useEffect(() => {
    if (!ready || !isTauri()) return
    let disposed = false
    let draining = false
    let again = false
    const stops: (() => void)[] = []
    const drain = async () => {
      if (draining) { again = true; return }
      draining = true
      try {
        do {
          again = false
          const batch = await invoke<OsOpenBatch>('take_os_open')
          await openOsBatch(batch, () => disposed)
        } while (again && !disposed)
      } catch (error) { useAppStore.getState().setError(String(error)) }
      finally { draining = false }
    }
    void Promise.all([
      listen('os-open-pending', () => { void drain() }),
    ]).then(unlisten => {
      if (disposed) { unlisten.forEach(stop => stop()); return }
      stops.push(...unlisten)
      void drain()
    }).catch(error => useAppStore.getState().setError(String(error)))
    return () => { disposed = true; stops.forEach(stop => stop()) }
  }, [ready])

  if (!ready) return <div className="app" role="status">Restoring workspace…</div>

  return (
    <div className="app">
      <MenuBar editorViewRef={editorViewRef} editorMode={editorMode} />
      <Toolbar editorViewRef={editorViewRef} editorMode={editorMode} />

      <DocumentTabs />
      <RecoveryNotice />
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
