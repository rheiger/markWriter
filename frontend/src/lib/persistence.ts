import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAppStore, type AppState, type Document } from '../store/useAppStore'
import { defaultConfig, parsePreferences, parseUpdateChoices, type AppConfig, type UpdateChoice, type UpdateChoices } from './preferences'

let preferencesBlocked = false
let workspaceBlocked = false
async function retainRejected(kind: 'preferences' | 'workspace') {
  await invoke('retain_rejected_storage', { kind })
}
let preferenceWrites: Promise<void> = Promise.resolve()
let storedConfig: AppConfig = defaultConfig
let storedChoices: UpdateChoices = {}
let generation = -1
let publishingPreferences = false
let repairGeneration: number | undefined
const optimisticEdits = new Set<Partial<AppConfig>>()

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

function changedFields(config: AppConfig, base: AppConfig): Partial<AppConfig> {
  return Object.fromEntries(Object.entries(config).filter(([key, value]) => value !== base[key as keyof AppConfig]))
}
function preferenceRecord(config: AppConfig, updateChoices: UpdateChoices) {
  return { version: 1, config, ...(Object.keys(updateChoices).length ? { updateChoices } : {}) }
}
function acceptPreferences(value: unknown) {
  if (!value || typeof value !== 'object') return
  const received = (value as { generation?: number }).generation
  if ((received ?? -1) <= generation && generation >= 0) return
  const config = parsePreferences(value)
  const choices = parseUpdateChoices(value)
  if (received !== undefined) generation = received
  storedConfig = config
  storedChoices = choices
  repairGeneration = undefined
  publishPreferences()
}
function publishPreferences() {
  const local = useAppStore.getState()
  const next = { ...storedConfig, ...Object.assign({}, ...optimisticEdits) }
  const configChanged = Object.keys(changedFields(next, local.config)).length > 0
  const choicesChanged = JSON.stringify(storedChoices) !== JSON.stringify(local.updateChoices)
  if (!configChanged && !choicesChanged) return
  publishingPreferences = true
  try {
    useAppStore.setState({
      ...(configChanged ? { config: next } : {}),
      ...(choicesChanged ? { updateChoices: storedChoices } : {}),
    })
  } finally {
    publishingPreferences = false
  }
}

async function writePreferences(
  config: AppConfig,
  baseConfig: AppConfig,
  updateChoices: UpdateChoices,
  baseChoices: UpdateChoices,
  optimisticEdit?: Partial<AppConfig>,
) {
  const value = preferenceRecord(config, updateChoices)
  const base = preferenceRecord(baseConfig, baseChoices)
  const committed = await invoke('save_preferences', { value, base, repairGeneration })
  if (optimisticEdit) optimisticEdits.delete(optimisticEdit)
  // Native acknowledges the full merged record. Local test doubles may omit the reply.
  acceptPreferences(committed && typeof committed === 'object' ? committed : value)
  if (optimisticEdit) publishPreferences()
}
export async function applyPreferences(value: AppConfig, base = useAppStore.getState().config) {
  const config = parsePreferences({ version: 1, config: value })
  const patch = changedFields(config, base)
  if (!isTauri()) {
    useAppStore.getState().updateConfig(patch)
    return
  }
  await enqueuePreferenceWrite(async () => {
    await allowPreferenceWrite()
    const current = useAppStore.getState()
    await writePreferences({ ...current.config, ...patch }, current.config, current.updateChoices, current.updateChoices)
  })
}
export function saveUpdateChoice(version: string, choice: UpdateChoice) {
  const pending = enqueuePreferenceWrite(async () => {
    const { config, updateChoices } = useAppStore.getState()
    await allowPreferenceWrite()
    await writePreferences(config, config, { ...updateChoices, [version]: choice }, updateChoices)
  })
  // The dialog reports this save failure. It must not block workspace recovery on quit.
  preferenceWrites = pending.catch(() => {})
  return pending
}
export async function loadPreferences() {
  if (!isTauri()) return
  let value: unknown
  try {
    value = await invoke('load_preferences')
    if (value) acceptPreferences(value)
    else if (generation < 0) useAppStore.setState({ updateChoices: {} })
  } catch (error) {
    try { await retainRejected('preferences') } catch { preferencesBlocked = true }
    repairGeneration = (value as { generation?: number } | null)?.generation ?? Math.max(0, generation)
    useAppStore.setState({ updateChoices: {} })
    useAppStore.getState().setError(`Preferences could not be loaded. Defaults remain usable; rejected storage is retained. ${String(error)}`)
  }
}

// Toolbar/theme/zoom changes and Settings Apply share a local queue. The
// native queue merges field-level changes across all editor windows.
export function watchPreferences(syncWindows = false) {
  const stop = useAppStore.subscribe((state, prior) => {
    if (state.config === prior.config || publishingPreferences || !isTauri() || preferencesBlocked) return
    const patch = changedFields(state.config, prior.config)
    if (!Object.keys(patch).length) return
    optimisticEdits.add(patch)
    void enqueuePreferenceWrite(async () => {
      try {
        const { config, updateChoices } = useAppStore.getState()
        // The base excludes this edit even if the optimistic UI has already applied it.
        const base = { ...config, ...Object.fromEntries(Object.keys(patch).map(key => [key, prior.config[key as keyof AppConfig]])) }
        await writePreferences({ ...base, ...patch }, base, updateChoices, updateChoices, patch)
      } catch (error) {
        optimisticEdits.delete(patch)
        publishPreferences()
        useAppStore.getState().setError(`Preferences could not be saved: ${String(error)}`)
      }
    })
  })
  let disposed = false
  let unlisten: (() => void) | undefined
  if (syncWindows && isTauri()) {
    void listen('preferences-committed', event => { if (!disposed) acceptPreferences(event.payload) }).then(unsubscribe => {
      if (disposed) { unsubscribe(); return }
      unlisten = unsubscribe
      // Cover the interval between initial load and event registration.
      if (repairGeneration === undefined) void loadPreferences()
    }).catch(error => useAppStore.getState().setError(`Could not synchronize preferences: ${String(error)}`))
  }
  return () => { disposed = true; stop(); unlisten?.() }
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
    const { config, updateChoices } = useAppStore.getState()
    await writePreferences(config, storedConfig, updateChoices, storedChoices)
  })
  const settled = pending.catch(() => {})
  preferenceWrites = settled
  return { persisted: pending, isLatest: () => preferenceWrites === settled }
}
