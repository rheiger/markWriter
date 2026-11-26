/// <reference lib="webworker" />
import { renderToString } from '@plantuml/core'
import { installPlantUmlWorkerDom } from './plantUmlWorkerDom'
import { PLANTUML_LIMITS, validatePlantUml } from './plantUmlSafety'

const scope = self as unknown as DedicatedWorkerGlobalScope
try {
  installPlantUmlWorkerDom()
  scope.onmessage = event => {
    if (import.meta.env.MODE === 'acceptance' && event.data?.__MW_PLANTUML_SECURITY_PROBE__) {
      const { network, local, sameOrigin } = event.data.__MW_PLANTUML_SECURITY_PROBE__ as { network: string; local: string; sameOrigin: string }
      Promise.allSettled([fetch(network, { mode: 'no-cors' }), fetch(local), fetch(sameOrigin)]).then(results => scope.postMessage({
        __MW_PLANTUML_SECURITY_PROBE__: results.map(result => result.status),
      }))
      return
    }
    const {id, owner, source} = event.data
    try {
      if (typeof source !== 'string' || typeof owner !== 'string' || !Number.isSafeInteger(id)) throw new Error('Invalid PlantUML request')
      validatePlantUml(source)
      // Acceptance-only synthetic request: prove that the host terminates a
      // busy worker at its deadline and subsequently handles another diagram.
      if (import.meta.env.MODE === 'acceptance' && source === '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: MWTimeoutProbe\n@enduml\n') {
        const end = Date.now() + 8000
        while (Date.now() < end) { /* deliberately block this test worker */ }
      }
      renderToString(source.split(/\r?\n/), svg => {
        if (typeof svg !== 'string' || svg.length > PLANTUML_LIMITS.outputBytes || new TextEncoder().encode(svg).length > PLANTUML_LIMITS.outputBytes) {
          scope.postMessage({id, owner, error:'PlantUML output limit exceeded'}); return
        }
        scope.postMessage({id, owner, svg})
      }, error => scope.postMessage({id, owner, error:String(error).slice(0, 512)}), {maxSvgSize:4096})
    } catch (error) { scope.postMessage({id, owner, error:String(error).slice(0, 512)}) }
  }
  scope.postMessage({ready:true})
} catch { scope.postMessage({startupError:'Cannot initialize the local PlantUML worker'}) }
