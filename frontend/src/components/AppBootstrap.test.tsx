import { expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import App from '../App'
import { useAppStore } from '../store/useAppStore'
import { installNativeBridge } from '../test/nativeBridge'
const nativeEvents = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>())
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, listener: (event: { payload: unknown }) => void) => {
    nativeEvents.set(name, listener)
    return () => { if (nativeEvents.get(name) === listener) nativeEvents.delete(name) }
  }),
}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn(), open: vi.fn() }))
it('holds document controls until delayed native recovery is complete', async () => {
  let restore!: (value: unknown) => void
  vi.mocked(invoke).mockImplementation(async command => command === 'load_workspace' ? new Promise(resolve => { restore = resolve }) : null)
  useAppStore.setState({ documents: [], currentDocument: null })
  render(<App />)
  expect(screen.queryByRole('button', { name: 'File', exact: true })).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('Restoring workspace')
  installNativeBridge()
  const bridge = Object.getOwnPropertyDescriptor(window, '__MARKWRITER_ACCEPTANCE__')?.value
  expect(() => bridge.checkpointForRestart()).toThrow('The workspace is still restoring.')
  expect(invoke).not.toHaveBeenCalledWith('save_workspace', expect.anything())
  await act(async () => { await Promise.resolve() })
  await act(async () => restore({ version: 1, activeId: 'restored', documents: [{ id: 'restored', title: 'Recovered', content: 'Local draft', isDirty: true }] }))
  expect(await screen.findByRole('tab', { name: /Recovered/ })).toBeVisible()
  expect(useAppStore.getState().currentDocument?.content).toBe('Local draft')
})

it('loads a saved update opt-out before scheduling checks and keeps the manual menu available', async () => {
  let loadSettings!: (value: unknown) => void
  const settings = new Promise(resolve => { loadSettings = resolve })
  vi.mocked(invoke).mockReset().mockImplementation(async command => {
    if (command === 'load_preferences') return settings
    if (command === 'check_updates') return { kind: 'current', version: '2.12.2' }
    return null
  })
  const doc = {
    id: 'local', title: 'Local', content: 'Draft', revision: 0, isDirty: true, lastModified: new Date(0),
  }
  useAppStore.setState({ documents: [doc], currentDocument: doc })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  render(<App />)
  expect(invoke).not.toHaveBeenCalledWith('check_updates')
  await act(async () => loadSettings({ version: 1, config: { automaticUpdateChecks: false } }))
  const help = await screen.findByRole('button', { name: 'Help', exact: true })
  expect(invoke).not.toHaveBeenCalledWith('check_updates')
  fireEvent.click(help)
  fireEvent.click(screen.getByRole('button', { name: 'Check for Updates…' }))
  expect(await screen.findByText('Version 2.12.2 is up to date.')).toBeVisible()
  expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === 'check_updates')).toHaveLength(1)
})

it('defers cross-window focus until the received tab exists and the workspace unlocks', async () => {
  vi.mocked(invoke).mockReset().mockResolvedValue(null)
  const first = { id: 'first', title: 'First tab', content: 'First', isDirty: false, lastModified: new Date(0) }
  const received = { ...first, id: 'received', title: 'Received tab' }
  useAppStore.setState({ documents: [first], currentDocument: first, windowBusy: false })
  render(<App />)
  await screen.findByRole('tab', { name: 'First tab' })
  await waitFor(() => {
    expect(nativeEvents.has('editor-focus-document')).toBe(true)
    expect(useAppStore.getState().windowBusy).toBe(false)
  })

  act(() => {
    useAppStore.setState({ windowBusy: true })
    nativeEvents.get('editor-focus-document')?.({ payload: { id: received.id } })
    useAppStore.setState({ documents: [first, received] })
  })
  expect(useAppStore.getState().currentDocument?.id).toBe(first.id)
  act(() => useAppStore.setState({ windowBusy: false }))
  expect(useAppStore.getState().currentDocument?.id).toBe(received.id)
  expect(screen.getByRole('tab', { name: 'Received tab' })).toHaveAttribute('aria-selected', 'true')
})
