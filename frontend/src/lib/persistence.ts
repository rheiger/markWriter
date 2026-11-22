import { invoke, isTauri } from '@tauri-apps/api/core'
import { useAppStore, type Document } from '../store/useAppStore'
import { parsePreferences, type AppConfig } from './preferences'

let preferencesBlocked = false
let workspaceBlocked = false
async function retainRejected(kind: 'preferences' | 'workspace') {
  await invoke('retain_rejected_storage', { kind })
}
let preferenceWrites: Promise<unknown> = Promise.resolve()
export async function applyPreferences(value: AppConfig) {
  const config = parsePreferences({ version: 1, config: value })
  if (isTauri()) {
    if (preferencesBlocked) { await retainRejected('preferences'); preferencesBlocked = false }
    const write = preferenceWrites.catch(() => {}).then(() => invoke('save_preferences', { value: { version: 1, config } }))
    preferenceWrites = write
    await write
  }
  useAppStore.getState().updateConfig(config)
}
export async function loadPreferences() {
  if (!isTauri()) return
  try {
    const value = await invoke('load_preferences')
    if (value) useAppStore.setState({ config: parsePreferences(value) })
  } catch (error) {
    try { await retainRejected('preferences') } catch { preferencesBlocked = true }
    useAppStore.getState().setError(`Preferences could not be loaded. Defaults remain usable; rejected storage is retained. ${String(error)}`)
  }
}

// Toolbar/theme/zoom changes share the same native storage queue as Settings Apply.
export function watchPreferences() {
  return useAppStore.subscribe((state, prior) => {
    if (state.config === prior.config || !isTauri() || preferencesBlocked) return
    const config = state.config
    preferenceWrites = preferenceWrites.catch(() => {}).then(() => invoke('save_preferences', { value: { version: 1, config } }))
      .catch(error => useAppStore.getState().setError(`Preferences could not be saved: ${String(error)}`))
  })
}

let workspaceWrites: Promise<unknown> = Promise.resolve()
let timer: ReturnType<typeof setTimeout> | undefined
function recoveryDocument({ diskIssue: _diskIssue, diskRevision: _diskRevision, reloadCount: _reloadCount, ...doc }: Document) {
  return doc
}

export function snapshotWorkspace(documents = useAppStore.getState().documents, fileViews = useAppStore.getState().fileViews) {
  const recoveryDocuments = documents.map(recoveryDocument)
  return { version: 1, activeId: useAppStore.getState().currentDocument?.id ?? null, documents: recoveryDocuments, fileViews }
}
export async function flushWorkspace(value = snapshotWorkspace()) {
  clearTimeout(timer)
  if (!isTauri()) return
  if (workspaceBlocked) {
    await retainRejected('workspace')
    workspaceBlocked = false
  }
  const write = workspaceWrites.catch(() => {}).then(() => invoke('save_workspace', { value }))
  workspaceWrites = write
  await write
}
export async function loadWorkspace() {
  if (!isTauri()) return
  try {
    const value = await invoke('load_workspace')
    if (!value) return
    const { restoreSnapshot } = await import('./session')
    const restored = await restoreSnapshot(value, useAppStore.getState().config.restoreSession,
      path => invoke('open_document', { path }))
    useAppStore.setState({ documents: restored.documents, fileViews: restored.fileViews, currentDocument: restored.documents.find(d => d.id === restored.activeId) ?? null })
    if (restored.warnings.length) useAppStore.getState().setError(restored.warnings.join('\n'))
  } catch (error) {
    try { await retainRejected('workspace') } catch { workspaceBlocked = true }
    useAppStore.getState().setError(`Workspace could not be restored; rejected storage is retained. ${String(error)}`)
  }
}
function sameRecoveryDocument(doc: Document, previous: Document): boolean {
  if (doc === previous) return true
  const currentFields = Object.entries(recoveryDocument(doc))
  const prior = recoveryDocument(previous)
  return currentFields.length === Object.keys(prior).length &&
    currentFields.every(([key, value]) => prior[key as keyof typeof prior] === value)
}

export function watchWorkspace() {
  return useAppStore.subscribe((state, prior) => {
    if (state.currentDocument?.id === prior.currentDocument?.id && state.fileViews === prior.fileViews &&
        (state.documents === prior.documents || (state.documents.length === prior.documents.length &&
          state.documents.every((doc, index) => sameRecoveryDocument(doc, prior.documents[index]))))) return
    clearTimeout(timer)
    timer = setTimeout(() => { void flushWorkspace().catch(error => useAppStore.getState().setError(`Recovery could not be saved: ${String(error)}`)) }, 400)
  })
}

export async function flushPreferences() { await preferenceWrites }
