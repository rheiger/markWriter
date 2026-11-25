import { invoke, isTauri } from '@tauri-apps/api/core'
import { useAppStore, type AppState, type Document } from '../store/useAppStore'
import { parsePreferences, parseUpdateChoices, type AppConfig, type UpdateChoice } from './preferences'

let preferencesBlocked = false
let workspaceBlocked = false
async function retainRejected(kind: 'preferences' | 'workspace') {
  await invoke('retain_rejected_storage', { kind })
}
let preferenceWrites: Promise<void> = Promise.resolve()
let lastStoredConfig: AppConfig | undefined
function enqueuePreferenceWrite(write: () => Promise<void>) {
  const pending = preferenceWrites.catch(() => {}).then(write)
  preferenceWrites = pending
  return pending
}
async function allowPreferenceWrite() {
  if (!preferencesBlocked) return
  await retainRejected('preferences')
  preferencesBlocked = false
}
async function writePreferences(config: AppConfig, updateChoices = useAppStore.getState().updateChoices) {
  const value = { version: 1, config, ...(Object.keys(updateChoices).length ? { updateChoices } : {}) }
  await invoke('save_preferences', { value })
  lastStoredConfig = config
}
export async function applyPreferences(value: AppConfig) {
  const config = parsePreferences({ version: 1, config: value })
  if (!isTauri()) {
    useAppStore.getState().updateConfig(config)
    return
  }
  const prior = useAppStore.getState().config
  await enqueuePreferenceWrite(async () => {
    await allowPreferenceWrite()
    await writePreferences(config)
    const current = useAppStore.getState().config
    // Preserve fields changed by a later immediate control while Apply was pending.
    const changes = Object.entries(current).filter(([key, value]) => value !== prior[key as keyof AppConfig])
    useAppStore.setState({ config: changes.length ? { ...config, ...Object.fromEntries(changes) } : config })
  })
}
export function saveUpdateChoice(version: string, choice: UpdateChoice) {
  const pending = enqueuePreferenceWrite(async () => {
    const { config, updateChoices } = useAppStore.getState()
    const next = { ...updateChoices, [version]: choice }
    await allowPreferenceWrite()
    await writePreferences(config, next)
    useAppStore.setState({ updateChoices: next })
  })
  // The dialog reports this save failure. It must not block workspace recovery on quit.
  preferenceWrites = pending.catch(() => {})
  return pending
}
export async function loadPreferences() {
  if (!isTauri()) return
  lastStoredConfig = undefined
  try {
    const value = await invoke('load_preferences')
    if (value) useAppStore.setState({ config: parsePreferences(value), updateChoices: parseUpdateChoices(value) })
    else useAppStore.setState({ updateChoices: {} })
  } catch (error) {
    try { await retainRejected('preferences') } catch { preferencesBlocked = true }
    useAppStore.setState({ updateChoices: {} })
    useAppStore.getState().setError(`Preferences could not be loaded. Defaults remain usable; rejected storage is retained. ${String(error)}`)
  }
}

// Toolbar/theme/zoom changes share the same native storage queue as Settings Apply.
export function watchPreferences() {
  return useAppStore.subscribe((state, prior) => {
    if (state.config === prior.config || !isTauri() || preferencesBlocked) return
    void enqueuePreferenceWrite(async () => {
      const { config, setError } = useAppStore.getState()
      if (config === lastStoredConfig) return
      await writePreferences(config).catch(error => setError(`Preferences could not be saved: ${String(error)}`))
    })
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
  const write = workspaceWrites.catch(() => {}).then(async () => {
    if (workspaceBlocked) {
      await retainRejected('workspace')
      workspaceBlocked = false
    }
    await invoke('save_workspace', { value })
  })
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

export function sameWorkspaceRecoveryState(state: AppState, prior: AppState) {
  return state.currentDocument?.id === prior.currentDocument?.id && state.fileViews === prior.fileViews &&
    (state.documents === prior.documents || (state.documents.length === prior.documents.length &&
      state.documents.every((doc, index) => sameRecoveryDocument(doc, prior.documents[index]))))
}

export function watchWorkspace() {
  return useAppStore.subscribe((state, prior) => {
    if (sameWorkspaceRecoveryState(state, prior)) return
    clearTimeout(timer)
    timer = setTimeout(() => { void flushWorkspace().catch(error => useAppStore.getState().setError(`Recovery could not be saved: ${String(error)}`)) }, 400)
  })
}

export async function flushPreferences() { await preferenceWrites }

// Unlike the background preference watcher, a restart checkpoint requires
// acknowledged storage even after an earlier write was rejected.
export function persistPreferencesForCheckpoint() {
  const pending = enqueuePreferenceWrite(async () => {
    await allowPreferenceWrite()
    await writePreferences(useAppStore.getState().config)
  })
  const settled = pending.catch(() => {})
  preferenceWrites = settled
  return { persisted: pending, isLatest: () => preferenceWrites === settled }
}
