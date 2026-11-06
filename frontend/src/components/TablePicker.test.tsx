import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TablePicker } from './TablePicker'

describe('adaptive table picker', () => {
  it('keeps a growing picker inside the viewport without losing numeric-field focus or 40×40 insertion', () => {
    const insert = vi.fn(), close = vi.fn()
    const originalWidth = window.innerWidth
    let anchorLeft = 623.18, panelWidth = 258, resize = () => {}
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const left = this.classList.contains('table-picker') ? anchorLeft + Number.parseFloat(this.style.left || '0') : anchorLeft
      const width = this.classList.contains('table-picker') ? panelWidth : 32
      return { left, right: left + width, top: 100, bottom: 500, width, height: 400, x: left, y: 100, toJSON() {} }
    })
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect() {}
    })
    const { unmount } = render(<div><TablePicker onInsert={insert} onClose={close} /></div>)
    try {
      const picker = screen.getByRole('dialog'), columns = screen.getByLabelText('Columns'), rows = screen.getByLabelText('Rows')
      expect(picker.getBoundingClientRect().left).toBeGreaterThanOrEqual(8)
      expect(picker.getBoundingClientRect().right).toBeLessThanOrEqual(792)
      columns.focus(); panelWidth = 402
      fireEvent.change(columns, { target: { value: '40' } })
      fireEvent.change(rows, { target: { value: '40' } })
      act(() => resize())
      expect(columns).toHaveFocus()
      expect(screen.getByRole('grid')).toHaveAttribute('aria-colcount', '16')
      expect(picker.getBoundingClientRect().right).toBeLessThanOrEqual(792)
      anchorLeft = 950
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
      fireEvent(window, new Event('resize'))
      expect(picker.getBoundingClientRect().right).toBeLessThanOrEqual(1016)
      anchorLeft = 2
      fireEvent(window, new Event('resize'))
      expect(picker.getBoundingClientRect().left).toBeGreaterThanOrEqual(8)
      fireEvent.click(screen.getByRole('button', { name: 'Insert table' }))
      expect(insert).toHaveBeenCalledWith(40, 40)
    } finally {
      unmount(); rect.mockRestore(); vi.unstubAllGlobals()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })
  it('starts 5×5, grows and shrinks with pointer, and inserts exact keyboard dimensions', () => {
    const insert = vi.fn(), close = vi.fn()
    render(<TablePicker onInsert={insert} onClose={close} />)
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute('aria-rowcount', '5')
    fireEvent.pointerMove(screen.getByRole('gridcell', { name: '5 columns, 5 rows' }))
    expect(screen.getByText('5 × 5 · 25 cells')).toBeVisible()
    fireEvent.pointerMove(screen.getByRole('gridcell', { name: '2 columns, 2 rows' }))
    expect(grid).toHaveAttribute('aria-rowcount', '5')
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    fireEvent.keyDown(grid, { key: 'Enter' })
    expect(insert).toHaveBeenCalledWith(2, 3)
    fireEvent.keyDown(grid, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
  })
})
