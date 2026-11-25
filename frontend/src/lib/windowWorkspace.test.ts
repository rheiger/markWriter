import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { loadWorkspace } from './persistence'
import { useAppStore, type Document } from '../store/useAppStore'
import { cancelAppQuit, closeEditorWindow, moveEditorDocument, receiveEditorTransfers, recoverEditorTransfer, reviewAppQuit } from './windowWorkspace'

const bridge = vi.hoisted(() => ({
  capture: vi.fn(),
  stage: vi.fn(),
  composing: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }))
vi.mock('./editorComposition', () => ({ editorIsComposing: bridge.composing }))
vi.mock('./editorTransfer', () => ({ captureEditorTransfer: bridge.capture, stageEditorTransfer: bridge.stage }))

const native = vi.mocked(invoke)
const state = useAppStore.getState
const draft: Document = {
  id: 'draft', title: 'A local draft', content: '*unsaved*', isDirty: true, revision: 7,
  mode: 'markdown', lastModified: new Date(0),
}
const sibling: Document = { ...draft, id: 'sibling', title: 'Sibling', content: 'Keep', isDirty: false }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { resolve, reject, promise }
}

beforeEach(async () => {
  native.mockReset().mockResolvedValue(null)
  bridge.composing.mockReset().mockReturnValue(false)
  bridge.capture.mockReset().mockReturnValue({ mode: 'markdown', view: { sourceHead: 5 }, sourceViewportAnchor: 0 })
  bridge.stage.mockReset().mockReturnValue({ ready: Promise.resolve(), cancel: vi.fn() })
  useAppStore.setState({ documents: [draft, sibling], currentDocument: draft, windowBusy: false,
    pendingClose: null, pendingDiskReload: null, transferRecovery: null, isLoading: false, fileViews: [], error: null })
  await loadWorkspace()
  native.mockClear()
})

it('moves the captured draft and keeps its source locked until native commits', async () => {
  const committed = deferred<{ epoch: number }>()
  native.mockImplementation(async command => command === 'move_editor_document' ? committed.promise : null)
  const moving = moveEditorDocument(draft.id, 'editor-target')
  expect(state().windowBusy).toBe(true)
  state().updateDocumentContent('Late edit')
  expect(state().currentDocument?.content).toBe(draft.content)
  expect(await state().closeDocument(sibling.id)).toBe(false)
  await vi.waitFor(() => expect(native).toHaveBeenCalledWith('move_editor_document', expect.objectContaining({
    destination: 'editor-target', id: draft.id, epoch: 0,
    source: expect.objectContaining({ documents: [
      expect.objectContaining({ id: draft.id, content: draft.content, revision: 7, viewState: { sourceHead: 5 } }), sibling,
    ] }),
  })))
  expect(state().documents).toEqual([draft, sibling])
  committed.resolve({ epoch: 1 })
  expect(await moving).toBe(true)
  expect(state().windowBusy).toBe(false)
  expect(state().documents).toEqual([sibling])
  expect(native).toHaveBeenCalledWith('focus_editor_window', { label: 'editor-target', id: draft.id })
})

it.each([false, true])('reconciles a rejected move response using native ownership, committed = %s', async committed => {
  native.mockImplementation(async command => {
    if (command === 'move_editor_document') throw new Error('Move did not return successfully')
    if (command === 'editor_document_owner') {
      return { owner: { label: committed ? 'editor-target' : 'main', id: draft.id }, epoch: committed ? 2 : 0 }
    }
    return null
  })
  expect(await moveEditorDocument(draft.id, 'editor-target')).toBe(committed)
  expect(state().windowBusy).toBe(false)
  expect(state().documents.some(doc => doc.id === draft.id)).toBe(!committed)
  if (!committed) expect(state().error).toContain('Move did not return successfully')
})

it('retries native acknowledgment without replacing a previously received tab', async () => {
  let lostReceipt = true
  native.mockImplementation(async command => {
    if (command === 'take_editor_transfers') return { epoch: 3, transfers: [{ document: draft, session: {} }] }
    if (command === 'ack_editor_transfer' && lostReceipt) throw new Error('Retry acknowledgment')
    return null
  })
  useAppStore.setState({ documents: [sibling], currentDocument: sibling })
  expect(await receiveEditorTransfers()).toBe(false)
  const received = state().documents.find(doc => doc.id === draft.id)
  expect(received).toMatchObject(draft)
  state().updateDocumentContent('Retain an edit between retries', draft.id)
  lostReceipt = false
  expect(await receiveEditorTransfers()).toBe(true)
  expect(bridge.stage).toHaveBeenCalledOnce()
  expect(state().documents.filter(doc => doc.id === draft.id)).toHaveLength(1)
  expect(state().documents.find(doc => doc.id === draft.id)?.content).toBe('Retain an edit between retries')
})

