import MathWorker from './mathWorker?worker'
import { MATH_LIMITS, mathBytes, validateMathOutput, validateMathSource } from './mathSafety'

type Reservation = { output: (bytes: number) => void; release: () => void }
export class MathBudget {
  private blocks = 0
  private input = 0
  private output = 0
  private readonly deadline = Date.now() + MATH_LIMITS.documentMs
  remainingMs() { return Math.max(0, this.deadline - Date.now()) }
  reserve(source: string): Reservation {
    const bytes = mathBytes(source)
    if (!this.remainingMs()) throw new Error('Math document rendering timed out')
    if (this.blocks >= MATH_LIMITS.documentBlocks || this.input + bytes > MATH_LIMITS.documentInputBytes) throw new Error('Math document limit exceeded')
    this.blocks++; this.input += bytes
    let output = 0, released = false
    return {
      output: size => {
        if (released || this.output + size > MATH_LIMITS.documentOutputBytes) throw new Error('Math document output limit exceeded')
        this.output += size; output += size
      },
      release: () => {
        if (released) return
        released = true; this.blocks--; this.input -= bytes; this.output -= output
      },
    }
  }
}
export const createMathBudget = () => new MathBudget()

// WYSIWYG nodes of the same document revision share one active budget.
const shared = new Map<string, { budget: MathBudget; references: number }>()
export function acquireMathBudget(owner: string): { budget: MathBudget; release: () => void } {
  let entry = shared.get(owner)
  if (!entry) { entry = { budget: createMathBudget(), references: 0 }; shared.set(owner, entry) }
  entry.references++
  let released = false
  return { budget: entry.budget, release: () => {
    if (released) return
    released = true
    if (--entry!.references === 0 && shared.get(owner) === entry) shared.delete(owner)
  } }
}

export type MathResult = { html: string; release: () => void }
type Job = { id: number; owner: string; source: string; budget: MathBudget; signal?: AbortSignal; reservation: Reservation; abort: () => void; resolve: (result: MathResult) => void; reject: (error: Error) => void }
const aborted = () => new DOMException('Math render cancelled', 'AbortError')

// One worker at a time. A fresh worker and macro environment are used for each
// block; cancelled or timed-out synchronous work is terminated immediately.
export class MathRenderer {
  private queue: Job[] = []
  private active?: Job
  private worker?: Worker
  private timer?: ReturnType<typeof setTimeout>
  private serial = 0
  constructor(private createWorker: () => Worker = () => new MathWorker()) {}

  render(source: string, owner: string, budget: MathBudget, signal?: AbortSignal): Promise<MathResult> {
    return new Promise((resolve, reject) => {
      let reservation: Reservation
      try {
        validateMathSource(source)
        if (signal?.aborted) throw aborted()
        if (this.queue.length >= MATH_LIMITS.queued) throw new Error('Math render queue is full')
        reservation = budget.reserve(source)
      } catch (error) { reject(error); return }
      const job: Job = { id: ++this.serial, owner, source, budget, signal, reservation, resolve, reject, abort: () => {
        if (this.active === job) this.finish(job, aborted())
        else {
          this.queue = this.queue.filter(item => item !== job)
          signal?.removeEventListener('abort', job.abort); reservation.release(); reject(aborted())
        }
      } }
      signal?.addEventListener('abort', job.abort, { once: true })
      this.queue.push(job); this.pump()
    })
  }

  private finish(job: Job, error?: Error, html?: string): void {
    if (this.active !== job) return
    clearTimeout(this.timer); this.worker?.terminate(); this.worker = undefined
    job.signal?.removeEventListener('abort', job.abort); this.active = undefined
    if (error) { job.reservation.release(); job.reject(error) }
    else job.resolve({ html: html!, release: job.reservation.release })
    this.pump()
  }

  private pump(): void {
    if (this.active || !this.queue.length) return
    // A shared AbortSignal may be aborted before the next listener is invoked.
    while (this.queue.length && (this.queue[0].signal?.aborted || !this.queue[0].budget.remainingMs())) {
      const cancelled = this.queue.shift()!
      cancelled.signal?.removeEventListener('abort', cancelled.abort)
      cancelled.reservation.release()
      cancelled.reject(cancelled.signal?.aborted ? aborted() : new Error('Math document rendering timed out'))
    }
    if (!this.queue.length) return
    const job = this.queue.shift()!; this.active = job
    try {
      const worker = this.worker = this.createWorker()
      let ready = false
      const setDeadline = (limit: number, message: string) => {
        const remaining = job.budget.remainingMs()
        this.timer = setTimeout(() => this.finish(job, new Error(remaining <= limit ? 'Math document rendering timed out' : message)), Math.min(remaining, limit))
      }
      setDeadline(MATH_LIMITS.startupMs, 'Math worker startup timed out')
      worker.onerror = () => this.finish(job, new Error('Math worker failed'))
      worker.onmessage = event => {
        if (this.active !== job || this.worker !== worker) return
        const data = event.data
        if (data?.ready && !ready) {
          ready = true; clearTimeout(this.timer)
          setDeadline(MATH_LIMITS.renderMs, 'Math rendering timed out; simplify the expression')
          worker.postMessage({ id: job.id, owner: job.owner, source: job.source }); return
        }
        if (!ready || data?.id !== job.id || data?.owner !== job.owner) return
        try {
          if (!job.budget.remainingMs()) throw new Error('Math document rendering timed out')
          if (data.error) throw new Error(String(data.error).slice(0, 200))
          if (typeof data.html !== 'string') throw new Error('Invalid math worker response')
          const html = validateMathOutput(data.html)
          job.reservation.output(mathBytes(html))
          this.finish(job, undefined, html)
        } catch (error) { this.finish(job, error instanceof Error ? error : new Error('Math rendering failed')) }
      }
    } catch { this.finish(job, new Error('Cannot start the local math worker')) }
  }
}
export const mathRenderer = new MathRenderer()
