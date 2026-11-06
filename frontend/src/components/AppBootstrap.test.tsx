import { expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
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
