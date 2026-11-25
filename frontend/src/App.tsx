import React, { useEffect, useRef, useState } from 'react'
import { useAppStore, useTheme, watchOpenDocuments, withDocumentDialog } from './store/useAppStore'
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
import { cancelAppQuit, closeEditorWindow, prepareInitialTransfers, receiveEditorTransfers, recoverEditorTransfer, reviewAppQuit } from './lib/windowWorkspace'
import './App.css'
import { loadPreferences, watchPreferences, loadWorkspace, watchWorkspace } from './lib/persistence'
import { DocumentTabs, UnsavedDialog, RecoveryNotice, ExternalChangeNotice } from './components/DocumentTabs'

const App: React.FC = () => {
  const { currentDocument, isLoading, error, createNewDocument, config, windowBusy, pendingClose, transferRecovery } = useAppStore()
  const { theme } = useTheme()
  const editorViewRef = useRef<EditorViewRef>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)

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
      if (isTauri()) await prepareInitialTransfers()
      if (!useAppStore.getState().currentDocument && (!isTauri() || (getCurrentWindow().label ?? 'main') === 'main')) {
        await createNewDocument()
      }
      setReady(true)
    })
  }, [currentDocument, createNewDocument])

  useEffect(() => { if (ready) return watchPreferences(true) }, [ready])
  useEffect(() => { if (ready) return watchWorkspace() }, [ready])
  useEffect(() => { if (ready && isTauri()) return watchOpenDocuments() }, [ready])

  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault()
      if (ready && !document.querySelector('dialog[open]')) await closeEditorWindow()
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(error => {
      useAppStore.getState().setError(String(error))
    })
    return () => { disposed = true; unlisten?.() }
  }, [ready])

  useEffect(() => {
    if (!ready || !isTauri()) return
    let disposed = false
    let draining = false
    let osPending = true
    let transfersPending = true
    let focusId: string | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    const stops: (() => void)[] = []
    const activateRequestedTab = () => {
      const state = useAppStore.getState()
      if (!state.windowBusy && focusId && state.documents.some(doc => doc.id === focusId)) {
        const id = focusId
        focusId = undefined
        state.activateDocument(id)
      }
    }
    const drain = async () => {
      if (draining || disposed) return
      draining = true
      clearTimeout(retry)
      try {
        if (transfersPending) {
          transfersPending = false
          if (!await receiveEditorTransfers()) transfersPending = true
        }
        if (!disposed && !useAppStore.getState().windowBusy && osPending) {
          osPending = false
          await withDocumentDialog(async () => {
            const batch = await invoke<OsOpenBatch | null>('take_os_open')
            if (batch) await openOsBatch(batch, () => disposed)
          })
        }
        if (!disposed) activateRequestedTab()
      } catch (error) { useAppStore.getState().setError(String(error)) }
      finally {
        draining = false
        if (!disposed && (transfersPending || osPending)) retry = setTimeout(() => void drain(), 300)
      }
    }
    const stopStore = useAppStore.subscribe((state, previous) => {
      if (!state.windowBusy && (previous.windowBusy || state.documents !== previous.documents)) activateRequestedTab()
    })
    const target = getCurrentWindow().label ?? 'main'
    void Promise.all([
      listen('os-open-pending', () => { osPending = true; void drain() }, { target }),
      listen('editor-transfer-pending', () => { transfersPending = true; void drain() }, { target }),
      listen<{ id: string }>('editor-focus-document', ({ payload }) => { focusId = payload.id; activateRequestedTab() }, { target }),
      listen<{ token: string }>('editor-quit-requested', ({ payload }) => { void reviewAppQuit(payload.token) }, { target }),
      listen<{ token: string, message?: string }>('editor-quit-cancelled', ({ payload }) => cancelAppQuit(payload.token, payload.message)),
    ]).then(unlisten => {
      if (disposed) { unlisten.forEach(stop => stop()); return }
      stops.push(...unlisten)
      void invoke('mark_editor_window_ready').then(drain).catch(error => useAppStore.getState().setError(String(error)))
    }).catch(error => useAppStore.getState().setError(String(error)))
    return () => {
      disposed = true
      clearTimeout(retry)
      stopStore()
      stops.forEach(stop => stop())
    }
  }, [ready])

  if (!ready) return <div className="app" role="status">Restoring workspace…</div>

  return (
    <div className="app">
      <div className="app-workspace" inert={windowBusy}>
        <MenuBar editorViewRef={editorViewRef} editorMode={editorMode} openButtonRef={openButtonRef} />
        <Toolbar editorViewRef={editorViewRef} editorMode={editorMode} openButtonRef={openButtonRef} />

        <DocumentTabs />
        <RecoveryNotice />
        <ExternalChangeNotice />
        <main className="app-main">
          {isLoading && <LoadingSpinner />}
          <EditorView ref={editorViewRef} onModeChange={setEditorMode} />
        </main>

        <StatusBar />
      </div>
      {windowBusy && !pendingClose && !transferRecovery && <div className="window-operation" role="status">Updating windows…</div>}
      {transferRecovery && <div className="recovery-notice" role="alert">
        <span>Could not restore Undo history for the moved tab. Its text is intact. {transferRecovery.message}</span>
        <button onClick={() => void recoverEditorTransfer(transferRecovery.id, true)}>Retry history</button>
        <button onClick={() => void recoverEditorTransfer(transferRecovery.id, false)}>Use text only</button>
      </div>}
      <UnsavedDialog />

      {error && <ErrorToast message={error} />}
    </div>
  )
}

export default App
