import { describe, it, expect, vi, afterEach } from 'vitest'
import { DotRenderer } from './dotRenderer'
import { DOT_LIMITS } from './dotSafety'
class WorkerStub {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  send(data: unknown) { this.onmessage?.({ data }) }
}
const good = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="2">ok</text></svg>'
afterEach(() => vi.useRealTimers())
describe('bounded DOT jobs', () => {
  it('terminates active cancelled work, ignores late replies and starts next owner', async () => {
    const workers: WorkerStub[] = []
    const renderer = new DotRenderer(() => { const w = new WorkerStub(); workers.push(w); return w as unknown as Worker })
    const a = new AbortController(), b = new AbortController()
    const first = renderer.render('digraph {a}', 'A:1:1', a.signal).catch(e => e.name)
    const second = renderer.render('digraph {b}', 'B:2:2', b.signal)
    workers[0].send({ ready: true }); const jobA = workers[0].postMessage.mock.calls[0][0]
    a.abort(); expect(await first).toBe('AbortError'); expect(workers[0].terminate).toHaveBeenCalled()
    workers[0].send({ ...jobA, svg: good })
    workers[1].send({ ready: true }); const jobB = workers[1].postMessage.mock.calls[0][0]
    workers[1].send({ ...jobB, svg: good }); expect(await second).toContain('ok')
    expect(workers[1].terminate).toHaveBeenCalled()
  })
  it('times out layout, frees worker, and permits recovery', async () => {
    vi.useFakeTimers(); const workers: WorkerStub[] = []
    const renderer = new DotRenderer(() => { const w = new WorkerStub(); workers.push(w); return w as unknown as Worker })
    const failed = renderer.render('digraph {a}', 'A:1:1').catch(e => e.message)
    workers[0].send({ ready: true }); await vi.advanceTimersByTimeAsync(DOT_LIMITS.layoutMs)
    expect(await failed).toMatch(/timed out/); expect(workers[0].terminate).toHaveBeenCalled()
    const next = renderer.render('digraph {b}', 'A:2:2'); workers[1].send({ ready: true }); workers[1].send({ ...workers[1].postMessage.mock.calls[0][0], svg: good })
    expect(await next).toContain('ok')
  })
  it('bounds queue and rejects unsupported input before creating a worker', async () => {
    const factory = vi.fn(() => new WorkerStub() as unknown as Worker), renderer = new DotRenderer(factory)
    await expect(renderer.render('digraph {a [image="x"]}', 'A')).rejects.toThrow(/attribute/)
    expect(factory).not.toHaveBeenCalled()
    const controller = new AbortController()
    const jobs = Array.from({ length: DOT_LIMITS.queued + 1 }, (_, i) => renderer.render('digraph {a}', String(i), controller.signal).catch(e => e.message))
    await expect(renderer.render('digraph {a}', 'overflow')).rejects.toThrow(/queue/)
    controller.abort(); await Promise.all(jobs)
  })
})
