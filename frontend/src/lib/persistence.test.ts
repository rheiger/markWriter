import { invoke } from '@tauri-apps/api/core'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAppStore, type Document } from '../store/useAppStore'
import { applyPreferences, flushPreferences, flushWorkspace, loadPreferences, saveUpdateChoice, watchPreferences } from './persistence'
import { defaultConfig } from './preferences'
import { encodeSettingsProfile, parseSettingsProfile } from './settingsProfile'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }))

const draft: Document = { id: 'synthetic', title: 'draft', content: 'draft bytes\n', revision: 3, lastModified: new Date(0), isDirty: true }
const skipped = { '2.14.1': { kind: 'skip' } }
let preferencesOnDisk: unknown

beforeEach(() => {
  preferencesOnDisk = { version: 1, config: {} }
  vi.mocked(invoke).mockReset().mockImplementation(async (command, args) => {
    if (command === 'load_preferences') return preferencesOnDisk
    if (command === 'save_preferences') preferencesOnDisk = args?.value
    return null
  })
  useAppStore.setState({ config: defaultConfig, updateChoices: {}, documents: [draft], currentDocument: draft })
})

it('keeps local update choices through settings import, toolbar writes, recovery and restart', async () => {
  const stopWatching = watchPreferences()
  try {
    const choiceWrite = saveUpdateChoice('2.14.1', { kind: 'skip' })
    useAppStore.getState().updateConfig({ fontSize: 19 })
    await choiceWrite
    const imported = parseSettingsProfile({ format: 'markwriter-settings', version: 1, config: { theme: 'dark' } })
    await applyPreferences(imported)
    await flushPreferences()
    expect(preferencesOnDisk).toMatchObject({ config: { theme: 'dark' }, updateChoices: skipped })
    expect(encodeSettingsProfile(useAppStore.getState().config)).not.toHaveProperty('updateChoices')

    await flushWorkspace()
    const recoveryWrite = vi.mocked(invoke).mock.calls.find(([command]) => command === 'save_workspace')
    expect(recoveryWrite?.[1]?.value).toMatchObject({ activeId: draft.id, documents: [draft] })
    expect(recoveryWrite?.[1]?.value).not.toHaveProperty('updateChoices')
    expect(useAppStore.getState().currentDocument).toBe(draft)
  } finally {
    stopWatching()
  }

  useAppStore.setState({ updateChoices: {}, config: defaultConfig })
  await loadPreferences()
  expect(useAppStore.getState()).toMatchObject({ config: { theme: 'dark' }, updateChoices: skipped })
})

it('does not apply a failed choice in memory or block workspace recovery before retry', async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error('preferences unavailable'))
  await expect(saveUpdateChoice('2.14.1', { kind: 'skip' })).rejects.toThrow('preferences unavailable')
  expect(useAppStore.getState().updateChoices).toEqual({})
  expect(preferencesOnDisk).not.toHaveProperty('updateChoices')
  await flushPreferences()
  await flushWorkspace()
  expect(invoke).toHaveBeenCalledWith('save_workspace', expect.anything())

  await saveUpdateChoice('2.14.1', { kind: 'skip' })
  expect(preferencesOnDisk).toMatchObject({ updateChoices: skipped })
})

it('preserves a toolbar edit and an update choice queued during a settings write', async () => {
  let finishSettingsWrite!: () => void
  vi.mocked(invoke).mockImplementationOnce((_command, args) => new Promise(resolve => {
    finishSettingsWrite = () => {
      preferencesOnDisk = args?.value
      resolve(null)
    }
  }))
  const stopWatching = watchPreferences()
  try {
    const apply = applyPreferences({ ...defaultConfig, theme: 'dark' })
    await vi.waitFor(() => expect(finishSettingsWrite).toBeTypeOf('function'))
    useAppStore.getState().updateConfig({ fontSize: 19 })
    const choose = saveUpdateChoice('2.14.1', { kind: 'skip' })
    finishSettingsWrite()
    await Promise.all([apply, choose])
    await flushPreferences()
    expect(preferencesOnDisk).toMatchObject({ config: { theme: 'dark', fontSize: 19 }, updateChoices: skipped })
    expect(useAppStore.getState()).toMatchObject({ config: { theme: 'dark', fontSize: 19 }, updateChoices: skipped })
  } finally {
    stopWatching()
  }
})
