import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ workers: [] as Array<{ onmessage?: (event: {data: unknown}) => void; onerror?: () => void; terminate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }>, render: vi.fn() }))
vi.mock('./dbmlWorker?worker', () => ({ default: class {
  onmessage?: (event: {data: unknown}) => void
  onerror?: () => void
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { mocks.workers.push(this) }
} }))
vi.mock('./dotRenderer', () => ({ dotRenderer: { render: mocks.render } }))
import { dbmlRenderer } from './dbmlRenderer'
afterEach(() => { vi.useRealTimers(); mocks.workers.length = 0; mocks.render.mockReset() })
describe('DBML worker ownership', () => {
  it('terminates an aborted parse without starting layout', async () => {
    const abort = new AbortController()
    const result = dbmlRenderer.render('Table a {}', 'doc:1', abort.signal)
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort(); await rejected
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce()
    expect(mocks.render).not.toHaveBeenCalled()
  })
  it('terminates an over-budget parse', async () => {
    vi.useFakeTimers()
    const result = dbmlRenderer.render('Table a {}', 'doc:1')
    const rejected = expect(result).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(1000); await rejected
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce()
    expect(mocks.render).not.toHaveBeenCalled()
  })
  it('passes captured owner and signal to the isolated DOT layout', async () => {
    mocks.render.mockResolvedValue('<svg/>')
    const abort = new AbortController()
    const result = dbmlRenderer.render('Table a {}', 'doc:2', abort.signal)
    mocks.workers[0].onmessage?.({ data: { dot: 'digraph {}' } })
    await expect(result).resolves.toBe('<svg/>')
    expect(mocks.render).toHaveBeenCalledWith('digraph {}', 'doc:2', abort.signal)
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce()
  })
})

it('queues excess renders, preserves each owner and removes cancelled waiters', async () => {
  mocks.render.mockImplementation(async (_dot: string, owner: string) => owner)
  const controllers = Array.from({ length: 7 }, () => new AbortController())
  const jobs = controllers.map((c, i) => dbmlRenderer.render('Table a {}', `doc:${i}`, c.signal))
  const rejected = expect(jobs[4]).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.workers).toHaveLength(4)
  controllers[4].abort(); await rejected
  mocks.workers[0].onmessage?.({ data: { dot: 'digraph {}' } })
  expect(mocks.workers).toHaveLength(5)
  mocks.workers[1].onmessage?.({ data: { dot: 'digraph {}' } })
  expect(mocks.workers).toHaveLength(6)
  for (const worker of mocks.workers.slice(2)) worker.onmessage?.({ data: { dot: 'digraph {}' } })
  await expect(Promise.all(jobs.filter((_, i) => i !== 4))).resolves.toEqual(['doc:0', 'doc:1', 'doc:2', 'doc:3', 'doc:5', 'doc:6'])
  expect(mocks.render).toHaveBeenCalledTimes(6)
})
