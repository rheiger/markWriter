import DbmlWorker from './dbmlWorker?worker'
import { DBML_LIMITS } from './dbml'
import { dotRenderer } from './dotRenderer'

let pending = 0
const cancelled = () => new DOMException('DBML render cancelled', 'AbortError')
// Each parse has its own terminable worker; DOT supplies its own bounded queue,
// worker deadline, sanitizer and ownership checks. Callers own cancellation.
export const dbmlRenderer = {
  async render(source: string, owner: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw cancelled()
    if (source.length > DBML_LIMITS.inputBytes || new TextEncoder().encode(source).length > DBML_LIMITS.inputBytes) throw new Error('DBML exceeds 32 KiB input limit')
    if (pending >= DBML_LIMITS.concurrent) throw new Error('DBML render queue is full; retry after other diagrams finish')
    pending++
    let dot: string
    try {
      dot = await new Promise<string>((resolve, reject) => {
        let worker: Worker
        try { worker = new DbmlWorker() } catch { reject(new Error('Cannot start the local DBML worker')); return }
        let done = false
        const finish = (error?: Error, result?: string) => {
          if (done) return; done = true; clearTimeout(timer); worker.terminate(); signal?.removeEventListener('abort', abort)
          if (error) reject(error); else resolve(result!)
        }
        const abort = () => finish(cancelled())
        const timer = setTimeout(() => finish(new Error('DBML parsing timed out; simplify the schema')), DBML_LIMITS.parseMs)
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) { abort(); return }
        worker.onerror = () => finish(new Error('DBML worker failed; edit the source to retry'))
        worker.onmessage = event => {
          if (typeof event.data?.error === 'string') finish(new Error(event.data.error.slice(0, 512)))
          else if (typeof event.data?.dot === 'string') finish(undefined, event.data.dot)
          else finish(new Error('Invalid DBML worker response'))
        }
        worker.postMessage({ source })
      })
    } finally { pending-- }
    return dotRenderer.render(dot, owner, signal)
  },
}
