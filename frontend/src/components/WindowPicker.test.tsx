import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { WindowPicker } from './WindowPicker'
import { listEditorWindows } from '../lib/windowWorkspace'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }))
vi.mock('../lib/windowWorkspace', () => ({ listEditorWindows: vi.fn() }))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  vi.mocked(listEditorWindows).mockResolvedValue([
    { label: 'main', title: 'Current.md', focused: true },
    { label: 'editor-other', title: 'Other.md', focused: false },
  ])
})

it('lists the current window and activates a selected window by its native label', async () => {
  const choose = vi.fn()
  render(<WindowPicker onChoose={choose} onClose={() => {}} />)
  const current = await screen.findByRole('button', { name: 'Current.md' })
  expect(current).toHaveAttribute('aria-current', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Other.md' }))
  expect(choose).toHaveBeenCalledExactlyOnceWith('editor-other')
})

it('excludes the current window from move destinations and offers a new window', async () => {
  const choose = vi.fn()
  render(<WindowPicker move onChoose={choose} onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Other.md' }))
  expect(screen.queryByRole('button', { name: 'Current.md' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'New Window' }))
  expect(choose.mock.calls).toEqual([['editor-other'], []])
})
