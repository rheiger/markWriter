import PlantUmlWorker from './plantumlWorker?worker'
import { sanitizePlantUmlSvg } from './plantumlSvg'

// A separate worker is mandatory: synchronous rendering in the application
// WebView would prevent a timer from interrupting an over-budget diagram.
export const PLANTUML_LIMITS = { inputBytes: 8192, outputBytes: 512 * 1024, queued: 8, deadlineMs: 5000 } as const
const size = (s: string) => new TextEncoder().encode(s).length
const cancelled = () => new DOMException('PlantUML rendering cancelled', 'AbortError')
type Job = { id: number; owner: string; source: string; signal?: AbortSignal; abort: () => void; resolve: (svg: string) => void; reject: (error: Error) => void }

export class PlantUmlRenderer {
  private queue: Job[] = []
  private active?: Job
  private worker?: Worker
  private timer?: ReturnType<typeof setTimeout>
  private serial = 0
  constructor(private createWorker: () => Worker = () => new PlantUmlWorker()) {}

  render(source: string, owner: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!source.trim()) { reject(new Error('PlantUML source is empty')); return }
      if (source.length > PLANTUML_LIMITS.inputBytes || size(source) > PLANTUML_LIMITS.inputBytes) { reject(new Error('PlantUML input limit exceeded')); return }
      if (signal?.aborted) { reject(cancelled()); return }
      if (this.queue.length >= PLANTUML_LIMITS.queued) { reject(new Error('PlantUML render queue is full')); return }
      const job: Job = { id: ++this.serial, source, owner, signal, resolve, reject, abort: () => {
        if (this.active === job) this.finish(job, cancelled())
        else { this.queue = this.queue.filter(item => item !== job); signal?.removeEventListener('abort', job.abort); reject(cancelled()) }
      } }
      signal?.addEventListener('abort', job.abort, { once: true })
      this.queue.push(job); this.pump()
    })
  }

  private finish(job: Job, error?: Error, svg?: string): void {
    if (this.active !== job) return
    clearTimeout(this.timer); this.worker?.terminate(); this.worker = undefined
    job.signal?.removeEventListener('abort', job.abort); this.active = undefined
    if (error) job.reject(error); else job.resolve(svg!)
    this.pump()
  }

  private pump(): void {
    if (this.active || !this.queue.length) return
    const job = this.queue.shift()!; this.active = job
    try {
      const worker = this.worker = this.createWorker()
      this.timer = setTimeout(() => this.finish(job, new Error('PlantUML rendering timed out')), PLANTUML_LIMITS.deadlineMs)
      worker.onerror = () => this.finish(job, new Error('PlantUML worker failed'))
      worker.onmessage = event => {
        if (this.active !== job || this.worker !== worker) return
        const data = event.data
        if (data?.id !== job.id || data?.owner !== job.owner) return
        try {
          if (data.error) throw new Error(String(data.error).slice(0, 200))
          if (typeof data.svg !== 'string' || data.svg.length > PLANTUML_LIMITS.outputBytes || size(data.svg) > PLANTUML_LIMITS.outputBytes) throw new Error('Invalid or oversized PlantUML SVG')
          this.finish(job, undefined, sanitizePlantUmlSvg(data.svg))
        } catch (error) { this.finish(job, error instanceof Error ? error : new Error('PlantUML rendering failed')) }
      }
      worker.postMessage({ id: job.id, owner: job.owner, source: job.source })
    } catch { this.finish(job, new Error('Cannot start the local PlantUML worker')) }
  }
}
export const plantumlRenderer = new PlantUmlRenderer()
