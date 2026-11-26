import { afterEach, expect, it, vi } from 'vitest'
import { PlantUmlRenderer, PLANTUML_LIMITS } from './plantumlRenderer'

afterEach(() => vi.useRealTimers())
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  message?: { id: number; owner: string; source: string }
  terminated = false
  postMessage(message: { id: number; owner: string; source: string }) { this.message = message }
  terminate() { this.terminated = true }
  ready() { this.onmessage?.({ data: { ready: true } } as MessageEvent) }
  respond(data: Record<string, unknown>) { this.onmessage?.({ data: { ...this.message, ...data } } as MessageEvent) }
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Alice</text></svg>'

it('rejects oversized input before starting work', async () => {
  const create = vi.fn(() => new FakeWorker() as unknown as Worker)
  await expect(new PlantUmlRenderer(create).render('a'.repeat(PLANTUML_LIMITS.inputBytes + 1), 'doc:1')).rejects.toThrow('input limit')
  expect(create).not.toHaveBeenCalled()
})
it('terminates an over-deadline worker and permits the next request', async () => {
  vi.useFakeTimers()
  const workers: FakeWorker[] = []
  const renderer = new PlantUmlRenderer(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker })
  const first = renderer.render('one', 'doc:1')
  const failed = expect(first).rejects.toThrow('timed out')
  const next = renderer.render('two', 'doc:2')
  await vi.advanceTimersByTimeAsync(PLANTUML_LIMITS.deadlineMs)
  await failed
  expect(workers[0].terminated).toBe(true)
  workers[1].ready()
  workers[1].respond({ svg })
  expect(await next).toContain('Alice')
  expect(workers[1].terminated).toBe(true)
})
it('ignores a response for another owner and rejects unsafe or oversized output', async () => {
  const workers: FakeWorker[] = []
  const renderer = new PlantUmlRenderer(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker })
  const first = renderer.render('one', 'doc:1')
  workers[0].ready()
  workers[0].respond({ owner: 'doc:other', svg })
  expect(workers[0].terminated).toBe(false)
  workers[0].respond({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script/></svg>' })
  await expect(first).rejects.toThrow()
  const next = renderer.render('two', 'doc:2')
  workers[1].ready()
  workers[1].respond({ svg: 'x'.repeat(PLANTUML_LIMITS.outputBytes + 1) })
  await expect(next).rejects.toThrow('oversized')
})
it('bounds queued work and rejects cancelled jobs', async () => {
  const w = new FakeWorker()
  const renderer = new PlantUmlRenderer(() => w as unknown as Worker)
  const controllers = Array.from({ length: PLANTUML_LIMITS.queued + 1 }, () => new AbortController())
  const pending = controllers.map(c => renderer.render('source', 'doc', c.signal).catch(e => e))
  await expect(renderer.render('source', 'extra')).rejects.toThrow('queue is full')
  controllers.forEach(c => c.abort())
  const errors = await Promise.all(pending)
  expect(errors.every(e => e.name === 'AbortError')).toBe(true)
  expect(w.terminated).toBe(true)
})
