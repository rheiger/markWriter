import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// Types for our application state
export interface Document {
  id: string
  title: string
  content: string
  path?: string
  isDirty: boolean
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
  // Document state
  currentDocument: Document | null
  recentDocuments: Document[]
  
  // UI state
  config: AppConfig
  isLoading: boolean
  error: string | null
  
  // Actions
  setCurrentDocument: (doc: Document | null) => void
  updateDocumentContent: (content: string) => void
  setDocumentDirty: (dirty: boolean) => void
  addRecentDocument: (doc: Document) => void
  updateConfig: (config: Partial<AppConfig>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  
  // Tauri command wrappers
  createNewDocument: () => Promise<void>
  openDocument: (path?: string) => Promise<void>
  saveDocument: () => Promise<void>
  saveDocumentAs: (path: string) => Promise<void>
  exportDocument: (path: string, format: string) => Promise<void>
}

// Default configuration
const defaultConfig: AppConfig = {
  theme: 'system',
  fontSize: 14,
  fontFamily: 'Monaco, Menlo, Consolas, monospace',
  autoSave: true,
  wordWrap: true,
}

// Create the store
export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  currentDocument: null,
  recentDocuments: [],
  config: defaultConfig,
  isLoading: false,
  error: null,
  
  // Basic setters
  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  
  updateDocumentContent: (content) => {
    const current = get().currentDocument
    if (current) {
      set({
        currentDocument: {
          ...current,
          content,
          isDirty: current.content !== content,
          lastModified: new Date(),
        }
      })
    }
  },
  
  setDocumentDirty: (dirty) => {
    const current = get().currentDocument
    if (current) {
      set({
        currentDocument: { ...current, isDirty: dirty }
      })
    }
  },
  
  addRecentDocument: (doc) => {
    const current = get().recentDocuments
    const filtered = current.filter(d => d.id !== doc.id)
    set({
      recentDocuments: [doc, ...filtered].slice(0, 10) // Keep only 10 recent
    })
  },
  
  updateConfig: (newConfig) => {
    set({
      config: { ...get().config, ...newConfig }
    })
  },
  
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  // Tauri command wrappers with error handling
  createNewDocument: async () => {
    const { setCurrentDocument, setError, setLoading } = get()
    try {
      setLoading(true)
      setError(null)
      
      const result = await invoke('create_document') as any
      
      const newDoc: Document = {
        id: result.id,
        title: result.title || 'Untitled',
        content: result.content || '',
        path: result.path,
        isDirty: false,
        lastModified: new Date(result.last_modified || Date.now()),
      }
      
      setCurrentDocument(newDoc)
    } catch (error) {
      console.error('Failed to create document:', error)
      setError(error instanceof Error ? error.message : 'Failed to create document')
    } finally {
      setLoading(false)
    }
  },
  
  openDocument: async (path) => {
    const { setCurrentDocument, addRecentDocument, setError, setLoading } = get()
    try {
      setLoading(true)
      setError(null)
      
      const result = await invoke('open_document', { path }) as any
      
      const doc: Document = {
        id: result.id,
        title: result.title || 'Untitled',
        content: result.content || '',
        path: result.path,
        isDirty: false,
        lastModified: new Date(result.last_modified || Date.now()),
      }
      
      setCurrentDocument(doc)
      addRecentDocument(doc)
    } catch (error) {
      console.error('Failed to open document:', error)
      setError(error instanceof Error ? error.message : 'Failed to open document')
    } finally {
      setLoading(false)
    }
  },
  
  saveDocument: async () => {
    const { currentDocument, setDocumentDirty, addRecentDocument, setError, setLoading } = get()
    if (!currentDocument) return
    
    try {
      setLoading(true)
      setError(null)
      
      const result = await invoke('save_document', {
        id: currentDocument.id,
        content: currentDocument.content,
      }) as any
      
      setDocumentDirty(false)
      
      // Update document with saved path if new
      if (result.path && !currentDocument.path) {
        const updatedDoc = { ...currentDocument, path: result.path }
        get().setCurrentDocument(updatedDoc)
        addRecentDocument(updatedDoc)
      }
    } catch (error) {
      console.error('Failed to save document:', error)
      setError(error instanceof Error ? error.message : 'Failed to save document')
    } finally {
      setLoading(false)
    }
  },
  
  saveDocumentAs: async (path) => {
    const { currentDocument, setCurrentDocument, setDocumentDirty, addRecentDocument, setError, setLoading } = get()
    if (!currentDocument) return
    
    try {
      setLoading(true)
      setError(null)
      
      const result = await invoke('save_document_as', {
        id: currentDocument.id,
        content: currentDocument.content,
        path,
      }) as any
      
      const updatedDoc: Document = {
        ...currentDocument,
        path: result.path,
        title: result.title || path.split('/').pop() || 'Untitled',
        isDirty: false,
      }
      
      setCurrentDocument(updatedDoc)
      setDocumentDirty(false)
      addRecentDocument(updatedDoc)
    } catch (error) {
      console.error('Failed to save document as:', error)
      setError(error instanceof Error ? error.message : 'Failed to save document')
    } finally {
      setLoading(false)
    }
  },
  
  exportDocument: async (path, format) => {
    const { currentDocument, setError, setLoading } = get()
    if (!currentDocument) return
    
    try {
      setLoading(true)
      setError(null)
      
      await invoke('export_document', {
        id: currentDocument.id,
        content: currentDocument.content,
        path,
        format,
      })
    } catch (error) {
      console.error('Failed to export document:', error)
      setError(error instanceof Error ? error.message : 'Failed to export document')
    } finally {
      setLoading(false)
    }
  },
}))

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
