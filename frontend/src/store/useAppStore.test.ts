import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { useAppStore, confirmDiscardChanges, registerActiveViewCapture } from './useAppStore'
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }))
const call = vi.mocked(invoke)
const initial = { id: 'one', title: 'One', content: '# Before', path: '/one.md', isDirty: false, lastModified: new Date() }
const state = () => useAppStore.getState()
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  call.mockReset()
  vi.mocked(save).mockReset()
  call.mockImplementation(async (command, args: any) => command === 'canonical_document_path' ? args.path : {})
  useAppStore.setState({ documents: [], fileViews: [], currentDocument: null, isLoading: false, error: null, pendingClose: null })
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
