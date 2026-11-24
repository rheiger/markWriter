import { expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import App from '../App'
import { useAppStore } from '../store/useAppStore'
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
