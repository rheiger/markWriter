import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
