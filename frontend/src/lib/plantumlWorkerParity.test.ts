import { afterAll, beforeAll } from 'vitest'
import { installPlantUmlXmlDom } from './plantumlXmlDom'

const originals = {DOMParser:globalThis.DOMParser, XMLSerializer:globalThis.XMLSerializer, document:globalThis.document}
beforeAll(() => installPlantUmlXmlDom())
afterAll(() => { for (const [key,value] of Object.entries(originals)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true}) })
// Re-run the complete semantic mutation suite with the isolated Worker's DOM.
import './plantUmlSafety.test'
