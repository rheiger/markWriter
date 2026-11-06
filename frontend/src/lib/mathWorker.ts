/// <reference lib="webworker" />
import { renderMathSource } from './mathEngine'

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = event => {
  const { id, owner, source } = event.data
  try { scope.postMessage({ id, owner, html: renderMathSource(source) }) }
  catch (error) { scope.postMessage({ id, owner, error: error instanceof Error ? error.message.slice(0, 200) : 'Math rendering failed' }) }
}
scope.postMessage({ ready: true })
