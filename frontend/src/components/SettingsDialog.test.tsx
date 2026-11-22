import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsDialog } from './SettingsDialog'
import { useAppStore } from '../store/useAppStore'
import { defaultConfig } from '../lib/preferences'
import { invoke } from '@tauri-apps/api/core'
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }))
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
beforeEach(() => { useAppStore.setState({ config: { ...defaultConfig }, error: null }); vi.mocked(invoke).mockReset() })
it('Cancel and Reset do not commit a dialog draft; Apply persists separate values', async () => {
  const close = vi.fn()
  const view = render(<SettingsDialog onClose={close} />)
  fireEvent.change(screen.getByLabelText('Source text size'), { target: { value: '20' } })
  expect(useAppStore.getState().config.fontSize).toBe(14)
  fireEvent.click(screen.getByText('Cancel'))
  expect(useAppStore.getState().config.fontSize).toBe(14)
  view.unmount()
  render(<SettingsDialog onClose={close} />)
  fireEvent.change(screen.getByLabelText('Source text size'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('Rendered text size'), { target: { value: '24' } })
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(useAppStore.getState().config).toMatchObject({ fontSize: 20, renderedFontSize: 24 }))
  expect(invoke).toHaveBeenCalledWith('save_preferences', expect.objectContaining({ value: { version: 1, config: expect.objectContaining({ fontSize: 20, renderedFontSize: 24 }) } }))
})
it('storage failure leaves current preferences intact and dialog retryable', async () => {
  vi.mocked(invoke).mockRejectedValueOnce('Read only')
  render(<SettingsDialog onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } })
  fireEvent.click(screen.getByText('Apply'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Read only')
  expect(useAppStore.getState().config.theme).toBe('system')
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(useAppStore.getState().config.theme).toBe('dark'))
})

const darkProfile = { format: 'markwriter-settings', version: 1, config: { ...defaultConfig, theme: 'dark' } }

it('imports into the draft and persists only on Apply', async () => {
  vi.mocked(invoke).mockResolvedValueOnce(darkProfile)
  const close = vi.fn()
  render(<SettingsDialog onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'Import Settings…' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Apply')
  expect(screen.getByLabelText('Theme')).toHaveValue('dark')
  expect(useAppStore.getState().config.theme).toBe('system')
  expect(invoke).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Apply'))
  await waitFor(() => expect(close).toHaveBeenCalled())
  expect(useAppStore.getState().config.theme).toBe('dark')
})

it('canceled or rejected imports preserve both a draft and live settings', async () => {
  vi.mocked(invoke).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...darkProfile, version: 2 }).mockResolvedValueOnce(darkProfile)
  const close = vi.fn()
  render(<SettingsDialog onClose={close} />)
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } })
  const importButton = screen.getByRole('button', { name: 'Import Settings…' })
  fireEvent.click(importButton)
  await waitFor(() => expect(importButton).toBeEnabled())
  expect(screen.getByLabelText('Theme')).toHaveValue('light')
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(importButton)
  expect(await screen.findByRole('alert')).toHaveTextContent('version')
  expect(screen.getByLabelText('Theme')).toHaveValue('light')
  fireEvent.click(importButton)
  await waitFor(() => expect(screen.getByLabelText('Theme')).toHaveValue('dark'))
  fireEvent.click(screen.getByText('Cancel'))
  expect(close).toHaveBeenCalled()
  expect(useAppStore.getState().config.theme).toBe('system')
  expect(invoke).toHaveBeenCalledTimes(3)
})

it('exports the current draft and reports a retryable native write failure', async () => {
  vi.mocked(invoke).mockRejectedValueOnce('Choose a new file name.').mockResolvedValueOnce(true)
  render(<SettingsDialog onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } })
  const exportButton = screen.getByRole('button', { name: 'Export Settings…' })
  fireEvent.click(exportButton)
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a new file name.')
  expect(useAppStore.getState().config.theme).toBe('system')
  expect(invoke).toHaveBeenLastCalledWith('export_settings_profile', { profile: darkProfile })
  fireEvent.click(exportButton)
  expect(await screen.findByRole('status')).toHaveTextContent('exported')
})

it('ignores a native picker result after the Settings dialog is replaced', async () => {
  let resolveImport!: (value: unknown) => void
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { resolveImport = resolve }))
  const previous = render(<SettingsDialog onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Import Settings…' }))
  expect(screen.getByLabelText('Theme')).toBeDisabled()
  expect(screen.getByText('Apply')).toBeDisabled()
  previous.unmount()
  render(<SettingsDialog onClose={vi.fn()} />)
  await act(() => resolveImport(darkProfile))
  expect(screen.getByLabelText('Theme')).toHaveValue('system')
  expect(screen.queryByRole('status')).toBeNull()
  expect(useAppStore.getState().config.theme).toBe('system')
})
