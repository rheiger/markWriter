import { it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { DotRenderer } from './DotRenderer'
import { dotRenderer } from '../lib/dotRenderer'
it('cancels deactivated owners and never inserts a late result into a newer node', async () => {
  let resolveA!: (svg:string)=>void, resolveB!: (svg:string)=>void
  const signals: (AbortSignal|undefined)[]=[]
  const spy=vi.spyOn(dotRenderer,'render').mockImplementationOnce((_chart,_owner,signal)=>{signals.push(signal);return new Promise(resolve=>{resolveA=resolve})}).mockImplementationOnce((_chart,_owner,signal)=>{signals.push(signal);return new Promise(resolve=>{resolveB=resolve})})
  try {
    const result=render(<DotRenderer chart="digraph {a}" owner="A:1:1" />)
    result.rerender(<DotRenderer chart="digraph {b}" owner="B:2:2" />)
    expect(signals[0]?.aborted).toBe(true)
    await act(async()=>resolveA('<svg><text>stale A</text></svg>'))
    expect(result.container.textContent).not.toContain('stale A')
    result.rerender(<DotRenderer chart="digraph {b}" owner="B:2:2" active={false} />)
    expect(signals[1]?.aborted).toBe(true)
    await act(async()=>resolveB('<svg><text>inactive B</text></svg>'))
    expect(result.container.textContent).not.toContain('inactive B')
  } finally {spy.mockRestore()}
})
