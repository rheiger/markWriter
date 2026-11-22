import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { flushWorkspace, watchWorkspace } from '../lib/persistence'
import { useAppStore, confirmDiscardChanges, registerActiveViewCapture, saveCopyWithDialog, watchOpenDocuments } from './useAppStore'
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }))
const desktop = vi.hoisted(() => ({ active: false }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => desktop.active }))
const call = vi.mocked(invoke)
const initial = { id: 'one', title: 'One', content: '# Before', savedContent: '# Before', path: '/one.md', isDirty: false, lastModified: new Date() }
const state = () => useAppStore.getState()
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  desktop.active = false
  call.mockReset()
  vi.mocked(save).mockReset()
  call.mockImplementation(async (command, args: any) => command === 'canonical_document_path' ? args.path : {})
  useAppStore.setState({ documents: [], fileViews: [], currentDocument: null, isLoading: false, error: null, pendingClose: null, pendingDiskReload: null })
  state().setCurrentDocument({ ...initial })
})
describe('document ownership and file races', () => {
  it('adds New/Open without discarding dirty documents and activates canonical duplicates', async () => {
    state().updateDocumentContent('Unsaved')
    call.mockResolvedValueOnce({ id: 'two', title: 'Two', content: 'B', path: '/two.md' })
    await state().openDocument('/two.md')
    call.mockResolvedValueOnce({ id: 'duplicate', path: '/one.md' })
    await state().openDocument('/alias.md')
    expect(state().documents).toHaveLength(2)
    expect(state().currentDocument?.content).toBe('Unsaved')
    expect(state().currentDocument?.isDirty).toBe(true)
  })
  it('restores navigation by canonical path after a tab is closed', async () => {
    state().rememberView('one', { renderedScroll: 740, renderedAnchor: 25, renderedHead: 25 })
    expect(await state().closeDocument('one')).toBe(true)
    call.mockResolvedValueOnce({ id: 'new-one', title: 'One', content: 'Fresh bytes', path: '/one.md' })
    await state().openDocument('/alias.md')
    expect(state().currentDocument).toMatchObject({ id: 'new-one', content: 'Fresh bytes', isDirty: false,
      viewState: { renderedScroll: 740, renderedAnchor: 25, renderedHead: 25 } })
    call.mockResolvedValueOnce({ id: 'first', title: 'First', content: 'New file', path: '/first.md' })
    await state().openDocument('/first.md')
    expect(state().currentDocument?.viewState).toBeUndefined()
  })
  it('captures an outgoing viewport before making another tab active', async () => {
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md' })
    state().activateDocument('one')
    const unregister = registerActiveViewCapture('one', () => {
      expect(state().currentDocument?.id).toBe('one')
      state().rememberView('one', { renderedScroll: 512 })
    })
    try {
      state().activateDocument('two')
      expect(await state().closeDocument('one')).toBe(true)
      expect(state().fileViews[0].viewState.renderedScroll).toBe(512)
    } finally { unregister() }
  })
  it('saves a captured owner while tab switching and newer edits remain dirty', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementation(async (command, args: any) => command === 'canonical_document_path' ? args.path : new Promise(resolve => { finish = resolve }))
    const saving = state().saveDocumentAs('/copy.md')
    await tick()
    state().updateDocumentContent('Newer')
    state().setCurrentDocument({ ...initial, id: 'two', content: 'Other', path: '/two.md' })
    finish({ path: '/copy.md' }); await saving
    expect(state().currentDocument?.id).toBe('two')
    expect(state().documents[0]).toMatchObject({ content: 'Newer', path: '/copy.md', isDirty: true })
  })
  it('captures text before an asynchronous Save As dialog', async () => {
    let choose!: (value: string) => void
    vi.mocked(save).mockImplementation(() => new Promise(resolve => { choose = resolve }))
    state().setCurrentDocument({ ...initial, path: undefined })
    const saving = state().saveDocument()
    state().updateDocumentContent('Newer')
    choose('/new.md'); await saving
    expect(call).toHaveBeenCalledWith('save_document_as', expect.objectContaining({ content: '# Before', id: 'one' }))
    expect(state().currentDocument?.isDirty).toBe(true)
  })
  it('Open waits for a reserved Save As destination and activates its single owner', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementation(async (command, args: any) => {
      if (command === 'canonical_document_path') return args.path
      if (command === 'save_document_as') return new Promise(resolve => { finish = resolve })
      if (command === 'open_document') return { id: 'racer', path: '/copy.md', content: 'Old disk' }
      return {}
    })
    const saving = state().saveDocumentAs('/copy.md'); await tick()
    const opening = state().openDocument('/copy.md'); await tick()
    expect(state().documents).toHaveLength(1)
    finish({ path: '/copy.md' }); await saving; await opening
    expect(state().documents).toHaveLength(1)
    expect(state().currentDocument).toMatchObject({ id: 'one', path: '/copy.md', content: '# Before' })
  })
  it('rejects Save As ownership collisions before native writes', async () => {
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md' })
    expect(await state().saveDocumentAs('/one.md')).toBe(false)
    expect(call).not.toHaveBeenCalledWith('save_document_as', expect.anything())
  })
  it('keeps failed saves and cancelled closes open', async () => {
    state().updateDocumentContent('Unsaved')
    call.mockRejectedValueOnce('Permission denied')
    expect(await state().saveDocument()).toBe(false)
    const close = state().closeDocument('one')
    state().pendingClose!.resolve('cancel')
    expect(await close).toBe(false)
    expect(state().currentDocument?.content).toBe('Unsaved')
  })
  it('retains dirty tabs when Close Save is cancelled or fails', async () => {
    state().setCurrentDocument({ ...initial, path: undefined, isDirty: true })
    vi.mocked(save).mockResolvedValueOnce(null)
    const cancelled = state().closeDocument('one'); state().pendingClose!.resolve('save')
    expect(await cancelled).toBe(false)
    expect(state().documents).toHaveLength(1)
    state().setCurrentDocument({ ...initial, isDirty: true })
    call.mockRejectedValueOnce('Write failed')
    const failed = state().closeDocument('one'); state().pendingClose!.resolve('save')
    expect(await failed).toBe(false)
    expect(state().currentDocument?.isDirty).toBe(true)
  })
  it('a queued Save to an older destination cannot undo a completed Save As ownership change', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementation(async (command, args: any) => command === 'canonical_document_path' ? args.path :
      command === 'save_document_as' ? new Promise(resolve => { finish = resolve }) : {})
    const as = state().saveDocumentAs('/new.md'); await tick()
    const saveOld = state().saveDocument()
    finish({ path: '/new.md', title: 'New' }); await as; await saveOld
    expect(state().currentDocument).toMatchObject({ path: '/new.md', title: 'New' })
  })
  it('Quit inspects every dirty tab and Cancel retains the entire workspace', async () => {
    state().updateDocumentContent('A*')
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md', isDirty: true })
    const quit = confirmDiscardChanges()
    expect(state().pendingClose?.id).toBe('one')
    state().pendingClose!.resolve('discard'); await tick()
    expect(state().pendingClose?.id).toBe('two')
    state().pendingClose!.resolve('cancel')
    expect(await quit).toBe(false)
    expect(state().documents).toHaveLength(2)
    expect(state().documents[0].isDirty).toBe(true)
  })
  it('Save All preserves newer edits and stops on failure', async () => {
    state().updateDocumentContent('A*')
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md', isDirty: true })
    expect(await state().saveAll()).toBe(true)
    expect(state().documents.every(d => !d.isDirty)).toBe(true)
  })
  it('discard closes only its reviewed owner and reordering keeps the active tab', async () => {
    state().updateDocumentContent('A*')
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md' })
    state().reorderDocument('two', 0)
    expect(state().currentDocument?.id).toBe('two')
    const close = state().closeDocument('one'); state().pendingClose!.resolve('discard')
    expect(await close).toBe(true)
    expect(state().documents.map(d => d.id)).toEqual(['two'])
  })
})

