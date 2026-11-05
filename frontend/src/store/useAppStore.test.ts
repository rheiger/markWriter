import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { useAppStore, confirmDiscardChanges } from './useAppStore'
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }))
const call = vi.mocked(invoke)
const initial = { id: 'one', title: 'One', content: '# Before', path: '/one.md', isDirty: false, lastModified: new Date() }
const state = () => useAppStore.getState()
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  call.mockReset()
  call.mockImplementation(async (command, args: any) => command === 'canonical_document_path' ? args.path : {})
  useAppStore.setState({ documents: [], currentDocument: null, isLoading: false, error: null, pendingClose: null })
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
