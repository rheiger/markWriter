import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createMathBudget, mathRenderer, type MathResult } from '../lib/mathRenderer'
import { MathRenderer } from './MathRenderer'

it('cancels stale renders, releases retained output and leaves errors as literal source', async () => {
  let resolveA!: (result: MathResult) => void, resolveB!: (result: MathResult) => void
  const releases = [vi.fn(), vi.fn()], signals: (AbortSignal | undefined)[] = []
  const spy = vi.spyOn(mathRenderer, 'render')
    .mockImplementationOnce((_chart, _owner, _budget, signal) => { signals.push(signal); return new Promise(resolve => { resolveA = resolve }) })
    .mockImplementationOnce((_chart, _owner, _budget, signal) => { signals.push(signal); return new Promise(resolve => { resolveB = resolve }) })
    .mockRejectedValueOnce(new Error('Invalid math'))
  try {
    const budget = createMathBudget()
    const view = render(<MathRenderer chart="a" owner="A:1" budget={budget} />)
    view.rerender(<MathRenderer chart="b" owner="B:2" budget={budget} />)
    expect(signals[0]?.aborted).toBe(true)
    await act(async () => resolveA({ html: '<span>stale</span>', release: releases[0] }))
    expect(view.container.textContent).not.toContain('stale'); expect(releases[0]).toHaveBeenCalledOnce()
    await act(async () => resolveB({ html: '<span>new</span>', release: releases[1] }))
    expect(view.container.textContent).toContain('new')
    view.rerender(<MathRenderer chart={'<script>alert(1)</script>'} owner="B:3" budget={budget} />)
    expect(releases[1]).toHaveBeenCalledOnce()
    await act(async () => {})
    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('pre')?.textContent).toBe('<script>alert(1)</script>')
    expect(view.container.querySelector('[role=status]')?.textContent).toContain('Invalid math')
  } finally { spy.mockRestore() }
})