describe('external file changes', () => {
  it('reports a background tab change without altering either editor buffer', async () => {
    state().updateDocumentContent('Unsaved original')
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md', content: 'Other' })
    call.mockResolvedValueOnce('changed')
    await state().refreshDocumentDisk('one')
    expect(call).toHaveBeenCalledWith('monitor_document_disk', { path: '/one.md', expected: '# Before' })
    expect(state().currentDocument).toMatchObject({ id: 'two', content: 'Other' })
    expect(state().documents[0]).toMatchObject({ id: 'one', content: 'Unsaved original', diskIssue: 'changed', isDirty: true })
    call.mockResolvedValueOnce('missing')
    await state().refreshDocumentDisk('one')
    expect(state().documents[0].diskIssue).toBe('missing')
    call.mockResolvedValueOnce('unchanged')
    await state().refreshDocumentDisk('one')
    expect(state().documents[0].diskIssue).toBeUndefined()
    expect(state().documents[0].content).toBe('Unsaved original')
  })

  it('stops scheduled reads after close, cycles through owners, and skips transient work on unmount', async () => {
    vi.useFakeTimers()
    state().setCurrentDocument({ ...initial, id: 'two', path: '/two.md' })
    let finish!: (result: unknown) => void
    call.mockImplementation(async (command, args: any) =>
      command !== 'monitor_document_disk' ? {} : args.path === '/one.md' ? 'unchanged' : new Promise(resolve => { finish = resolve }))
    const stop = watchOpenDocuments()
    try {
      await vi.advanceTimersByTimeAsync(500)
      expect(call).toHaveBeenNthCalledWith(1, 'monitor_document_disk', { path: '/one.md', expected: '# Before' })
      expect(await state().closeDocument('one')).toBe(true)
      await vi.advanceTimersByTimeAsync(500)
      expect(call).toHaveBeenNthCalledWith(2, 'monitor_document_disk', { path: '/two.md', expected: '# Before' })
      await vi.advanceTimersByTimeAsync(3000)
      expect(call).toHaveBeenCalledTimes(2)
      stop()
      finish('changed')
      await vi.advanceTimersByTimeAsync(3000)
      expect(call).toHaveBeenCalledTimes(2)
      expect(state().currentDocument?.diskIssue).toBeUndefined()
    } finally { stop(); vi.useRealTimers() }
  })

  it('guards native Save As through a picker alias to the owned filename', async () => {
    state().updateDocumentContent('Draft')
    call.mockImplementation(async (command, args: any) => {
      if (command === 'canonical_document_path') {
        expect(args.ownedPaths).toEqual(['/one.md'])
        return '/one.md'
      }
      if (command === 'save_document') throw { diskState: 'changed' }
      return {}
    })
    expect(await state().saveDocumentAs('/alias/one.md')).toBe(false)
    expect(call).toHaveBeenCalledWith('save_document', { id: 'one', path: '/one.md', expected: '# Before', content: 'Draft' })
    expect(call).not.toHaveBeenCalledWith('save_document_as', expect.anything())
    expect(state().currentDocument).toMatchObject({ diskIssue: 'changed', isDirty: true, content: 'Draft', savedContent: '# Before' })
  })

  it('uses the guarded save for Save All and the Save actions in Close and Quit', async () => {
    state().updateDocumentContent('Draft')
    call.mockRejectedValue({ diskState: 'missing' })
    expect(await state().saveAll()).toBe(false)
    const close = state().closeDocument('one')
    state().pendingClose!.resolve('save')
    expect(await close).toBe(false)
    const quit = confirmDiscardChanges()
    state().pendingClose!.resolve('save')
    expect(await quit).toBe(false)
    expect(call.mock.calls.map(([command]) => command)).toEqual(['save_document', 'save_document', 'save_document'])
    expect(state().currentDocument).toMatchObject({ diskIssue: 'missing', isDirty: true, content: 'Draft' })
  })

  it('reports a rejected disk read result and preserves explicitly confirmed drafts on failure', async () => {
    state().updateDocumentContent('Draft')
    const doc = state().currentDocument!
    call.mockRejectedValueOnce('unreadable')
    expect(await state().reloadDocument(doc)).toBe(false)
    expect(call).not.toHaveBeenCalled()
    expect(await state().reloadDocument(doc, true)).toBe(false)
    expect(state().currentDocument).toMatchObject({ diskIssue: 'unreadable', content: 'Draft', isDirty: true })
  })

  it('re-reads at explicit reload and invalidates an old confirmation after a newer edit', async () => {
    state().updateDocumentContent('Discarded draft')
    const captured = state().currentDocument!
    let finish!: (result: string) => void
    call.mockImplementationOnce(async () => new Promise(resolve => { finish = resolve }))
    const loading = state().reloadDocument(captured, true)
    state().updateDocumentContent('Newer draft')
    finish('First disk content')
    expect(await loading).toBe(false)
    expect(state().currentDocument?.content).toBe('Newer draft')
    call.mockResolvedValueOnce('Latest disk content')
    expect(await state().reloadDocument(state().currentDocument!, true)).toBe(true)
    expect(state().currentDocument).toMatchObject({ id: 'one', path: '/one.md', content: 'Latest disk content',
      savedContent: 'Latest disk content', reloadCount: 1, isDirty: false })
    expect(state().currentDocument?.diskIssue).toBeUndefined()
  })

  it('commits the approved reload in memory before writing recovery and rejects old engine callbacks', async () => {
    desktop.active = true
    state().updateDocumentContent('Draft before reload')
    let rejected!: (reason: string) => void
    call.mockImplementation(async command => {
      if (command === 'read_document_disk') return 'Fresh disk content'
      if (command === 'save_workspace') return new Promise((_, reject) => { rejected = reject })
      return {}
    })
    const pending = state().reloadDocument(state().currentDocument!, true)
    await tick()
    expect(state().currentDocument).toMatchObject({ content: 'Fresh disk content', reloadCount: 1, isDirty: false })
    state().updateDocumentContent('Stale editor callback', 'one', 0)
    expect(state().currentDocument?.content).toBe('Fresh disk content')
    state().updateDocumentContent('Edit on the new baseline', 'one', 1)
    rejected('Disk full')
    expect(await pending).toBe(true)
    expect(state().currentDocument).toMatchObject({ content: 'Edit on the new baseline', isDirty: true })
    expect(state().error).toContain('recovery storage could not be updated')
  })

  it('does not postpone dirty recovery writes for disk-status-only updates', async () => {
    desktop.active = true
    vi.useFakeTimers()
    call.mockImplementation(async command => command === 'monitor_document_disk' ? 'changed' : {})
    const stop = watchWorkspace()
    try {
      state().updateDocumentContent('Persist this draft')
      await vi.advanceTimersByTimeAsync(300)
      await state().refreshDocumentDisk('one')
      await vi.advanceTimersByTimeAsync(100)
      expect(call).toHaveBeenCalledWith('save_workspace', {
        value: expect.objectContaining({ documents: [expect.objectContaining({ content: 'Persist this draft' })] }),
      })
      const persisted = call.mock.calls.find(([command]) => command === 'save_workspace')?.[1] as { value: { documents: object[] } }
      expect(persisted.value.documents[0]).not.toHaveProperty('diskIssue')
    } finally { stop(); await flushWorkspace(); vi.useRealTimers() }
  })

  it('waits for an in-flight scan to release the path before saving and ignores its earlier status', async () => {
    let finish!: (result: string) => void
    call.mockImplementationOnce(async () => new Promise(resolve => { finish = resolve }))
    const monitor = state().refreshDocumentDisk('one')
    const write = state().saveDocument()
    await tick()
    expect(call).not.toHaveBeenCalledWith('save_document', expect.anything())
    finish('missing')
    await monitor
    expect(await write).toBe(true)
    expect(state().currentDocument?.diskIssue).toBeUndefined()
  })

  it('uses the latest saved baseline for queued same-path writes', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementationOnce(async () => new Promise(resolve => { finish = resolve }))
    state().updateDocumentContent('First edit')
    const first = state().saveDocument()
    state().updateDocumentContent('Second edit')
    const second = state().saveDocument()
    finish({ path: '/one.md' })
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(call).toHaveBeenLastCalledWith('save_document', { id: 'one', path: '/one.md', expected: 'First edit', content: 'Second edit' })
    expect(state().currentDocument).toMatchObject({ savedContent: 'Second edit', isDirty: false })
  })

  it('declines an owned copy path and preserves the original ownership and dirty state', async () => {
    state().updateDocumentContent('Draft')
    const doc = state().currentDocument!
    vi.mocked(save).mockResolvedValueOnce(null)
    expect(await saveCopyWithDialog(doc)).toBe(false)
    expect(call).not.toHaveBeenCalled()
    expect(await state().saveDocumentCopy(doc, '/one.md')).toBe(false)
    expect(call).not.toHaveBeenCalledWith('save_document_copy', expect.anything())
    expect(await state().saveDocumentCopy(doc, '/copy.md')).toBe(true)
    expect(call).toHaveBeenCalledWith('save_document_copy', { path: '/copy.md', content: 'Draft' })
    expect(state().currentDocument).toMatchObject({ id: 'one', path: '/one.md', content: 'Draft', isDirty: true })
  })
})
