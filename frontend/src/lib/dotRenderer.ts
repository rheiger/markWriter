import DotWorker from './dotWorker?worker'
import { DOT_LIMITS, validateDot, sanitizeDotSvg } from './dotSafety'

type Job = { id: number; owner: string; source: string; signal?: AbortSignal; abort: () => void; resolve: (svg: string) => void; reject: (error: Error) => void }
const aborted = () => new DOMException('DOT render cancelled', 'AbortError')

// One active worker, bounded waiting jobs; a worker is never reused across owners.
// Export uses its captured owner. View callers cancel on revision/deactivation/unmount.
export class DotRenderer {
  private queue: Job[] = []
  private active?: Job
  private worker?: Worker
  private timer?: ReturnType<typeof setTimeout>
  private serial = 0
  constructor(private createWorker: () => Worker = () => new DotWorker()) {}

  render(source: string, owner: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      try { validateDot(source) } catch (error) { reject(error); return }
      if (signal?.aborted) { reject(aborted()); return }
      if (this.queue.length >= DOT_LIMITS.queued) { reject(new Error('DOT render queue is full; retry after other diagrams finish')); return }
      const job: Job = { id: ++this.serial, source, owner, signal, resolve, reject, abort: () => {
        if (this.active === job) this.finish(job, aborted())
        else { this.queue = this.queue.filter(item => item !== job); signal?.removeEventListener('abort', job.abort); reject(aborted()) }
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
      let ready = false
      this.timer = setTimeout(() => this.finish(job, new Error('DOT worker startup timed out')), DOT_LIMITS.startupMs)
      worker.onerror = () => this.finish(job, new Error('DOT worker failed; edit the source to retry'))
      worker.onmessage = event => {
        if (this.active !== job || this.worker !== worker) return
        const data = event.data
        if (data?.startupError) { this.finish(job, new Error(data.startupError)); return }
        if (data?.ready && !ready) {
          ready = true; clearTimeout(this.timer)
          this.timer = setTimeout(() => this.finish(job, new Error('DOT layout timed out after 2 seconds; simplify the graph')), DOT_LIMITS.layoutMs)
          worker.postMessage({ id: job.id, owner: job.owner, source: job.source }); return
        }
        if (!ready || data?.id !== job.id || data?.owner !== job.owner) return
        try {
          if (data.error) throw new Error(String(data.error).slice(0, 512))
          if (typeof data.svg !== 'string') throw new Error('Invalid DOT worker response')
          this.finish(job, undefined, sanitizeDotSvg(data.svg))
        } catch (error) { this.finish(job, error instanceof Error ? error : new Error(String(error))) }
      }
    } catch { this.finish(job, new Error('Cannot start the local DOT worker')) }
  }
}
export const dotRenderer = new DotRenderer()
