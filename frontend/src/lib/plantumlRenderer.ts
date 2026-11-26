import PlantUmlWorker from './plantUmlWorker?worker'
import { sanitizePlantUmlSvg } from './plantumlSvg'
import { checkPlantUmlSvg, validatePlantUml, type PlantUmlInput } from './plantUmlSafety'

// A separate worker is mandatory: synchronous rendering in the application
// WebView would prevent a timer from interrupting an over-budget diagram.
export const PLANTUML_LIMITS = { inputBytes: 8192, outputBytes: 512 * 1024, queued: 8, deadlineMs: 5000 } as const
const size = (s: string) => new TextEncoder().encode(s).length
const cancelled = () => new DOMException('PlantUML rendering cancelled', 'AbortError')
type Job = { id: number; owner: string; source: string; input: PlantUmlInput; deadline: number; timer?: ReturnType<typeof setTimeout>; signal?: AbortSignal; abort: () => void; resolve: (svg: string) => void; reject: (error: Error) => void }

export class PlantUmlRenderer {
  private queue: Job[] = []
  private active?: Job
  private worker?: Worker
  private serial = 0
  constructor(private createWorker: () => Worker = () => new PlantUmlWorker()) {}

  render(source: string, owner: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!source.trim()) { reject(new Error('PlantUML source is empty')); return }
      if (source.length > PLANTUML_LIMITS.inputBytes || size(source) > PLANTUML_LIMITS.inputBytes) { reject(new Error('PlantUML input limit exceeded')); return }
      let input: PlantUmlInput
      try { input = validatePlantUml(source) } catch (error) { reject(error); return }
      if (signal?.aborted) { reject(cancelled()); return }
      if (this.queue.length >= PLANTUML_LIMITS.queued) { reject(new Error('PlantUML render queue is full')); return }
      const job: Job = { id: ++this.serial, source, input, owner, signal, deadline: performance.now() + PLANTUML_LIMITS.deadlineMs, resolve, reject, abort: () => {
        if (this.active === job) this.finish(job, cancelled())
        else { clearTimeout(job.timer); this.queue = this.queue.filter(item => item !== job); signal?.removeEventListener('abort', job.abort); reject(cancelled()) }
      } }
      signal?.addEventListener('abort', job.abort, { once: true })
      job.timer = setTimeout(() => this.timeout(job), PLANTUML_LIMITS.deadlineMs)
      this.queue.push(job); this.pump()
    })
  }

  private finish(job: Job, error?: Error, svg?: string): void {
    if (this.active !== job) return
    clearTimeout(job.timer); this.worker?.terminate(); this.worker = undefined
    job.signal?.removeEventListener('abort', job.abort); this.active = undefined
    if (error) job.reject(error); else job.resolve(svg!)
    this.pump()
  }

  private timeout(job: Job): void {
    const error = new Error('PlantUML rendering timed out')
    if (this.active === job) { this.finish(job, error); return }
    const index = this.queue.indexOf(job)
    if (index < 0) return
    this.queue.splice(index, 1); job.signal?.removeEventListener('abort', job.abort); job.reject(error)
  }

  private pump(): void {
    if (this.active || !this.queue.length) return
    const job = this.queue.shift()!; this.active = job
    if (performance.now() >= job.deadline) { this.finish(job, new Error('PlantUML rendering timed out')); return }
    try {
      const worker = this.worker = this.createWorker()
      let ready = false
      worker.onerror = () => this.finish(job, new Error('PlantUML worker failed'))
      worker.onmessage = event => {
        if (this.active !== job || this.worker !== worker) return
        if (performance.now() >= job.deadline) { this.finish(job, new Error('PlantUML rendering timed out')); return }
        const data = event.data
        if (data?.startupError) { this.finish(job, new Error(String(data.startupError).slice(0, 200))); return }
        if (data?.ready && !ready) {
          ready = true
          try { worker.postMessage({ id: job.id, owner: job.owner, source: job.source }) }
          catch { this.finish(job, new Error('Cannot send PlantUML to the local worker')) }
          return
        }
        if (!ready) return
        if (data?.id !== job.id || data?.owner !== job.owner) return
        try {
          if (data.error) throw new Error(String(data.error).slice(0, 200))
          if (typeof data.svg !== 'string' || data.svg.length > PLANTUML_LIMITS.outputBytes || size(data.svg) > PLANTUML_LIMITS.outputBytes) throw new Error('Invalid or oversized PlantUML SVG')
          checkPlantUmlSvg(data.svg, job.input)
          const svg = sanitizePlantUmlSvg(data.svg)
          // Parsing/sanitizing run synchronously on the document thread, so a
          // timer cannot fire until they return. Reject rather than accepting a
          // result that finished validation after the captured deadline.
          if (performance.now() >= job.deadline) throw new Error('PlantUML rendering timed out')
          this.finish(job, undefined, svg)
        } catch (error) { this.finish(job, error instanceof Error ? error : new Error('PlantUML rendering failed')) }
      }
    } catch { this.finish(job, new Error('Cannot start the local PlantUML worker')) }
  }
}
export const plantumlRenderer = new PlantUmlRenderer()