it.each([false, true])('retains failed history until explicit recovery, retry = %s', async retry => {
  bridge.stage.mockReturnValueOnce({ ready: Promise.reject(new Error('Hydration failed')), cancel: vi.fn() })
  let acknowledged = false
  native.mockImplementation(async command => {
    if (command === 'ack_editor_transfer') acknowledged = true
    if (command === 'take_editor_transfers' && !acknowledged) {
      return { epoch: 3, transfers: [{ document: { ...draft, id: 'new-draft' }, session: {} }] }
    }
    return null
  })
  expect(await receiveEditorTransfers()).toBe(true)
  expect(state().documents.find(doc => doc.id === 'new-draft')).toMatchObject({ content: draft.content })
  expect(state().transferRecovery?.message).toContain('Hydration failed')
  expect(state().windowBusy).toBe(true)
  expect(native).not.toHaveBeenCalledWith('ack_editor_transfer', expect.anything())
  await recoverEditorTransfer('new-draft', retry)
  expect(native).toHaveBeenCalledWith('ack_editor_transfer', { id: 'new-draft' })
  expect(state().documents.find(doc => doc.id === 'new-draft')).toMatchObject({ content: draft.content, reloadCount: 1 })
  expect(state().windowBusy).toBe(false)
  expect(state().transferRecovery).toBeNull()
  if (retry) expect(bridge.stage).toHaveBeenLastCalledWith(expect.objectContaining({ reloadCount: 1 }), {}, { remount: true })
  else expect(bridge.stage).toHaveBeenCalledOnce()
})

it('stages Quit discards while retaining actual drafts until the shared native commit', async () => {
  const review = reviewAppQuit('quit-1')
  expect(state().pendingClose?.id).toBe(draft.id)
  state().pendingClose!.resolve('discard')
  await review
  expect(state().windowBusy).toBe(true)
  expect(state().documents).toEqual([draft, sibling])
  expect(native).toHaveBeenCalledWith('save_workspace', {
    value: expect.objectContaining({ documents: [draft, sibling] }),
    epoch: 0,
  })
  expect(native).toHaveBeenCalledWith('answer_app_quit', {
    token: 'quit-1', allowed: true, value: expect.objectContaining({ documents: [sibling] }), epoch: 0,
  })
  cancelAppQuit('quit-1')
  expect(state().windowBusy).toBe(false)
  expect(state().documents).toEqual([draft, sibling])
})

it('cancels a window close without committing a modified session', async () => {
  const closing = closeEditorWindow()
  state().pendingClose!.resolve('cancel')
  await closing
  expect(state().documents).toEqual([draft, sibling])
  expect(state().windowBusy).toBe(false)
  expect(native).not.toHaveBeenCalledWith('finish_editor_window_close', expect.anything())
})

it('focuses the existing native owner of an already open path', async () => {
  native.mockImplementation(async command =>
    command === 'open_owned_document' ? { owner: { label: 'editor-target', id: 'remote-tab' } } : null)
  await state().openDocument('/opened.md')
  expect(state().documents).toEqual([draft, sibling])
  expect(native).toHaveBeenCalledWith('focus_editor_window', { label: 'editor-target', id: 'remote-tab' })
})

it('defers incoming transfers while the destination editor is composing', async () => {
  bridge.composing.mockImplementation(id => id === draft.id)
  expect(await receiveEditorTransfers()).toBe(false)
  expect(state().windowBusy).toBe(false)
  expect(native).not.toHaveBeenCalled()

  bridge.composing.mockReturnValue(false)
  expect(await receiveEditorTransfers()).toBe(true)
  expect(native).toHaveBeenCalledWith('take_editor_transfers')
})

it('keeps all drafts live when window close or Quit is attempted during composition', async () => {
  bridge.composing.mockImplementation(id => id === draft.id)
  await closeEditorWindow()
  await reviewAppQuit('composing')
  expect(state().pendingClose).toBeNull()
  expect(state().windowBusy).toBe(false)
  expect(state().documents).toEqual([draft, sibling])
  expect(native).not.toHaveBeenCalledWith('finish_editor_window_close', expect.anything())
  expect(native).toHaveBeenCalledWith('answer_app_quit', expect.objectContaining({ token: 'composing', allowed: false }))

  bridge.composing.mockReturnValue(false)
  const close = closeEditorWindow()
  expect(state().pendingClose?.id).toBe(draft.id)
  state().pendingClose!.resolve('cancel')
  await close
})
