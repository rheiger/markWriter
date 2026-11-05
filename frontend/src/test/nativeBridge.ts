import { invoke } from '@tauri-apps/api/core'
import { flushWorkspace } from '../lib/persistence'
import { useAppStore } from '../store/useAppStore'

// Test-only access to the real store actions, including real Tauri IPC.
// Native OS dialogs are bypassed by explicit fixture paths; commands are not mocked.
export function installNativeBridge() {
  Object.defineProperty(window, '__MARKWRITER_ACCEPTANCE__', {
    value: {
      snapshot: () => {
        const state = useAppStore.getState()
        return { documents: state.documents, config: state.config, document: state.currentDocument, error: state.error, loading: state.isLoading }
      },
      flush: () => flushWorkspace(),
      interrupt: () => invoke('quit_app'),
      activate: (id: string) => useAppStore.getState().activateDocument(id),
      close: (id: string) => useAppStore.getState().closeDocument(id),
      saveAll: () => useAppStore.getState().saveAll(),
      create: () => useAppStore.getState().createNewDocument(),
      open: (path: string) => useAppStore.getState().openDocument(path),
      save: () => useAppStore.getState().saveDocument(),
      saveAs: (path: string) => useAppStore.getState().saveDocumentAs(path),
      exportHtml: (path: string) => useAppStore.getState().exportDocument(path, 'html'),
    },
  })
}
