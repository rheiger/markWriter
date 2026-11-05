import { create } from 'zustand'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { createHtmlExport } from '../lib/htmlExport'

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' && error ? error : fallback
}

// Types for our application state
export interface Document {
  id: string
  title: string
  content: string
  path?: string
  isDirty: boolean
  revision?: number
  savedContent?: string
  lastModified: Date
}

export interface AppConfig {
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  fontFamily: string
  autoSave: boolean
  wordWrap: boolean
}

export interface AppState {
  documents: Document[]
  pendingClose: { id: string, title: string, resolve: (decision: UnsavedDecision) => void } | null
  activateDocument: (id: string) => void
  reorderDocument: (id: string, index: number) => void
  closeDocument: (id: string) => Promise<boolean>
  saveAll: () => Promise<boolean>
  saveToPath: (doc: Document, path: string) => Promise<boolean>
  // Document state
  currentDocument: Document | null
  recentDocuments: Document[]

  // UI state
  config: AppConfig
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentDocument: (doc: Document | null) => void
  updateDocumentContent: (content: string, id?: string) => void
  setDocumentDirty: (dirty: boolean) => void
  addRecentDocument: (doc: Document) => void
  updateConfig: (config: Partial<AppConfig>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Tauri command wrappers
  createNewDocument: () => Promise<void>
  openDocument: (path?: string) => Promise<void>
  saveDocument: (id?: string) => Promise<boolean>
  saveDocumentAs: (path: string, id?: string, snapshot?: Document) => Promise<boolean>
  exportDocument: (path: string, format: string, snapshot?: Document | null) => Promise<void>
}

// Default configuration
const defaultConfig: AppConfig = {
  theme: 'system',
  fontSize: 14,
  fontFamily: 'Monaco, Menlo, Consolas, monospace',
  autoSave: true,
  wordWrap: true,
}

// The active document is an alias to an object in documents, never a separate text buffer.
function workspace(documents: Document[], activeId?: string | null) {
  return { documents, currentDocument: documents.find(doc => doc.id === activeId) ?? null }
}
const saving = new Map<string, Promise<boolean>>()
const destinations = new Map<string, string>()

export const useAppStore = create<AppState>((set, get) => {
  const replace = (id: string, update: (doc: Document) => Document) => set(state => {
    const docs = state.documents.map(doc => doc.id === id ? update(doc) : doc)
    return workspace(docs, state.currentDocument?.id)
  })
  const add = (doc: Document) => set(state => workspace([...state.documents.filter(d => d.id !== doc.id), doc], doc.id))
  const saveSnapshot = (snapshot: Document, path: string, as: boolean): Promise<boolean> => {
    const run = async () => {
      set({ error: null, isLoading: true })
      let canonical = path
      try {
        canonical = await invoke<string>('canonical_document_path', { path }) || path
        if (get().documents.some(d => d.id !== snapshot.id && d.path === canonical) ||
            (destinations.has(canonical) && destinations.get(canonical) !== snapshot.id)) {
          throw new Error('That file is already owned by another open tab. Activate that tab instead.')
        }
        destinations.set(canonical, snapshot.id)
        const result = await invoke<{path?: string, title?: string}>(as ? 'save_document_as' : 'save_document', {
          id: snapshot.id, content: snapshot.content, path: canonical,
        })
        replace(snapshot.id, latest => ({ ...latest, path: result?.path || canonical,
          title: result?.title || canonical.split(/[\\/]/).pop() || 'Untitled',
          savedContent: snapshot.content, isDirty: latest.content !== snapshot.content,
        }))
        return true
      } catch (error) { set({ error: errorMessage(error, 'Failed to save document') }); return false }
      finally {
        if (destinations.get(canonical) === snapshot.id) destinations.delete(canonical)
        set({ isLoading: false })
      }
    }
    const prior = saving.get(snapshot.id)
    const pending = prior ? prior.then(run) : run()
    saving.set(snapshot.id, pending)
    void pending.finally(() => { if (saving.get(snapshot.id) === pending) saving.delete(snapshot.id) })
    return pending
  }
  return {
    documents: [], currentDocument: null, recentDocuments: [], config: defaultConfig,
    isLoading: false, error: null, pendingClose: null,
    setCurrentDocument: doc => doc ? add(doc) : set(workspace([], null)),
    activateDocument: id => set(state => workspace(state.documents, id)),
    reorderDocument: (id, index) => set(state => {
      const docs = state.documents.filter(d => d.id !== id)
      const doc = state.documents.find(d => d.id === id)
      if (doc) docs.splice(Math.max(0, Math.min(index, docs.length)), 0, doc)
      return workspace(docs, state.currentDocument?.id)
    }),
    updateDocumentContent: (content, id = get().currentDocument?.id) => {
      if (!id) return
      replace(id, doc => doc.content === content ? doc : ({ ...doc, content,
        savedContent: doc.savedContent ?? (doc.isDirty ? undefined : doc.content),
        revision: (doc.revision ?? 0) + 1,
        isDirty: content !== (doc.savedContent ?? (doc.isDirty ? undefined : doc.content)), lastModified: new Date(),
      }))
    },
    setDocumentDirty: dirty => {
      const doc = get().currentDocument
      if (doc) replace(doc.id, latest => ({ ...latest, isDirty: dirty }))
    },
    addRecentDocument: doc => set(state => ({ recentDocuments: [doc, ...state.recentDocuments.filter(d => d.path !== doc.path)].slice(0, 10) })),
    updateConfig: config => set(state => ({ config: { ...state.config, ...config } })),
    setLoading: isLoading => set({ isLoading }), setError: error => set({ error }),
    createNewDocument: async () => {
      try {
        const result = await invoke<any>('create_document')
        add({ id: result.id, title: result.title || 'Untitled', content: result.content || '',
          isDirty: false, savedContent: result.content || '', lastModified: new Date() })
      } catch (error) { set({ error: errorMessage(error, 'Failed to create document') }) }
    },
    openDocument: async path => {
      try {
        const result = await invoke<any>('open_document', { path })
        const existing = get().documents.find(d => d.path === result.path)
        if (existing) { get().activateDocument(existing.id); return }
        const doc = { id: result.id, title: result.title || 'Untitled', content: result.content || '',
          savedContent: result.content || '', path: result.path, isDirty: false, lastModified: new Date() }
        add(doc); get().addRecentDocument(doc)
      } catch (error) { set({ error: errorMessage(error, 'Failed to open document') }) }
    },
    saveDocument: async (id = get().currentDocument?.id) => {
      const doc = get().documents.find(d => d.id === id)
      if (!doc) return false
      return saveWithDialog(doc)
    },
    saveDocumentAs: async (path, id = get().currentDocument?.id, snapshot) => {
      const doc = snapshot ?? get().documents.find(d => d.id === id)
      return doc ? saveSnapshot(doc, path, true) : false
    },
    saveToPath: (doc, path) => saveSnapshot(doc, path, false),
    saveAll: async () => {
      const docs = get().documents.filter(d => d.isDirty)
      for (const doc of docs) if (!await saveWithDialog(doc)) return false
      return !get().documents.some(d => d.isDirty)
    },
    closeDocument: async id => {
      const doc = get().documents.find(d => d.id === id)
      if (!doc) return true
      const decision = doc.isDirty ? await decideUnsaved(doc) : 'discard'
      if (decision === 'cancel') return false
      if (decision === 'save' && (!await saveWithDialog(doc) || get().documents.find(d => d.id === id)?.isDirty)) return false
      // Discard must still refer to the revision the user reviewed.
      if (decision === 'discard' && get().documents.find(d => d.id === id)?.content !== doc.content) return false
      set(state => {
        const index = state.documents.findIndex(d => d.id === id)
        const docs = state.documents.filter(d => d.id !== id)
        return workspace(docs, state.currentDocument?.id === id ? docs[Math.min(index, docs.length - 1)]?.id : state.currentDocument?.id)
      })
      return true
    },
    exportDocument: async (path, format, snapshot = get().currentDocument) => {
      if (!snapshot) return
      try {
        if (format !== 'html') throw new Error(`Unsupported export format: ${format}`)
        const html = await createHtmlExport(snapshot.content)
        await invoke('export_document', { html, id: snapshot.id, content: snapshot.content, path, format })
      } catch (error) { set({ error: errorMessage(error, 'Failed to export document') }) }
    },
  }
})

export type UnsavedDecision = 'save' | 'discard' | 'cancel'
function decideUnsaved(doc: Document): Promise<UnsavedDecision> {
  return new Promise(resolve => useAppStore.setState({ pendingClose: { id: doc.id, title: doc.title,
    resolve: decision => { useAppStore.setState({ pendingClose: null }); resolve(decision) },
  } }))
}

export async function saveWithDialog(doc: Document, as = false): Promise<boolean> {
  const path = !as && doc.path ? doc.path : await save({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] })
  if (!path) return false
  return as || !doc.path ? useAppStore.getState().saveDocumentAs(path, doc.id, doc) : useAppStore.getState().saveToPath(doc, path)
}

// Quit collects choices first: Cancel never closes any tab or discards any draft.
export async function confirmDiscardChanges(): Promise<boolean> {
  const reviewed: Document[] = []
  for (const doc of useAppStore.getState().documents) {
    if (!doc.isDirty) continue
    const decision = await decideUnsaved(doc)
    if (decision === 'cancel') return false
    if (decision === 'save' && (!await saveWithDialog(doc) || useAppStore.getState().documents.find(d => d.id === doc.id)?.isDirty)) return false
    if (decision === 'discard') reviewed.push(doc)
  }
  return !useAppStore.getState().documents.some(doc => doc.isDirty && !reviewed.some(d => d.id === doc.id && d.content === doc.content))
}

// Hook for theme management
export const useTheme = () => {
  const { config, updateConfig } = useAppStore()

  const setTheme = (theme: 'light' | 'dark' | 'system') => {
    updateConfig({ theme })

    // Apply theme to document
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  return {
    theme: config.theme,
    setTheme,
  }
}
