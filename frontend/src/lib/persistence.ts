import { invoke, isTauri } from '@tauri-apps/api/core'
import { useAppStore } from '../store/useAppStore'
import { parsePreferences, type AppConfig } from './preferences'

let preferenceWrites: Promise<unknown> = Promise.resolve()
export async function applyPreferences(value: AppConfig) {
  const config = parsePreferences({ version: 1, config: value })
  if (isTauri()) {
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
  } catch (error) { useAppStore.getState().setError(`Preferences could not be loaded. Defaults remain usable. ${String(error)}`) }
}

// Toolbar/theme/zoom changes share the same native storage queue as Settings Apply.
export function watchPreferences() {
  return useAppStore.subscribe((state, prior) => {
    if (state.config === prior.config || !isTauri()) return
    const config = state.config
    preferenceWrites = preferenceWrites.catch(() => {}).then(() => invoke('save_preferences', { value: { version: 1, config } }))
      .catch(error => useAppStore.getState().setError(`Preferences could not be saved: ${String(error)}`))
  })
}

let workspaceWrites: Promise<unknown> = Promise.resolve()
let timer: ReturnType<typeof setTimeout> | undefined
export function snapshotWorkspace(documents = useAppStore.getState().documents) {
  return { version: 1, activeId: useAppStore.getState().currentDocument?.id ?? null, documents }
}
export async function flushWorkspace(value = snapshotWorkspace()) {
  clearTimeout(timer)
  if (!isTauri()) return
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
    useAppStore.setState({ documents: restored.documents, currentDocument: restored.documents.find(d => d.id === restored.activeId) ?? null })
    if (restored.warnings.length) useAppStore.getState().setError(restored.warnings.join('\n'))
  } catch (error) { useAppStore.getState().setError(`Workspace could not be restored; original storage is retained. ${String(error)}`) }
}
export function watchWorkspace() {
  return useAppStore.subscribe((state, prior) => {
    if (state.documents === prior.documents && state.currentDocument === prior.currentDocument) return
    clearTimeout(timer)
    timer = setTimeout(() => { void flushWorkspace().catch(error => useAppStore.getState().setError(`Recovery could not be saved: ${String(error)}`)) }, 400)
  })
}
