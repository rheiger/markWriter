import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMathBudget, MathRenderer } from './mathRenderer'
import { MATH_LIMITS } from './mathSafety'

class WorkerStub {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  send(data: unknown) { this.onmessage?.({ data }) }
}
const good = '<span class="katex-display"><span class="katex">ok</span></span>'
afterEach(() => vi.useRealTimers())

describe('bounded math jobs', () => {
  it('cancels active work and ignores stale replies across owners', async () => {
    const workers: WorkerStub[] = []
    const renderer = new MathRenderer(() => { const w = new WorkerStub(); workers.push(w); return w as unknown as Worker })
    const a = new AbortController(), budget = createMathBudget()
    const first = renderer.render('a', 'A:1', budget, a.signal).catch(e => e.name)
    const second = renderer.render('b', 'B:2', budget)
    workers[0].send({ ready: true }); const jobA = workers[0].postMessage.mock.calls[0][0]
    a.abort(); expect(await first).toBe('AbortError'); expect(workers[0].terminate).toHaveBeenCalledOnce()
    workers[0].send({ ...jobA, html: good })
    workers[1].send({ ready: true }); const jobB = workers[1].postMessage.mock.calls[0][0]
    workers[1].send({ ...jobB, html: good }); const result = await second
    expect(result.html).toBe(good); result.release(); result.release()
    expect(workers[1].terminate).toHaveBeenCalledOnce()
  })
  it('terminates a timed-out worker and permits recovery', async () => {
    vi.useFakeTimers(); const workers: WorkerStub[] = []
    const renderer = new MathRenderer(() => { const w = new WorkerStub(); workers.push(w); return w as unknown as Worker })
    const budget = createMathBudget()
    const failed = renderer.render('a', 'A:1', budget).catch(e => e.message)
    workers[0].send({ ready: true }); await vi.advanceTimersByTimeAsync(MATH_LIMITS.renderMs)
    expect(await failed).toMatch(/timed out/); expect(workers[0].terminate).toHaveBeenCalledOnce()
    const next = renderer.render('b', 'A:2', budget)
    workers[1].send({ ready: true }); workers[1].send({ ...workers[1].postMessage.mock.calls[0][0], html: good })
    const result = await next; expect(result.html).toBe(good); result.release()
  })
  it('enforces per-document input, block and retained-output budgets and releases them idempotently', () => {
    const budget = createMathBudget()
    const claims = Array.from({ length: MATH_LIMITS.documentBlocks }, () => budget.reserve('x'))
    expect(() => budget.reserve('x')).toThrow(/document limit/)
    claims[0].release(); claims[0].release(); expect(() => budget.reserve('x')).not.toThrow()
    const largeBudget = createMathBudget()
    const chunk = 'x'.repeat(MATH_LIMITS.inputBytes)
    const largeClaims = Array.from({ length: MATH_LIMITS.documentInputBytes / MATH_LIMITS.inputBytes }, () => largeBudget.reserve(chunk))
    expect(() => largeBudget.reserve('x')).toThrow(/document limit/)
    largeClaims[0].output(MATH_LIMITS.documentOutputBytes)
    expect(() => largeClaims[1].output(1)).toThrow(/output limit/)
    largeClaims[0].release(); expect(() => largeClaims[1].output(1)).not.toThrow()
  })
  it('bounds waiting jobs and rejects oversized input before starting a worker', async () => {
    const factory = vi.fn(() => new WorkerStub() as unknown as Worker), renderer = new MathRenderer(factory)
    await expect(renderer.render('x'.repeat(MATH_LIMITS.inputBytes + 1), 'A', createMathBudget())).rejects.toThrow(/16 KiB/)
    expect(factory).not.toHaveBeenCalled()
    const controller = new AbortController()
    const jobs = Array.from({ length: MATH_LIMITS.queued + 1 }, (_, i) => renderer.render('x', String(i), createMathBudget(), controller.signal).catch(e => e.message))
    await expect(renderer.render('x', 'overflow', createMathBudget())).rejects.toThrow(/queue/)
    controller.abort(); await Promise.all(jobs)
    expect(factory).toHaveBeenCalledTimes(1)
  })
  it.each([34, 64])('accepts all %i document blocks without queue overflow', async count => {
    const workers: WorkerStub[] = []
    const renderer = new MathRenderer(() => { const w = new WorkerStub(); workers.push(w); return w as unknown as Worker })
    const budget = createMathBudget()
    const pending = Array.from({ length: count }, (_, i) => renderer.render(`x_${i}`, 'A:1', budget))
    for (let i = 0; i < count; i++) {
      workers[i].send({ ready: true })
      workers[i].send({ ...workers[i].postMessage.mock.calls[0][0], html: good })
    }
    const results = await Promise.all(pending)
    expect(results).toHaveLength(count)
    for (const result of results) result.release()
  })
  it('rejects the 65th retained document block before starting its worker', async () => {
    const factory = vi.fn(() => new WorkerStub() as unknown as Worker), renderer = new MathRenderer(factory)
    const budget = createMathBudget(), controller = new AbortController()
    const pending = Array.from({ length: 64 }, () => renderer.render('x', 'A:1', budget, controller.signal).catch(e => e.name))
    await expect(renderer.render('x', 'A:1', budget)).rejects.toThrow(/document limit/)
    controller.abort(); await Promise.all(pending); expect(factory).toHaveBeenCalledOnce()
  })
  it('stops cumulative document work at its deadline even when individual jobs are under their timeouts', async () => {
    vi.useFakeTimers(); const workers: WorkerStub[] = []
    const renderer = new MathRenderer(() => { const w = new WorkerStub(); workers.push(w); return w as unknown as Worker })
    const budget = createMathBudget()
    const pending = Array.from({ length: 12 }, (_, i) => renderer.render(`x_${i}`, 'A:1', budget).catch(e => e.message))
    for (let i = 0; i < 10; i++) {
      workers[i].send({ ready: true })
      await vi.advanceTimersByTimeAsync(1400)
      workers[i].send({ ...workers[i].postMessage.mock.calls[0][0], html: good })
    }
    workers[10].send({ ready: true }); await vi.advanceTimersByTimeAsync(1000)
    const results = await Promise.all(pending)
    expect(results[10]).toMatch(/document rendering timed out/)
    expect(results[11]).toMatch(/document rendering timed out/)
    expect(workers).toHaveLength(11)
    expect(workers[10].terminate).toHaveBeenCalledOnce()
    for (const result of results) if (typeof result !== 'string') result.release()
  })
})
