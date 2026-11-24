import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { UpdateDialog } from './UpdateDialog'
import type { AvailableUpdate, UpdateCheckResult } from '../lib/useUpdateChecks'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }

const available: AvailableUpdate = {
  kind: 'available',
  currentVersion: '2.12.2',
  version: '2.13.1',
  releasePageUrl: 'https://github.com/rheiger/markWriter/releases/tag/v2.13.1',
  installer: { kind: 'available', url: 'https://github.com/rheiger/markWriter/releases/download/v2.13.1/MarkWriter-2.13.1-macos-arm64.dmg' },
}

it('hands the matching installer to the browser after the user chooses it', async () => {
  const openLink = vi.fn().mockResolvedValue(undefined)
  render(<UpdateDialog check={async () => available} openLink={openLink} onClose={vi.fn()} />)
  const download = await screen.findByRole('button', { name: 'Open installer download' })
  expect(screen.getByRole('status')).toHaveTextContent('Version 2.13.1 is available (installed: 2.12.2).')
  expect(openLink).not.toHaveBeenCalled()
  fireEvent.click(download)
  await waitFor(() => expect(openLink).toHaveBeenCalledWith('2.13.1', available.installer.kind === 'available' && available.installer.url))
})

it.each([
  ['missingInstaller', 'This release has no matching installer for this platform.'],
  ['unsupportedPlatform', 'Installer matching is unavailable for this platform.'],
] as const)('offers the release page for %s', async (reason, message) => {
  const openLink = vi.fn().mockResolvedValue(undefined)
  const check = vi.fn()
  render(<UpdateDialog check={check} initialUpdate={{ ...available, installer: { kind: 'unavailable', reason } }} openLink={openLink} onClose={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent(message)
  expect(check).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open release page' }))
  await waitFor(() => expect(openLink).toHaveBeenCalledWith('2.13.1', available.releasePageUrl))
})

it('makes a failed browser handoff retryable without exposing raw errors', async () => {
  const openLink = vi.fn().mockRejectedValueOnce(new Error('private OS path')).mockResolvedValueOnce(undefined)
  render(<UpdateDialog check={vi.fn()} initialUpdate={available} openLink={openLink} onClose={vi.fn()} />)
  const download = screen.getByRole('button', { name: 'Open installer download' })
  fireEvent.click(download)
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not open.*Try again/)
  expect(screen.queryByText(/private OS path/)).toBeNull()
  fireEvent.click(download)
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(openLink).toHaveBeenCalledTimes(2)
})

it('shows a failure without exposing a raw network or server error', async () => {
  render(<UpdateDialog check={async () => { throw new Error('private URL and token') }} openLink={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText(/Could not check/)).toBeVisible()
  expect(screen.queryByText(/private URL/)).toBeNull()
})

it('ignores a stale check when the checker changes', async () => {
  let finish!: (result: UpdateCheckResult) => void
  const first = () => new Promise<UpdateCheckResult>(resolve => { finish = resolve })
  const second = async (): Promise<UpdateCheckResult> => ({ kind: 'current', version: '2.12.2' })
  const view = render(<UpdateDialog check={first} openLink={vi.fn()} onClose={vi.fn()} />)
  view.rerender(<UpdateDialog check={second} openLink={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText(/2.12.2 is up to date/)).toBeVisible()
  finish(available)
  await waitFor(() => expect(screen.queryByText(/2.13.1/)).toBeNull())
})
