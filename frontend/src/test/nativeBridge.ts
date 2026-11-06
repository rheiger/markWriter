import { invoke } from '@tauri-apps/api/core'
import { flushWorkspace } from '../lib/persistence'
import { useAppStore } from '../store/useAppStore'
import { EditorView } from '@codemirror/view'
import { foldedRanges } from '@codemirror/language'

function sourceView() {
  const dom = document.querySelector<HTMLElement>('[data-active=true] .cm-content')
  return dom ? EditorView.findFromDOM(dom) : null
}

// Test-only access to the real store actions, including real Tauri IPC.
// Native OS dialogs are bypassed by explicit fixture paths; commands are not mocked.
export function installNativeBridge() {
  Object.defineProperty(window, '__MARKWRITER_ACCEPTANCE__', {
    value: {
      snapshot: () => {
        const state = useAppStore.getState()
        return { documents: state.documents, config: state.config, document: state.currentDocument, error: state.error, loading: state.isLoading }
      },
      sourceInfo: () => {
        const view = sourceView()
        if (!view) return null
        const preview = document.querySelector<HTMLElement>('[data-active=true] .markwriter-preview')?.parentElement
        const origin = view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop
        return { selection: { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head },
          folds: foldedRanges(view.state).size, sourceScroll: view.scrollDOM.scrollTop, previewScroll: preview?.scrollTop,
          sourceTop: view.state.doc.lineAt(view.lineBlockAtHeight(Math.max(0, view.scrollDOM.scrollTop + 16 - origin)).from).text,
          previewTop: preview ? Array.from(preview.querySelectorAll('h1,h2,h3,p,tr')).find(el => el.getBoundingClientRect().bottom > preview.getBoundingClientRect().top + 16)?.textContent : '',
        }
      },
      selectSource: (anchor: number, head = anchor) => sourceView()?.dispatch({ selection: { anchor, head } }),
      scrollSource: (top: number) => { const view = sourceView(); if (view) view.scrollDOM.scrollTop = top },
      scrollSourceTo: (text: string) => {
        const view = sourceView(); if (!view) return
        const position = view.state.doc.toString().indexOf(text)
        if (position < 0) throw new Error('Missing acceptance anchor')
        view.dispatch({ effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 16 }) })
      },
      configure: (patch: Parameters<ReturnType<typeof useAppStore.getState>['updateConfig']>[0]) => useAppStore.getState().updateConfig(patch),
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
