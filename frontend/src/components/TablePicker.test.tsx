import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TablePicker } from './TablePicker'

describe('adaptive table picker', () => {
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
