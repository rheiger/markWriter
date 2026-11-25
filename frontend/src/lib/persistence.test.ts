import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { beforeEach, expect, it, vi } from 'vitest'
import { checkpointWorkspaceForRestart, openDocumentWithDialog, registerActiveViewCapture, saveWithDialog, useAppStore, type Document } from '../store/useAppStore'
import { applyPreferences, flushPreferences, flushWorkspace, loadPreferences, saveUpdateChoice, watchPreferences } from './persistence'
import { defaultConfig } from './preferences'
import { encodeSettingsProfile, parseSettingsProfile } from './settingsProfile'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))

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
    await applyPreferences({ ...useAppStore.getState().config, ...imported })
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

it('checkpoints dirty named and untitled documents and the current view without saving original files', async () => {
  const named = { ...draft, id: 'named', path: '/test/synthetic.md', savedContent: 'saved bytes\n' }
  const state = useAppStore.getState()
  state.setCurrentDocument(named)
  const unregister = registerActiveViewCapture(named.id, () => {
    state.rememberView(named.id, { sourceAnchor: 4, sourceHead: 9 })
  })
  const stopWatching = watchPreferences()
  try {
    const choice = saveUpdateChoice('2.14.1', { kind: 'skip' })
    await choice
    state.updateConfig({ theme: 'dark' })
    await checkpointWorkspaceForRestart()
    expect(preferencesOnDisk).toMatchObject({ config: { theme: 'dark' }, updateChoices: skipped })
    expect(invoke).toHaveBeenCalledWith('save_workspace', {
      epoch: 0,
      value: expect.objectContaining({ activeId: named.id, documents: [draft,
        { ...named, viewState: { sourceAnchor: 4, sourceHead: 9 }, sourceViewportAnchor: undefined }] }),
    })
    expect(vi.mocked(invoke).mock.calls.every(([command]) => ['save_preferences', 'save_workspace'].includes(command))).toBe(true)
    expect(useAppStore.getState().documents.every(doc => doc.isDirty)).toBe(true)
  } finally {
    stopWatching()
    unregister()
  }
})

it.each(['save_preferences', 'save_workspace'])('blocks a checkpoint when %s fails and allows a retry', async command => {
  const storage = vi.mocked(invoke).getMockImplementation()!
  let failing = true
  vi.mocked(invoke).mockImplementation(async (called, args) => {
    if (called === command && failing) throw new Error('storage unavailable')
    return storage(called, args)
  })

  await expect(checkpointWorkspaceForRestart()).rejects.toThrow('storage unavailable')
  await expect(flushPreferences()).resolves.toBeUndefined()
  expect(useAppStore.getState().currentDocument).toEqual(draft)
  failing = false
  await expect(checkpointWorkspaceForRestart()).resolves.toBeUndefined()
})

it('blocks another checkpoint and detects a newer edit while awaiting workspace storage', async () => {
  const started = Promise.withResolvers<void>()
  const stored = Promise.withResolvers<void>()
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'save_workspace') { started.resolve(); await stored.promise }
  })

  const result = checkpointWorkspaceForRestart()
  const rejected = expect(result).rejects.toThrow(/changed/)
  await started.promise
  await expect(checkpointWorkspaceForRestart()).rejects.toThrow(/already/)
  useAppStore.getState().updateDocumentContent('Newer draft bytes')
  stored.resolve()
  await rejected
  expect(useAppStore.getState().currentDocument?.content).toBe('Newer draft bytes')
  await expect(checkpointWorkspaceForRestart()).resolves.toBeUndefined()
})

it('blocks checkpointing while a native document open is unresolved', async () => {
  const opened = Promise.withResolvers<Document>()
  vi.mocked(invoke).mockImplementationOnce(() => opened.promise)
  const loading = useAppStore.getState().openDocument('/test/another.md')
  try {
    await expect(checkpointWorkspaceForRestart()).rejects.toThrow(/document operation/i)
  } finally {
    opened.resolve({ ...draft, id: 'opened', path: '/test/another.md' })
    await loading
  }
  await expect(checkpointWorkspaceForRestart()).resolves.toBeUndefined()
})

it('rejects a settings write queued during checkpointing before that write publishes its result', async () => {
  const workspaceStarted = Promise.withResolvers<void>()
  const workspaceStored = Promise.withResolvers<void>()
  const settingsStarted = Promise.withResolvers<void>()
  const settingsStored = Promise.withResolvers<void>()
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'save_workspace') {
      workspaceStarted.resolve()
      await workspaceStored.promise
    }
    if (command === 'save_preferences' && args?.value.config.theme === 'dark') {
      settingsStarted.resolve()
      await settingsStored.promise
    }
  })

  const checkpoint = checkpointWorkspaceForRestart()
  const rejected = expect(checkpoint).rejects.toThrow(/changed/)
  await workspaceStarted.promise
  const settings = applyPreferences({ ...defaultConfig, theme: 'dark' })
  await settingsStarted.promise
  workspaceStored.resolve()
  try {
    await rejected
    expect(useAppStore.getState().config.theme).toBe(defaultConfig.theme)
  } finally {
    settingsStored.resolve()
    await settings
  }
  expect(useAppStore.getState().config.theme).toBe('dark')
})

it('blocks checkpointing while the UI Open or Save As picker is unresolved', async () => {
  const chooseOpen = Promise.withResolvers<null>()
  const chooseSave = Promise.withResolvers<null>()
  vi.mocked(open).mockImplementationOnce(() => chooseOpen.promise)
  vi.mocked(save).mockImplementationOnce(() => chooseSave.promise)
  try {
    const opening = openDocumentWithDialog()
    await expect(checkpointWorkspaceForRestart()).rejects.toThrow(/document operation/i)
    chooseOpen.resolve(null)
    await opening

    const saving = saveWithDialog(draft, true)
    await expect(checkpointWorkspaceForRestart()).rejects.toThrow(/document operation/i)
    chooseSave.resolve(null)
    expect(await saving).toBe(false)
    await expect(checkpointWorkspaceForRestart()).resolves.toBeUndefined()
  } finally {
    chooseOpen.resolve(null)
    chooseSave.resolve(null)
  }
})
