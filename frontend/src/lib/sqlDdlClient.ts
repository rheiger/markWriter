import SqlWorker from './sqlDdlWorker?worker'
import type { SqlDialect, SqlImportResult } from './sqlDdl'
import { DBML_LIMITS } from './dbml'

function cancelled() { return new DOMException('SQL import cancelled', 'AbortError') }

export function convertSqlInWorker(source: string, dialect: SqlDialect, signal: AbortSignal): Promise<SqlImportResult> {
  if (signal.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, reject) => {
    const worker = new SqlWorker()
    let done = false
    const finish = (error: Error | null, result?: SqlImportResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.terminate()
      if (error) reject(error)
      else resolve(result!)
    }
    const abort = () => finish(cancelled())
    const timer = setTimeout(() => finish(new Error('SQL conversion timed out. Try a smaller schema.')), 2000)
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => finish(new Error('The local SQL converter could not run.'))
    worker.onmessageerror = () => finish(new Error('Could not read the SQL conversion result.'))
    worker.onmessage = ({ data }) => {
      if (typeof data?.error === 'string') {
        finish(new Error(data.error.slice(0, 512)))
        return
      }
      const result = data?.result
      if (typeof result?.dbml !== 'string' || result.dbml.length > DBML_LIMITS.inputBytes ||
          !Array.isArray(result.warnings) || result.warnings.length > 400 ||
          result.warnings.some((warning: unknown) => typeof warning !== 'string' || warning.length > 512)) {
        finish(new Error('Invalid SQL conversion result.'))
        return
      }
      finish(null, result)
    }
    try { worker.postMessage({ source, dialect }) }
    catch { finish(new Error('Could not send SQL to the local converter.')) }
  })
}
