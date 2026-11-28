import PlantUmlWorker from './plantUmlWorker?worker'
import PlantUmlValidateWorker from './plantUmlValidateWorker?worker'
import { validatePlantUml } from './plantUmlSafety'

// A separate worker is mandatory: synchronous rendering in the application
// WebView would prevent a timer from interrupting an over-budget diagram.
export const PLANTUML_LIMITS = { inputBytes: 8192, outputBytes: 512 * 1024, queued: 8, deadlineMs: 5000 } as const
const size = (s: string) => new TextEncoder().encode(s).length
const cancelled = () => new DOMException('PlantUML rendering cancelled', 'AbortError')
type Job = { id: number; owner: string; source: string; deadline: number; timer?: ReturnType<typeof setTimeout>; signal?: AbortSignal; abort: () => void; resolve: (svg: string) => void; reject: (error: Error) => void }

export class PlantUmlRenderer {
  private queue: Job[] = []
  private active?: Job
  private worker?: Worker
  private serial = 0
  constructor(private createWorker: () => Worker = () => new PlantUmlWorker(), private createValidator: () => Worker = () => new PlantUmlValidateWorker()) {}

  render(source: string, owner: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (source.length > PLANTUML_LIMITS.inputBytes || size(source) > PLANTUML_LIMITS.inputBytes) { reject(new Error('PlantUML input limit exceeded')); return }
      if (!source.trim()) { reject(new Error('PlantUML source is empty')); return }
      try { validatePlantUml(source) } catch (error) { reject(error); return }
      if (signal?.aborted) { reject(cancelled()); return }
      if (this.queue.length >= PLANTUML_LIMITS.queued) { reject(new Error('PlantUML render queue is full')); return }
      const job: Job = { id: ++this.serial, source, owner, signal, deadline: performance.now() + PLANTUML_LIMITS.deadlineMs, resolve, reject, abort: () => {
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

  private validate(job: Job, renderingWorker: Worker, raw: string): void {
    // The renderer is disposed before starting the independent XML worker. The
    // original deadline includes queueing, rendering, validation and cleanup.
    renderingWorker.terminate()
    const worker = this.worker = this.createValidator()
    let ready = false
    worker.onerror = () => this.finish(job, new Error('PlantUML validation worker failed'))
    worker.onmessage = event => {
      if (this.active !== job || this.worker !== worker) return
      if (performance.now() >= job.deadline) { this.finish(job, new Error('PlantUML rendering timed out')); return }
      const data = event.data
      if (data?.startupError) { this.finish(job, new Error(String(data.startupError).slice(0, 200))); return }
      if (data?.ready && !ready) {
        ready = true
        try { worker.postMessage({id:job.id,owner:job.owner,source:job.source,svg:raw}) }
        catch { this.finish(job, new Error('Cannot send PlantUML to the validation worker')) }
        return
      }
      if (!ready || data?.id !== job.id || data?.owner !== job.owner) return
      if (data.error) { this.finish(job, new Error(String(data.error).slice(0,200))); return }
      if (typeof data.svg !== 'string' || data.svg.length > PLANTUML_LIMITS.outputBytes) { this.finish(job, new Error('Invalid or oversized PlantUML SVG')); return }
      this.finish(job, undefined, data.svg)
    }
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
          if (typeof data.svg !== 'string' || data.svg.length > PLANTUML_LIMITS.outputBytes) throw new Error('Invalid or oversized PlantUML SVG')
          this.validate(job, worker, data.svg)
        } catch (error) { this.finish(job, error instanceof Error ? error : new Error('PlantUML rendering failed')) }
      }
    } catch { this.finish(job, new Error('Cannot start the local PlantUML worker')) }
  }
}
export const plantumlRenderer = new PlantUmlRenderer()
