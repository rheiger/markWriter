import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DocumentTabs } from './DocumentTabs'
import { useAppStore } from '../store/useAppStore'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }))

beforeEach(() => {
  useAppStore.setState({ documents: [], currentDocument: null, pendingClose: null, pendingDiskReload: null })
  for (const title of ['First', 'Second', 'Third']) {
    useAppStore.getState().setCurrentDocument({ id: title, title, content: '', isDirty: false, lastModified: new Date() })
  }
})

it('opens the pointer menu for an inactive tab and keeps that tab', async () => {
  render(<DocumentTabs />)
  const first = screen.getByRole('tab', { name: 'First' })
  fireEvent.contextMenu(first, { clientX: 80, clientY: 45 })
  expect(first).toHaveAttribute('aria-selected', 'false')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Close Other Tabs' }))
  await waitFor(() => expect(screen.getAllByRole('tab')).toEqual([first]))
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(first).toHaveFocus()
})

it('opens with Shift+F10 and Context Menu, navigates, and restores focus on Escape', () => {
  render(<DocumentTabs />)
  const third = screen.getByRole('tab', { name: 'Third' })
  third.focus()
  fireEvent.keyDown(third, { key: 'F10', shiftKey: true })
  const close = screen.getByRole('menuitem', { name: 'Close Tab' })
  const others = screen.getByRole('menuitem', { name: 'Close Other Tabs' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'ArrowUp' })
  expect(others).toHaveFocus()
  fireEvent.keyDown(others, { key: 'Home' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(third).toHaveFocus()
  fireEvent.keyDown(third, { key: 'ContextMenu' })
  expect(close).not.toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Close Tab' })).toHaveFocus()
})

it('dismisses on an outside pointer and disables closing others for a lone tab', async () => {
  const keep = useAppStore.getState().currentDocument!
  useAppStore.setState({ documents: [keep] })
  render(<><DocumentTabs /><button>Outside</button></>)
  const tab = screen.getByRole('tab')
  fireEvent.contextMenu(tab)
  const others = screen.getByRole('menuitem', { name: 'Close Other Tabs' })
  expect(others).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(others)
  expect(screen.getByRole('menu')).toBeInTheDocument()
  const outside = screen.getByRole('button', { name: 'Outside' })
  fireEvent.pointerDown(outside)
  outside.focus()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(outside).toHaveFocus()
  fireEvent.contextMenu(tab)
  await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Close Tab' })))
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
})
