import { createRef } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { HelpDialog } from './HelpDialog'
import { useAppStore } from '../store/useAppStore'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }

it('navigates bundled topics and searches their content without changing the document', () => {
  useAppStore.getState().setCurrentDocument({ id: 'help-test', title: 'Help test', content: '# Keep this', isDirty: false, lastModified: new Date() })
  const original = useAppStore.getState().currentDocument
  render(<HelpDialog onClose={vi.fn()} />)

  expect(screen.getByRole('heading', { name: 'Getting started' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Code and diagrams' }))
  expect(screen.getByRole('heading', { name: 'Code and diagrams' })).toBeVisible()
  expect(screen.getByText(/```mermaid/)).toBeVisible()

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), { target: { value: 'ReCoVeRy CoPy' } })
  const topics = within(screen.getByRole('navigation', { name: 'Help topics' }))
  expect(topics.getByRole('button', { name: 'Files and recovery' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Files and recovery' })).toBeVisible()
  expect(topics.queryByRole('button', { name: 'Code and diagrams' })).toBeNull()
  expect(useAppStore.getState().currentDocument).toBe(original)
  expect(useAppStore.getState().currentDocument).toMatchObject({ content: '# Keep this', isDirty: false })
})

it('provides an empty search state and returns to all topics when cleared', () => {
  render(<HelpDialog onClose={vi.fn()} />)
  const search = screen.getByRole('searchbox', { name: 'Search help' })
  fireEvent.change(search, { target: { value: 'no-such-help-topic-987' } })
  expect(screen.getByText(/No help topics match/)).toBeVisible()
  fireEvent.change(search, { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'Getting started' })).toBeVisible()
})

it('finds reference content and describes the supported math boundary', () => {
  render(<HelpDialog onClose={vi.fn()} />)
  const search = screen.getByRole('searchbox', { name: 'Search help' })
  fireEvent.change(search, { target: { value: 'equation numbering' } })
  expect(screen.getByRole('heading', { name: 'Mathematics' })).toBeVisible()
  expect(screen.getByText(/```math/)).toHaveTextContent('\\frac{a}{b} = c')
  expect(screen.getByText(/Inline dollar delimiters, equation numbering and cross-references are not supported/)).toBeVisible()
  fireEvent.change(search, { target: { value: 'Ctrl+H' } })
  expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible()
  expect(screen.getByRole('cell', { name: 'Ctrl+H' })).toBeVisible()
})

it('contains keyboard focus, closes on Escape and restores the invoking control', () => {
  const close = vi.fn()
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const returnFocusRef = createRef<HTMLButtonElement>()
  Object.defineProperty(returnFocusRef, 'current', { value: trigger })
  const view = render(<HelpDialog onClose={close} returnFocusRef={returnFocusRef} />)
  const search = screen.getByRole('searchbox', { name: 'Search help' })
  const closeButton = screen.getByRole('button', { name: 'Close' })
  expect(search).toHaveFocus()
  fireEvent.keyDown(search, { key: 'Tab', shiftKey: true })
  expect(closeButton).toHaveFocus()
  fireEvent.keyDown(closeButton, { key: 'Tab' })
  expect(search).toHaveFocus()
  fireEvent.keyDown(search, { key: 'Escape', isComposing: true })
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(search, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
  expect(trigger).toHaveFocus()
  trigger.remove()
})

it('closes through the Close button and native cancel event', () => {
  const close = vi.fn()
  const view = render(<HelpDialog onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
  const cancel = vi.fn()
  render(<HelpDialog onClose={cancel} />)
  fireEvent(screen.getByRole('dialog', { name: 'MarkWriter Help' }), new Event('cancel', { cancelable: true }))
  expect(cancel).toHaveBeenCalledOnce()
})
