import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import type { EditorViewRef } from './EditorView'
import { MenuBar } from './MenuBar'
import { useAppStore, type Document } from '../store/useAppStore'

const native = vi.hoisted(() => ({ listener: undefined as undefined | ((event: { payload: { action: string, generation: number } }) => void) }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn().mockResolvedValue(null) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async (_name, listener) => { native.listener = listener; return () => { native.listener = undefined } }) }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn().mockResolvedValue('2.5.1') }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn(), open: vi.fn() }))

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
const originalShowModal = HTMLDialogElement.prototype.showModal
const originalClose = HTMLDialogElement.prototype.close
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

const doc = (id: string, revision = 0): Document => ({ id, title: id, content: id, revision, isDirty: false, lastModified: new Date(0) })
const latestGeneration = () => {
  const calls = vi.mocked(invoke).mock.calls.filter(([name]) => name === 'sync_native_menu')
  return (calls.at(-1)?.[1] as { state: { generation: number } }).state.generation
}
const send = (action: string, generation = latestGeneration()) => native.listener?.({ payload: { action, generation } })

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh)' })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn() })
  const a = doc('a')
  useAppStore.setState({ documents: [a], currentDocument: a, pendingClose: null })
})
afterEach(() => {
  cleanup()
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent)
  else Reflect.deleteProperty(navigator, 'userAgent')
  HTMLDialogElement.prototype.showModal = originalShowModal
  HTMLDialogElement.prototype.close = originalClose
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand)
  else Reflect.deleteProperty(document, 'execCommand')
  vi.restoreAllMocks()
})

describe('native Mac menu dispatch', () => {
  it.each(['tab', 'revision'])('rejects queued actions after a %s change before React renders', async change => {
    const insert = vi.fn(), undo = vi.fn()
    const editorViewRef = { current: { insertMarkdown: insert, undo } as unknown as EditorViewRef }
    render(<MenuBar editorViewRef={editorViewRef} editorMode="markdown" />)
    await act(async () => {})
    const generation = latestGeneration()
    act(() => {
      const next = change === 'tab' ? doc('b') : doc('a', 1)
      useAppStore.setState({ documents: [next], currentDocument: next })
      send('erd', generation)
      send('undo', generation)
    })
    expect(insert).not.toHaveBeenCalled()
    expect(undo).not.toHaveBeenCalled()
    expect(useAppStore.getState().currentDocument?.content).toBe(change === 'tab' ? 'b' : 'a')
    act(() => send('erd'))
    expect(insert).toHaveBeenCalledOnce()
  })

  it('allows Undo in a modal input while blocking document insertion', async () => {
    const insert = vi.fn()
    render(<MenuBar editorViewRef={{ current: { insertMarkdown: insert } as unknown as EditorViewRef }} />)
    await act(async () => {})
    act(() => send('settings'))
    const input = screen.getByLabelText('Source font')
    input.focus()
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    act(() => { send('undo'); send('erd') })
    expect(document.execCommand).toHaveBeenCalledWith('undo')
    expect(insert).not.toHaveBeenCalled()
  })

  it('uses the screen menu while About and Help still open and close', async () => {
    render(<MenuBar />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'File', exact: true })).toBeNull()
    act(() => send('about'))
    expect(screen.getByRole('dialog', { name: 'About MarkWriter' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    act(() => send('help'))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('heading', { name: /help/i })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
