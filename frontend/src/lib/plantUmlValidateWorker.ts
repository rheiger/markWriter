/// <reference lib="webworker" />
import { installPlantUmlXmlDom } from './plantumlXmlDom'
import { checkPlantUmlSvg, validatePlantUml, PLANTUML_LIMITS } from './plantUmlSafety'
import { sanitizePlantUmlSvg } from './plantumlSvg'

const scope = self as unknown as DedicatedWorkerGlobalScope
try {
  installPlantUmlXmlDom()
  scope.onmessage = event => {
    const {id, owner, source, svg} = event.data
    try {
      if (!Number.isSafeInteger(id) || typeof owner !== 'string' || typeof source !== 'string' || typeof svg !== 'string' || svg.length > PLANTUML_LIMITS.outputBytes || new TextEncoder().encode(svg).length > PLANTUML_LIMITS.outputBytes) throw new Error('Invalid PlantUML validation request')
      checkPlantUmlSvg(svg, validatePlantUml(source))
      const clean = sanitizePlantUmlSvg(svg)
      if (clean.length > PLANTUML_LIMITS.outputBytes || new TextEncoder().encode(clean).length > PLANTUML_LIMITS.outputBytes) throw new Error('PlantUML output limit exceeded')
      scope.postMessage({id,owner,svg:clean})
    } catch (error) { scope.postMessage({id,owner,error:String(error).slice(0,200)}) }
  }
  scope.postMessage({ready:true})
} catch { scope.postMessage({startupError:'Cannot initialize the PlantUML validation worker'}) }
