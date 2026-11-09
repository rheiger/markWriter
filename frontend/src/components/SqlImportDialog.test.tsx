import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SqlImportDialog } from './SqlImportDialog'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }

it('requires a dialect and inserts the reviewed, edited DBML', async () => {
  const select = vi.fn(async () => ({ dbml: 'Table users {}', warnings: ['Views omitted'] }))
  const insert = vi.fn()
  const close = vi.fn()
  render(<SqlImportDialog onSelectFile={select} onInsert={insert} onClose={close} />)
  expect(screen.getByRole('button', { name: /choose sql file/i })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/sql dialect/i), { target: { value: 'sqlite' } })
  fireEvent.click(screen.getByRole('button', { name: /choose sql file/i }))
  expect(await screen.findByText('Views omitted')).toBeVisible()
  expect(select).toHaveBeenCalledWith('sqlite', expect.any(AbortSignal))
  fireEvent.change(screen.getByLabelText(/dbml preview/i), { target: { value: 'Table edited {}' } })
  fireEvent.click(screen.getByRole('button', { name: /append/i }))
  await waitFor(() => expect(insert).toHaveBeenCalledExactlyOnceWith('Table edited {}', expect.any(AbortSignal)))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
})

it('discards a late result when the dialect changes', async () => {
  let finish!: (result: { dbml: string; warnings: string[] }) => void
  let signal!: AbortSignal
  const select = vi.fn((_dialect, s: AbortSignal) => { signal = s; return new Promise<{ dbml: string; warnings: string[] }>(resolve => { finish = resolve }) })
  render(<SqlImportDialog onSelectFile={select} onInsert={vi.fn()} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText(/sql dialect/i), { target: { value: 'postgresql' } })
  fireEvent.click(screen.getByRole('button', { name: /choose sql file/i }))
  fireEvent.change(screen.getByLabelText(/sql dialect/i), { target: { value: 'sqlite' } })
  expect(signal.aborted).toBe(true)
  await act(async () => finish({ dbml: 'stale', warnings: [] }))
  expect(screen.queryByLabelText(/dbml preview/i)).toBeNull()
})

it('cancels pending work on close and never inserts its late result', async () => {
  let finish!: (result: { dbml: string; warnings: string[] }) => void
  let signal!: AbortSignal
  const insert = vi.fn()
  const close = vi.fn()
  render(<SqlImportDialog onSelectFile={(_dialect, s) => { signal = s; return new Promise(resolve => { finish = resolve }) }} onInsert={insert} onClose={close} />)
  fireEvent.change(screen.getByLabelText(/sql dialect/i), { target: { value: 'sqlite' } })
  fireEvent.click(screen.getByRole('button', { name: /choose sql file/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(signal.aborted).toBe(true)
  expect(close).toHaveBeenCalledOnce()
  await act(async () => finish({ dbml: 'stale', warnings: [] }))
  expect(insert).not.toHaveBeenCalled()
  expect(screen.queryByLabelText(/dbml preview/i)).toBeNull()
})

it('blocks insertion after a parsing failure and displays the error as text', async () => {
  render(<SqlImportDialog onSelectFile={async () => { throw new Error('<unsupported>') }} onInsert={vi.fn()} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText(/sql dialect/i), { target: { value: 'sqlite' } })
  fireEvent.click(screen.getByRole('button', { name: /choose sql file/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('<unsupported>')
  expect(screen.queryByRole('button', { name: /append/i })).toBeNull()
})

it('aborts pending insertion when cancelled and prevents duplicate submissions', async () => {
  let signal!: AbortSignal
  let finish!: () => void
  const insert = vi.fn((_dbml: string, s: AbortSignal) => { signal = s; return new Promise<void>(resolve => { finish = resolve }) })
  const close = vi.fn()
  render(<SqlImportDialog onSelectFile={async () => ({ dbml: 'Table users {}', warnings: [] })} onInsert={insert} onClose={close} />)
  fireEvent.change(screen.getByLabelText(/sql dialect/i), { target: { value: 'postgresql' } })
  fireEvent.click(screen.getByRole('button', { name: /choose sql file/i }))
  const append = await screen.findByRole('button', { name: /append/i })
  fireEvent.click(append)
  fireEvent.click(append)
  expect(insert).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(signal.aborted).toBe(true)
  await act(async () => finish())
  expect(close).toHaveBeenCalledOnce()
})
