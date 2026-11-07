import { render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { UpdateDialog, type UpdateCheckResult } from './UpdateDialog'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }

it('reports a verified result without offering an unqualified installer', async () => {
  render(<UpdateDialog check={async () => ({ kind: 'available', currentVersion: '2.5.1', version: '2.6.0' })} onClose={vi.fn()} />)
  expect(await screen.findByText(/Version 2.6.0 is available/)).toHaveTextContent('Installation is not yet available')
  expect(screen.queryByRole('button', { name: /install/i })).toBeNull()
})

it('shows a failure without exposing a raw network or server error', async () => {
  render(<UpdateDialog check={async () => { throw new Error('private URL and token') }} onClose={vi.fn()} />)
  expect(await screen.findByText(/Could not check/)).toBeVisible()
  expect(screen.queryByText(/private URL/)).toBeNull()
})

it('ignores a stale check when the checker changes', async () => {
  let finish!: (result: UpdateCheckResult) => void
  const first = () => new Promise<UpdateCheckResult>(resolve => { finish = resolve })
  const second = async (): Promise<UpdateCheckResult> => ({ kind: 'current', version: '2.6.0' })
  const view = render(<UpdateDialog check={first} onClose={vi.fn()} />)
  view.rerender(<UpdateDialog check={second} onClose={vi.fn()} />)
  expect(await screen.findByText(/2.6.0 is up to date/)).toBeVisible()
  finish({ kind: 'available', currentVersion: '1.0.0', version: '9.0.0' })
  await waitFor(() => expect(screen.queryByText(/9.0.0/)).toBeNull())
})
