/// <reference lib="webworker" />
import { instance } from '@viz-js/viz'
import { DOT_LIMITS, validateDot } from './dotSafety'

const scope = self as unknown as DedicatedWorkerGlobalScope
// The WASM bytes are embedded in the locally bundled runtime. No fetch/importScripts.
instance().then(viz => {
  scope.onmessage = event => {
    const { id, owner, source } = event.data
    try {
      validateDot(source)
      const result = viz.render(source, { format: 'svg', engine: 'dot' })
      if (result.status !== 'success') throw new Error(result.errors.map(error => error.message).join('; ').slice(0, 512))
      const svg = result.output
      if (svg.length > DOT_LIMITS.outputBytes || new TextEncoder().encode(svg).length > DOT_LIMITS.outputBytes) throw new Error('DOT exceeds 2 MiB SVG limit')
      scope.postMessage({ id, owner, svg })
    } catch (error) { scope.postMessage({ id, owner, error: String(error).slice(0, 512) }) }
  }
  scope.postMessage({ ready: true, graphvizVersion: viz.graphvizVersion })
}).catch(() => scope.postMessage({ startupError: 'Cannot initialize the bundled DOT runtime' }))
