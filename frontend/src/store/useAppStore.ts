import { create } from 'zustand'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  flushPreferences, flushWorkspace, persistPreferencesForCheckpoint, sameWorkspaceRecoveryState, snapshotWorkspace,
} from '../lib/persistence'
import { createHtmlExport } from '../lib/htmlExport'
import { rememberFileView, type FileView } from '../lib/session'
import { dialogFolderOptions } from '../lib/dialogFolders'

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' && error ? error : fallback
}

export type DiskIssue = 'changed' | 'missing' | 'unreadable' | 'tooLarge'

function isDiskIssue(value: unknown): value is DiskIssue {
  return value === 'changed' || value === 'missing' || value === 'unreadable' || value === 'tooLarge'
}

export function diskIssueMessage(issue: DiskIssue): string {
  switch (issue) {
    case 'changed': return 'The file changed on disk.'
    case 'missing': return 'The file is missing or was renamed.'
    case 'unreadable': return 'The file could not be read.'
    case 'tooLarge': return 'Automatic change detection is unavailable for files larger than 1 MiB.'
  }
}

// Types for our application state
export interface Document {
  id: string
  title: string
  content: string
  path?: string
  isDirty: boolean
  conflictPath?: string
  diskContent?: string
  diskIssue?: DiskIssue
  diskRevision?: number
  reloadCount?: number
  mode?: 'markdown' | 'wysiwyg'
  revision?: number
  viewState?: Partial<Record<'sourceAnchor' | 'sourceHead' | 'sourceScroll' | 'previewScroll' | 'renderedAnchor' | 'renderedHead' | 'renderedScroll', number>>
  sourceViewportAnchor?: number
  savedContent?: string
  lastModified: Date
}

export type { AppConfig } from '../lib/preferences'
import { type AppConfig, type UpdateChoices, defaultConfig, parsePreferences } from '../lib/preferences'

export interface AppState {
  documents: Document[]
  pendingClose: { id: string, title: string, resolve: (decision: UnsavedDecision) => void } | null
  pendingDiskReload: { document: Document, loading: boolean } | null
  activateDocument: (id: string) => void
  rememberView: (id: string, viewState: NonNullable<Document['viewState']>, sourceViewportAnchor?: number) => void
  reorderDocument: (id: string, index: number) => void
  closeDocument: (id: string) => Promise<boolean>
  closeOtherDocuments: (keepId: string) => Promise<boolean>
  saveAll: () => Promise<boolean>
  saveToPath: (doc: Document, path: string) => Promise<boolean>
  refreshDocumentDisk: (id: string, stopped?: () => boolean) => Promise<void>
  reloadDocument: (document: Document, discardEdits?: boolean) => Promise<boolean>
  saveDocumentCopy: (document: Document, path: string) => Promise<boolean>
  // Document state
  currentDocument: Document | null
  windowBusy: boolean
  transferRecovery: { id: string, message: string } | null
  recentDocuments: Document[]
  fileViews: FileView[]

