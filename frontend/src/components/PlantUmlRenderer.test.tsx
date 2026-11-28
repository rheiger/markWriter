import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { plantumlRenderer } from '../lib/plantumlRenderer'
import { PlantUmlRenderer } from './PlantUmlRenderer'

it('cancels stale owners and shows failed input as literal source', async () => {
  let resolveOld!: (svg: string) => void
  const signals: (AbortSignal | undefined)[] = []
  const spy = vi.spyOn(plantumlRenderer, 'render')
    .mockImplementationOnce((_chart, _owner, signal) => { signals.push(signal); return new Promise(resolve => { resolveOld = resolve }) })
    .mockRejectedValueOnce(new Error('Unsupported syntax'))
  try {
    const view = render(<PlantUmlRenderer chart="old" owner="A:1" />)
    expect(view.container.querySelector('pre')?.textContent).toBe('old')
    view.rerender(<PlantUmlRenderer chart="<script>source</script>" owner="B:2" />)
    expect(signals[0]?.aborted).toBe(true)
    await act(async () => resolveOld('<svg><text>stale</text></svg>'))
    expect(view.container.textContent).not.toContain('stale')
    expect(view.container.querySelector('script')).toBeNull()
    expect(view.container.querySelector('pre')?.textContent).toBe('<script>source</script>')
    expect(view.container.querySelector('[role=status]')?.textContent).toContain('Unsupported syntax')
  } finally { spy.mockRestore() }
})
