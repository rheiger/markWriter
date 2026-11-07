/// <reference lib="webworker" />
import { dbmlToDot } from './dbml'
const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = event => {
  const { source } = event.data
  try { scope.postMessage({ dot: dbmlToDot(source) }) }
  catch (error) { scope.postMessage({ error: error instanceof Error ? error.message.slice(0, 512) : 'DBML parser failed' }) }
}
