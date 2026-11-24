import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import type { EditorViewRef } from './EditorView'
import { defaultConfig } from '../lib/preferences'
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
  vi.mocked(invoke).mockReset().mockResolvedValue(null)
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh)' })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn() })
  const a = doc('a')
  useAppStore.setState({ documents: [a], currentDocument: a, pendingClose: null, pendingDiskReload: null })
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

  it('invalidates native clipboard and editing command generations across reload confirmation', async () => {
    const insert = vi.fn()
    render(<MenuBar editorViewRef={{ current: { insertMarkdown: insert } as unknown as EditorViewRef }} editorMode="markdown" />)
    await act(async () => {})
    const oldGeneration = latestGeneration()
    act(() => {
      useAppStore.setState({ pendingDiskReload: { document: doc('a'), loading: false } })
      send('erd', oldGeneration)
    })
    const modalGeneration = latestGeneration()
    act(() => send('erd', modalGeneration))
    act(() => {
      useAppStore.setState({ pendingDiskReload: null })
      send('erd', modalGeneration)
    })
    expect(insert).not.toHaveBeenCalled()
    act(() => send('erd'))
    expect(insert).toHaveBeenCalledOnce()
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

it('announces an update without taking focus or touching the active document', async () => {
  let finish!: (value: unknown) => void
  vi.mocked(invoke).mockImplementation(command => command === 'check_updates'
    ? new Promise(resolve => { finish = resolve })
    : Promise.resolve(null))
  const source = { ...doc('draft', 3), isDirty: true }
  useAppStore.setState({ documents: [source], currentDocument: source, config: { ...defaultConfig } })
  render(<><MenuBar /><textarea aria-label="Editor fixture" defaultValue={source.content} /></>)
  const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Editor fixture' })
  editor.focus()
  editor.setSelectionRange(1, 3)
  await act(async () => {})
  const url = 'https://github.com/rheiger/markWriter/releases/tag/v2.13.1'
  await act(async () => finish({
    kind: 'available', version: '2.13.1', currentVersion: '2.12.2', releasePageUrl: url,
    installer: { kind: 'unavailable', reason: 'missingInstaller' },
  }))
  expect(screen.getByRole('status')).toHaveTextContent('MarkWriter 2.13.1 is available.')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(editor).toHaveFocus()
  expect(editor.selectionStart).toBe(1)
  expect(editor.selectionEnd).toBe(3)
  expect(useAppStore.getState().currentDocument).toBe(source)

  fireEvent.click(screen.getByRole('button', { name: 'View update' }))
  expect(screen.getByRole('dialog', { name: 'Check for Updates' })).toBeVisible()
  expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === 'check_updates')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Open release page' }))
  await act(async () => {})
  expect(invoke).toHaveBeenCalledWith('open_update_link', { version: '2.13.1', url })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('button', { name: 'View update' })).toBeNull()
})