  // UI state
  config: AppConfig
  updateChoices: UpdateChoices
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentDocument: (doc: Document | null) => void
  updateDocumentContent: (content: string, id?: string, reloadCount?: number) => void
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

// The active document is an alias to an object in documents, never a separate text buffer.
function workspace(documents: Document[], activeId?: string | null) {
  return { documents, currentDocument: documents.find(doc => doc.id === activeId) ?? null }
}
const saving = new Map<string, Promise<boolean>>()
const checking = new Map<string, Promise<unknown>>()
const destinations = new Map<string, string>()
const reloading = new Set<string>()
const monitorCharacterLimit = 1024 * 1024

function baseline(doc: Document) {
  return doc.savedContent ?? (doc.isDirty ? undefined : doc.content)
}

function sameDiskOwner(captured: Document, latest: Document | undefined): latest is Document {
  return latest !== undefined && latest.path === captured.path && latest.diskRevision === captured.diskRevision &&
    baseline(latest) === baseline(captured)
}
let closing = false
let loadingDocuments = 0
let pendingDocumentDialogs = 0
let checkpointing = false
let windowReviewingSaves = false
let fileOperations = 0

export interface DocumentOwner { label: string, id: string }
type OpenOwnedDocument = { document: { id: string, path: string, title?: string, content?: string }, owner?: never } |
  { owner: DocumentOwner, document?: never }

export function suspendWindowWorkspace(): (() => void) | undefined {
  if (checkpointing || hasPendingDocumentOperation(useAppStore.getState())) return undefined
  activeViewCapture?.capture()
  useAppStore.setState({ windowBusy: true })
  return () => useAppStore.setState({ windowBusy: false })
}

export function workspaceAfterRemoving(state: AppState, id: string) {
  const index = state.documents.findIndex(doc => doc.id === id)
  const documents = state.documents.filter(doc => doc.id !== id)
  const activeId = state.currentDocument?.id === id ? documents[Math.min(index, documents.length - 1)]?.id : state.currentDocument?.id
  return workspace(documents, activeId)
}

let activeViewCapture: { id: string, capture: () => void } | undefined
export function registerActiveViewCapture(id: string, capture: () => void) {
  const registration = { id, capture }
  activeViewCapture = registration
  return () => { if (activeViewCapture === registration) activeViewCapture = undefined }
}

export const useAppStore = create<AppState>((set, get) => {
  const replace = (id: string, update: (doc: Document) => Document) => set(state => {
    const docs = state.documents.map(doc => doc.id === id ? update(doc) : doc)
    return workspace(docs, state.currentDocument?.id)
  })
  const captureBeforeActivating = (id: string) => {
    const current = get().currentDocument?.id
    if (activeViewCapture && current !== id && activeViewCapture.id === current) activeViewCapture.capture()
  }
  const add = (doc: Document) => {
    captureBeforeActivating(doc.id)
    set(state => workspace([...state.documents.filter(d => d.id !== doc.id), doc], doc.id))
  }
  const find = (id: string) => get().documents.find(doc => doc.id === id)
  const setDiskIssue = (captured: Document, diskIssue: DiskIssue | undefined, invalidate = false) => {
    const latest = find(captured.id)
    if (!sameDiskOwner(captured, latest) || (latest.diskIssue === diskIssue && !invalidate)) return
    replace(captured.id, doc => ({ ...doc, diskIssue,
      diskRevision: invalidate ? (doc.diskRevision ?? 0) + 1 : doc.diskRevision,
    }))
  }
  const saveSnapshot = (snapshot: Document, path: string, as: boolean): Promise<boolean> => {
    if (get().windowBusy && !windowReviewingSaves) return Promise.resolve(false)
    const run = async () => {
      set({ error: null, isLoading: true })
      let canonical = path
      let reserved = false
      let guarded: Document | undefined
      try {
        // A Windows replacement can fail while a previous scan still holds
        // the target open, even with normal read sharing.
        const scan = checking.get(snapshot.id)
        if (scan) await scan.catch(() => {})
        const owner = find(snapshot.id)
        if (!owner || owner.path !== snapshot.path || owner.reloadCount !== snapshot.reloadCount || reloading.has(snapshot.id)) {
          throw new Error('The document changed while preparing to save. Review it and try again.')
        }
        // Resolve the parent first for Save As so a symlink replacing the
        // owned filename cannot silently turn it into an unguarded new destination.
        if (as && path !== owner.path) {
          const ownedPaths = get().documents.flatMap(doc => doc.path ? [doc.path] : [])
          canonical = await invoke<string>('canonical_document_path', { path, ownedPaths }) || path
        }
        const latestOwner = find(snapshot.id)
        if (!latestOwner || latestOwner.path !== owner.path || latestOwner.reloadCount !== owner.reloadCount) {
          throw new Error('The document changed while preparing to save. Review it and try again.')
        }
        if (get().documents.some(d => d.id !== snapshot.id && d.path === canonical) || destinations.has(canonical)) {
          throw new Error('That file is already owned by another open tab. Activate that tab instead.')
        }
        const expected = canonical === owner.path ? baseline(owner) : undefined
        if (canonical === owner.path && expected === undefined) {
          guarded = owner
          throw { diskState: 'unreadable' }
        }
        destinations.set(canonical, snapshot.id)
        reserved = true
        guarded = expected === undefined ? undefined : owner
        const result = await invoke<{path?: string, title?: string}>(guarded ? 'save_document' : 'save_document_as', {
          id: snapshot.id, content: snapshot.content, path: canonical, ...(guarded ? { expected } : {}),
        })
        if (get().documents.some(doc => doc.id !== snapshot.id && doc.path === canonical)) {
          throw new Error('Destination ownership changed while saving. The written file is retained and this buffer remains open.')
        }
        replace(snapshot.id, latest => latest.path !== owner.path ? latest : ({ ...latest, path: result?.path || canonical,
          title: result?.title || canonical.split(/[\\/]/).pop() || 'Untitled',
          conflictPath: undefined, diskContent: undefined, diskIssue: undefined, diskRevision: (latest.diskRevision ?? 0) + 1,
          savedContent: snapshot.content, isDirty: latest.content !== snapshot.content,
        }))
        return true
      } catch (error) {
        const diskState = (error as { diskState?: unknown } | null)?.diskState
        if (guarded && isDiskIssue(diskState)) {
          setDiskIssue(guarded, diskState, true)
          set({ error: `Save stopped. ${diskIssueMessage(diskState)} Reload the file or save your edits to a new path.` })
        } else set({ error: errorMessage(error, 'Failed to save document') })
        return false
      } finally {
        if (reserved) destinations.delete(canonical)
        set({ isLoading: false })
      }
    }
    const prior = saving.get(snapshot.id)
    const pending = prior ? prior.then(run) : run()
    saving.set(snapshot.id, pending)
    void pending.finally(() => { if (saving.get(snapshot.id) === pending) saving.delete(snapshot.id) })
    return pending
  }
  const closeDocuments = async (ids: string[]): Promise<boolean> => {
    if (closing || get().windowBusy) return false
    closing = true
    try {
      for (const id of ids) {
        if (get().pendingDiskReload || reloading.has(id)) return false
        const doc = find(id)
        if (!doc) continue
        const decision = doc.isDirty ? await decideUnsaved(doc) : 'discard'
        if (decision === 'cancel') return false
        if (decision === 'save' && !await saveWithDialog(doc)) return false

        // Discard refers to the content the user reviewed. Save may leave newer edits.
        const canClose = () => {
          const latest = find(id)
          return latest && (decision === 'discard' ? latest.content === doc.content : !latest.isDirty)
        }
        if (!canClose()) return false
        if (get().currentDocument?.id === id && activeViewCapture?.id === id) activeViewCapture.capture()
        const stateBeforeClose = get()
        const remaining = workspaceAfterRemoving(stateBeforeClose, id)
        const fileViews = rememberFileView(stateBeforeClose.fileViews, find(id))
        try {
          await flushWorkspace(snapshotWorkspace(remaining.documents, fileViews, remaining.currentDocument?.id ?? null))
          if (!canClose()) {
            await flushWorkspace()
            return false
          }
        } catch (error) {
          set({ error: `Cannot remove recovery copy: ${String(error)}` })
          return false
        }
        set(state => ({ ...workspaceAfterRemoving(state, id), fileViews }))
        if (isTauri() && doc.path) {
          try { await invoke('release_document_claim', { id }) }
          catch (error) { set({ error: `Could not release the file's window ownership: ${String(error)}` }) }
        }
      }
      return true
    } catch (error) {
      set({ error: errorMessage(error, 'Could not close the tab') })
      return false
    } finally {
      closing = false
    }
  }
  return {
    documents: [], currentDocument: null, recentDocuments: [], fileViews: [], config: defaultConfig, updateChoices: {},
    isLoading: false, error: null, pendingClose: null, pendingDiskReload: null, windowBusy: false, transferRecovery: null,
    setCurrentDocument: doc => doc ? add(doc) : set(workspace([], null)),
    activateDocument: id => {
      if (get().windowBusy) return
      captureBeforeActivating(id)
      set(state => workspace(state.documents, id))
    },
    rememberView: (id, patch, sourceViewportAnchor) => set(state => {
      const prior = state.documents.find(doc => doc.id === id)
      if (!prior || (sourceViewportAnchor === undefined || sourceViewportAnchor === prior.sourceViewportAnchor) &&
          Object.entries(patch).every(([key, value]) => prior.viewState?.[key as keyof typeof patch] === value)) return state
      return workspace(state.documents.map(doc => doc.id === id ? { ...doc, viewState: { ...doc.viewState, ...patch },
        sourceViewportAnchor: sourceViewportAnchor ?? doc.sourceViewportAnchor } : doc), state.currentDocument?.id)
    }),
    reorderDocument: (id, index) => set(state => {
      if (state.windowBusy) return state
      const docs = state.documents.filter(d => d.id !== id)
      const doc = state.documents.find(d => d.id === id)
      if (doc) docs.splice(Math.max(0, Math.min(index, docs.length)), 0, doc)
      return workspace(docs, state.currentDocument?.id)
    }),
    updateDocumentContent: (content, id = get().currentDocument?.id, reloadCount) => {
      if (get().windowBusy || !id || (reloadCount !== undefined && (find(id)?.reloadCount ?? 0) !== reloadCount)) return
      replace(id, doc => doc.content === content ? doc : ({ ...doc, content,
        savedContent: doc.savedContent ?? (doc.isDirty ? undefined : doc.content),
        revision: (doc.revision ?? 0) + 1,
        isDirty: content !== (doc.savedContent ?? (doc.isDirty ? undefined : doc.content)), lastModified: new Date(),
      }))
    },
    setDocumentDirty: dirty => {
      if (get().windowBusy) return
      const doc = get().currentDocument
      if (doc) replace(doc.id, latest => ({ ...latest, isDirty: dirty }))
    },
    addRecentDocument: doc => set(state => ({ recentDocuments: [doc, ...state.recentDocuments.filter(d => d.path !== doc.path)].slice(0, 10) })),
    updateConfig: config => {
      try {
        const previous = get().config
        const next = parsePreferences({ version: 1, config: { ...previous, ...config } })
        set({ config: next })
      } catch (error) { set({ error: errorMessage(error, 'Invalid preferences') }) }
    },
    setLoading: isLoading => set({ isLoading }), setError: error => set({ error }),
    createNewDocument: async () => {
      if (get().windowBusy) return
      const mode = get().config.defaultEditorMode
      loadingDocuments++
      try {
        const result = await invoke<any>('create_document')
        add({ id: result.id, title: result.title || 'Untitled', content: result.content || '',
          mode, isDirty: false, savedContent: result.content || '', lastModified: new Date() })
      } catch (error) { set({ error: errorMessage(error, 'Failed to create document') }) }
      finally { loadingDocuments-- }
    },
    openDocument: async path => {
      if (!path || get().windowBusy) return
      loadingDocuments++
      try {
        const read = async (candidate: string) => {
          if (!isTauri()) return invoke<NonNullable<OpenOwnedDocument['document']>>('open_document', { path: candidate })
          const opened = await invoke<OpenOwnedDocument>('open_owned_document', { path: candidate })
          if (opened.document) return opened.document
          if (find(opened.owner.id)) get().activateDocument(opened.owner.id)
          else await invoke('focus_editor_window', { label: opened.owner.label, id: opened.owner.id })
          return undefined
        }
        let result = await read(path)
        if (!result) return
        const canonicalPath = result.path
        const owner = destinations.get(canonicalPath)
        if (owner) {
          // Read may have raced the atomic rename. Await its owner and activate the saved tab.
          await saving.get(owner)
          const written = get().documents.find(d => d.id === owner && d.path === canonicalPath)
          if (written) { get().activateDocument(written.id); return }
          result = await read(canonicalPath)
          if (!result) return
        }
        const existing = get().documents.find(d => d.path === result.path)
        if (existing) { get().activateDocument(existing.id); return }
        const doc = { id: result.id, title: result.title || 'Untitled', content: result.content || '',
          savedContent: result.content || '', path: result.path, isDirty: false, lastModified: new Date() }
        const remembered = get().fileViews.find(entry => entry.path === doc.path)
        const opened = remembered ? { ...doc, mode: remembered.mode, viewState: remembered.viewState,
          sourceViewportAnchor: remembered.sourceViewportAnchor } : doc
        add(opened); get().addRecentDocument(opened)
      } catch (error) { set({ error: errorMessage(error, 'Failed to open document') }) }
      finally { loadingDocuments-- }
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
    refreshDocumentDisk: async (id, stopped = () => false) => {
      const captured = find(id)
      if (get().windowBusy || !captured?.path || saving.has(id) || reloading.has(id) || checking.has(id)) return
      const expected = baseline(captured)
      const scan = Promise.resolve().then(() => expected === undefined ? 'unreadable' : invoke('monitor_document_disk', {
        path: captured.path, expected: expected.length <= monitorCharacterLimit ? expected : null,
      }))
      checking.set(id, scan)
      let result: unknown
      try { result = await scan }
      catch { result = 'unreadable' }
      finally { checking.delete(id) }
      if (stopped() || get().windowBusy || saving.has(id) || reloading.has(id)) return
      if (result === 'tooLarge' && captured.diskIssue === 'changed') return
      setDiskIssue(captured, result === 'unchanged' ? undefined : isDiskIssue(result) ? result : 'unreadable')
    },
    reloadDocument: async (captured, discardEdits = false) => {
      const id = captured.id
      const eligible = (latest: Document | undefined) => sameDiskOwner(captured, latest) &&
        latest.revision === captured.revision && latest.content === captured.content && (!latest.isDirty || discardEdits) &&
        !saving.has(id) && !closing && !get().windowBusy
      if (!captured.path || reloading.has(id) || !eligible(find(id))) {
        set({ error: 'The document changed while preparing to reload. Review it and try again.' })
        return false
      }
      reloading.add(id)
      try {
        let content: string
        try { content = await invoke<string>('read_document_disk', { path: captured.path }) }
        catch (error) {
          const issue = isDiskIssue(error) ? error : 'unreadable'
          setDiskIssue(captured, issue, true)
          set({ error: `Reload stopped. ${diskIssueMessage(issue)}` })
          return false
        }
        if (!eligible(find(id))) {
          set({ error: 'The document changed while reloading. Review it and try again.' })
          return false
        }
        // Commit the reviewed revision in memory before replacing its persisted
        // recovery copy. A failed, stale, or interrupted read keeps the draft.
        replace(id, doc => ({ ...doc, content, savedContent: content, isDirty: false,
          diskIssue: undefined, diskRevision: (doc.diskRevision ?? 0) + 1, revision: (doc.revision ?? 0) + 1,
          reloadCount: (doc.reloadCount ?? 0) + 1, viewState: undefined, sourceViewportAnchor: undefined,
          lastModified: new Date(),
        }))
        set({ error: null })
        try { await flushWorkspace() }
        catch (error) { set({ error: `Reloaded the file, but recovery storage could not be updated: ${String(error)}` }) }
        return true
      } finally { reloading.delete(id) }
    },
    saveDocumentCopy: async (captured, path) => {
      if (get().windowBusy) return false
      fileOperations++
      let canonical = path
      let reserved = false
      try {
        canonical = await invoke<string>('canonical_document_path', { path, preserveLeaf: true }) || path
        if (get().documents.some(doc => doc.path === canonical) || destinations.has(canonical)) {
          throw new Error('Choose a new path for the copy. That path already belongs to an open document.')
        }
        destinations.set(canonical, captured.id)
        reserved = true
        await invoke('save_document_copy', { path: canonical, content: captured.content })
        set({ error: null })
        return true
      } catch (error) {
        set({ error: errorMessage(error, 'Failed to save a copy') })
        return false
      } finally {
        if (reserved) destinations.delete(canonical)
        fileOperations--
      }
    },
    saveAll: async () => {
      if (get().windowBusy) return false
      fileOperations++
      try {
      const docs = get().documents.filter(d => d.isDirty)
      for (const doc of docs) if (!await saveWithDialog(doc)) return false
      return !get().documents.some(d => d.isDirty)
      } finally { fileOperations-- }
    },
    closeDocument: id => closeDocuments([id]),
    closeOtherDocuments: keepId => {
      const documents = get().documents
      if (!documents.some(doc => doc.id === keepId)) return Promise.resolve(false)
      return closeDocuments(documents.filter(doc => doc.id !== keepId).map(doc => doc.id))
    },
    exportDocument: async (path, format, snapshot = get().currentDocument) => {
      if (!snapshot || get().windowBusy) return
      fileOperations++
      try {
        if (format !== 'html') throw new Error(`Unsupported export format: ${format}`)
        const highlighting = get().config.syntaxHighlighting
        const html = await createHtmlExport(snapshot.content, `${snapshot.id}:${snapshot.revision ?? 0}:export:${crypto.randomUUID()}`, highlighting)
        await invoke('export_document', { html, id: snapshot.id, content: snapshot.content, path, format })
      } catch (error) { set({ error: errorMessage(error, 'Failed to export document') }) }
      finally { fileOperations-- }
    },
  }
})

export type UnsavedDecision = 'save' | 'discard' | 'cancel'
function decideUnsaved(doc: Document): Promise<UnsavedDecision> {
  return new Promise(resolve => useAppStore.setState({ pendingClose: { id: doc.id, title: doc.title,
    resolve: decision => { useAppStore.setState({ pendingClose: null }); resolve(decision) },
  } }))
}

export async function withDocumentDialog<T>(operation: () => Promise<T>): Promise<T> {
  pendingDocumentDialogs++
  try { return await operation() }
  finally { pendingDocumentDialogs-- }
}

const markdownFilter = { name: 'Markdown', extensions: ['md', 'markdown'] }

export function openDocumentWithDialog() {
  if (useAppStore.getState().windowBusy) return Promise.resolve()
  return withDocumentDialog(async () => {
    const folder = useAppStore.getState().config.defaultDocumentFolder
    const path = await open({
      multiple: false,
      filters: [{ ...markdownFilter, extensions: [...markdownFilter.extensions, 'txt'] }],
      ...(folder ? await dialogFolderOptions(folder) : {}),
    })
    if (typeof path === 'string' && path) await useAppStore.getState().openDocument(path)
  })
}

export function saveWithDialog(doc: Document, as = false): Promise<boolean> {
  if (useAppStore.getState().windowBusy && !windowReviewingSaves) return Promise.resolve(false)
  if (!as && doc.path) return useAppStore.getState().saveToPath(doc, doc.path)
  return withDocumentDialog(async () => {
    const folder = useAppStore.getState().config.defaultDocumentFolder
    const path = await save({ filters: [markdownFilter], ...(folder ? await dialogFolderOptions(folder) : {}) })
    return !!path && await useAppStore.getState().saveDocumentAs(path, doc.id, doc)
  })
}

export async function saveCopyWithDialog(doc: Document): Promise<boolean> {
  if (useAppStore.getState().windowBusy) return false
  try {
    return await withDocumentDialog(async () => {
      const folder = useAppStore.getState().config.defaultDocumentFolder
      const path = await save({ title: 'Save a Copy', filters: [markdownFilter], ...(folder ? await dialogFolderOptions(folder) : {}) })
      return !!path && await useAppStore.getState().saveDocumentCopy(doc, path)
    })
  } catch (error) {
    useAppStore.getState().setError(errorMessage(error, 'Could not choose a destination for the copy'))
    return false
  }
}

// Serialize background reads and cycle through both active and inactive owners.
export function watchOpenDocuments() {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  let nextId: string | undefined
  const check = async () => {
    const documents = useAppStore.getState().documents.filter(doc => doc.path)
    const index = Math.max(0, documents.findIndex(doc => doc.id === nextId))
    const doc = documents[index]
    if (doc) {
      nextId = documents[(index + 1) % documents.length].id
      await useAppStore.getState().refreshDocumentDisk(doc.id, () => stopped)
    }
    if (!stopped) timer = setTimeout(check, 500)
  }
  timer = setTimeout(check, 500)
  return () => { stopped = true; clearTimeout(timer) }
}

function hasPendingDocumentOperation(state: AppState) {
  return state.windowBusy || closing || fileOperations > 0 || loadingDocuments > 0 || pendingDocumentDialogs > 0 || saving.size > 0 || reloading.size > 0 ||
    state.isLoading || state.pendingClose !== null || state.pendingDiskReload !== null
}

// The acceptance bridge can exercise this guard without installing or exiting.
// A caller coordinating a real restart must also prevent edits after it returns.
export async function checkpointWorkspaceForRestart() {
  if (!isTauri()) throw new Error('Restart recovery requires native storage.')
  if (checkpointing) throw new Error('A restart checkpoint is already in progress.')
  if (hasPendingDocumentOperation(useAppStore.getState())) {
    throw new Error('Finish the pending document operation before preparing to restart.')
  }
  checkpointing = true
  try {
    activeViewCapture?.capture()
    const snapshot = snapshotWorkspace()
    let changed = false
    const stopWatching = useAppStore.subscribe((state, prior) => {
      if (!sameWorkspaceRecoveryState(state, prior) || state.config !== prior.config ||
          state.updateChoices !== prior.updateChoices || hasPendingDocumentOperation(state)) changed = true
    })
    try {
      const preferences = persistPreferencesForCheckpoint()
      const ensureUnchanged = () => {
        if (!changed && preferences.isLatest() && !hasPendingDocumentOperation(useAppStore.getState())) return
        throw new Error('The workspace or preferences changed during the restart checkpoint. Try again.')
      }
      await preferences.persisted
      ensureUnchanged()
      await flushWorkspace(snapshot)
      // Catch view changes queued for the next animation frame.
      activeViewCapture?.capture()
      ensureUnchanged()
    } finally { stopWatching() }
  } finally { checkpointing = false }
}

// Close and app Quit collect choices before changing any recovery copy.
export async function planWindowClose() {
  windowReviewingSaves = true
  try {
    const reviewed: Document[] = []
    for (const doc of useAppStore.getState().documents) {
      if (!doc.isDirty) continue
      const decision = await decideUnsaved(doc)
      if (decision === 'cancel') return null
      if (decision === 'save' && (!await saveWithDialog(doc) || useAppStore.getState().documents.find(d => d.id === doc.id)?.isDirty)) return null
      if (decision === 'discard') reviewed.push(doc)
    }
    const state = useAppStore.getState()
    if (state.documents.some(doc => doc.isDirty && !reviewed.some(d => d.id === doc.id && d.content === doc.content))) return null
    const documents = state.documents.flatMap(doc => reviewed.some(d => d.id === doc.id)
      ? (doc.path ? [{ ...doc, content: doc.savedContent ?? '', isDirty: false }] : [])
      : [doc])
    const activeId = documents.some(doc => doc.id === state.currentDocument?.id) ? state.currentDocument?.id : documents[0]?.id
    await flushPreferences()
    return snapshotWorkspace(documents, state.fileViews, activeId ?? null)
  } finally {
    windowReviewingSaves = false
  }
}

export async function confirmDiscardChanges(): Promise<boolean> {
  const resume = suspendWindowWorkspace()
  if (!resume) return false
  try {
    const plan = await planWindowClose()
    if (!plan) return false
    await flushWorkspace(plan)
    return true
  } catch (error) {
    useAppStore.getState().setError(`Cannot finish recovery storage before quitting: ${String(error)}`)
    return false
  } finally { resume() }
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
