import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirm } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from './useAppStore'
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const call = vi.mocked(invoke)
const initial = { id: 'one', title: 'One', content: '# Before', path: '/one.md', isDirty: false, lastModified: new Date() }

describe('save and dirty state', () => {
  beforeEach(() => {
    call.mockReset()
    useAppStore.setState({ currentDocument: { ...initial }, isLoading: false, error: null })
  })
  it('does not clear unsaved state on a repeated content update', () => {
    useAppStore.getState().updateDocumentContent('# Changed')
    useAppStore.getState().updateDocumentContent('# Changed')
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(true)
  })
  it('keeps edits made while an earlier revision is saving', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const saving = useAppStore.getState().saveDocument()
    useAppStore.getState().updateDocumentContent('# Newer edit')
    finish({})
    await saving
    expect(useAppStore.getState().currentDocument!.content).toBe('# Newer edit')
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(true)
  })
  it('does not replace newer text when Save As finishes', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const saving = useAppStore.getState().saveDocumentAs('/two.md')
    useAppStore.getState().updateDocumentContent('# Newer edit')
    finish({ path: '/two.md', title: 'Two' })
    await saving
    expect(useAppStore.getState().currentDocument!.content).toBe('# Newer edit')
    expect(useAppStore.getState().currentDocument!.path).toBe('/two.md')
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(true)
  })
  it('keeps another document current when Save As completes', async () => {
    let finish!: (result: unknown) => void
    call.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const saving = useAppStore.getState().saveDocumentAs('/two.md')
    useAppStore.setState({ currentDocument: { ...initial, id: 'other', content: 'Other' } })
    finish({ path: '/two.md' })
    await saving
    expect(useAppStore.getState().currentDocument!.id).toBe('other')
  })
  it('keeps unsaved text when replacing a document is cancelled', async () => {
    useAppStore.getState().updateDocumentContent('Unsaved')
    vi.mocked(confirm).mockResolvedValue(false)
    await useAppStore.getState().createNewDocument()
    await useAppStore.getState().openDocument('/other.md')
    expect(call).not.toHaveBeenCalled()
    expect(useAppStore.getState().currentDocument!.content).toBe('Unsaved')
  })

  it('keeps unsaved content and exposes native write errors', async () => {
    useAppStore.getState().updateDocumentContent('Unsaved')
    call.mockRejectedValueOnce('Permission denied')
    await useAppStore.getState().saveDocument()
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(true)
    expect(useAppStore.getState().currentDocument!.content).toBe('Unsaved')
    expect(useAppStore.getState().error).toContain('Permission denied')
  })

})
