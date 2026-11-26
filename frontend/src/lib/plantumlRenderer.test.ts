import { afterEach, expect, it, vi } from 'vitest'
import { PlantUmlRenderer, PLANTUML_LIMITS } from './plantumlRenderer'
import sequenceSvg from './fixtures/plantuml/sequence.svg?raw'
import classSvg from './fixtures/plantuml/class.svg?raw'

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
const source = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
const classSource = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
const svg = sequenceSvg

it('rejects oversized input before starting work', async () => {
  const create = vi.fn(() => new FakeWorker() as unknown as Worker)
  await expect(new PlantUmlRenderer(create).render('a'.repeat(PLANTUML_LIMITS.inputBytes + 1), 'doc:1')).rejects.toThrow('input limit')
  expect(create).not.toHaveBeenCalled()
})
it.each([
  '@startuml\n!include /tmp/private.puml\n@enduml',
  '@startuml\n!include http://127.0.0.1:5000/private.puml\n@enduml',
  '@startuml\n!theme missing\n@enduml',
  '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: <img:http://127.0.0.1/x>\n@enduml',
  '@startuml\nclass {\n@enduml',
])('rejects unsupported or resource-bearing input before creating a worker', async input => {
  const create = vi.fn(() => new FakeWorker() as unknown as Worker)
  await expect(new PlantUmlRenderer(create).render(input, 'doc:1')).rejects.toThrow()
  expect(create).not.toHaveBeenCalled()
})
it('terminates over-deadline active and queued jobs and permits the next request', async () => {
  vi.useFakeTimers()
  const workers: FakeWorker[] = []
  const renderer = new PlantUmlRenderer(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker })
  const first = renderer.render(source, 'doc:1')
  const failed = expect(first).rejects.toThrow('timed out')
  const waiting = renderer.render(source, 'doc:2')
  const queuedFailure = expect(waiting).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(PLANTUML_LIMITS.deadlineMs)
  await failed
  await queuedFailure
  expect(workers[0].terminated).toBe(true)
  const next = renderer.render(source, 'doc:3')
  workers[1].ready()
  workers[1].respond({ svg })
  expect(await next).toContain('Alice')
  expect(workers[1].terminated).toBe(true)
})
it('ignores a response for another owner and rejects unsafe or oversized output', async () => {
  const workers: FakeWorker[] = []
  const renderer = new PlantUmlRenderer(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker })
  const first = renderer.render(source, 'doc:1')
  workers[0].ready()
  workers[0].respond({ owner: 'doc:other', svg })
  expect(workers[0].terminated).toBe(false)
  workers[0].respond({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script/></svg>' })
  await expect(first).rejects.toThrow()
  const next = renderer.render(source, 'doc:2')
  workers[1].ready()
  workers[1].respond({ svg: 'x'.repeat(PLANTUML_LIMITS.outputBytes + 1) })
  await expect(next).rejects.toThrow('oversized')
})
it('bounds queued work and rejects cancelled jobs', async () => {
  const w = new FakeWorker()
  const renderer = new PlantUmlRenderer(() => w as unknown as Worker)
  const controllers = Array.from({ length: PLANTUML_LIMITS.queued + 1 }, () => new AbortController())
  const pending = controllers.map(c => renderer.render(source, 'doc', c.signal).catch(e => e))
  await expect(renderer.render(source, 'extra')).rejects.toThrow('queue is full')
  controllers.forEach(c => c.abort())
  const errors = await Promise.all(pending)
  expect(errors.every(e => e.name === 'AbortError')).toBe(true)
  expect(w.terminated).toBe(true)
})

it('rejects error SVGs in success callbacks and output inconsistent with the captured source', async () => {
  const workers: FakeWorker[] = []
  const renderer = new PlantUmlRenderer(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker })
  const first = renderer.render(source, 'doc:1'); workers[0].ready()
  workers[0].respond({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>Syntax Error</text></svg>' })
  await expect(first).rejects.toThrow()
  const second = renderer.render(source, 'doc:2'); workers[1].ready()
  workers[1].respond({ svg: sequenceSvg.replaceAll('data-entity-1="part1" data-entity-2="part2"', 'data-entity-1="part2" data-entity-2="part1"') })
  await expect(second).rejects.toThrow()
})

it.each([
  ['hidden class', classSource, classSvg.replace('class="entity"', 'class="entity" opacity="0"')],
  ['hidden multiplicity', classSource, classSvg.replace(/<text ([^>]*)>1<\/text>/, '<text $1 opacity="0">1</text>')],
  ['displaced label', source, sequenceSvg.replace('x="31.83" y="97"', 'x="999" y="97"')],
  ['collapsed arrowhead', source, sequenceSvg.replace(/points="[^"]+"/, 'points="99.64,102"')],
])('rejects a %s through the complete worker-to-SVG pipeline', async (_name, capturedSource, output) => {
  const worker = new FakeWorker()
  const renderer = new PlantUmlRenderer(() => worker as unknown as Worker)
  const result = renderer.render(capturedSource, 'captured:1'); worker.ready(); worker.respond({ svg: output })
  await expect(result).rejects.toThrow()
})
