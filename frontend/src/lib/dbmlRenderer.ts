import DbmlWorker from './dbmlWorker?worker'
import { DBML_LIMITS } from './dbml'
import { dotRenderer } from './dotRenderer'

const cancelled = () => new DOMException('DBML render cancelled', 'AbortError')
type Job = { source: string; signal?: AbortSignal; abort: () => void; resolve: (dot: string) => void; reject: (error: Error) => void }
const queue: Job[] = []
let active = 0

// Parsing is bounded independently of the downstream DOT layout queue. Waiting
// jobs are abortable; the deadline starts only once their worker is created.
function pump(): void {
  while (active < DBML_LIMITS.concurrent && queue.length) {
    const job = queue.shift()!
    job.signal?.removeEventListener('abort', job.abort)
    if (job.signal?.aborted) { job.reject(cancelled()); continue }
    active++
    let worker: Worker
    try { worker = new DbmlWorker() } catch {
      active--; job.reject(new Error('Cannot start the local DBML worker')); continue
    }
    let done = false
    const finish = (error?: Error, result?: string) => {
      if (done) return
      done = true; clearTimeout(timer); worker.terminate(); job.signal?.removeEventListener('abort', abort); active--
      if (error) job.reject(error); else job.resolve(result!)
      pump()
    }
    const abort = () => finish(cancelled())
    const timer = setTimeout(() => finish(new Error('DBML parsing timed out; simplify the schema')), DBML_LIMITS.parseMs)
    job.signal?.addEventListener('abort', abort, { once: true })
    if (job.signal?.aborted) { abort(); continue }
    worker.onerror = () => finish(new Error('DBML worker failed; edit the source to retry'))
    worker.onmessage = event => {
      if (typeof event.data?.error === 'string') finish(new Error(event.data.error.slice(0, 512)))
      else if (typeof event.data?.dot === 'string') finish(undefined, event.data.dot)
      else finish(new Error('Invalid DBML worker response'))
    }
    try { worker.postMessage({ source: job.source }) } catch { finish(new Error('Cannot send DBML to the local worker')) }
  }
}
export const dbmlRenderer = {
  async render(source: string, owner: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw cancelled()
    if (source.length > DBML_LIMITS.inputBytes || new TextEncoder().encode(source).length > DBML_LIMITS.inputBytes) throw new Error('DBML exceeds 32 KiB input limit')
    if (queue.length >= 32) throw new Error('DBML render queue is full; retry after other diagrams finish')
    const dot = await new Promise<string>((resolve, reject) => {
      const job: Job = { source, signal, resolve, reject, abort: () => {
        const index = queue.indexOf(job)
        if (index < 0) return
        queue.splice(index, 1); signal?.removeEventListener('abort', job.abort); reject(cancelled())
      } }
      signal?.addEventListener('abort', job.abort, { once: true })
      queue.push(job); pump()
    })
    return dotRenderer.render(dot, owner, signal)
  },
}
