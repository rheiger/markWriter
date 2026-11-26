import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installPlantUmlXmlDom } from './plantumlXmlDom'
import { validatePlantUml, checkPlantUmlSvg } from './plantUmlSafety'
import { sanitizePlantUmlSvg } from './plantumlSvg'
import sequence from './fixtures/plantuml/sequence.svg?raw'
import klass from './fixtures/plantuml/class.svg?raw'
import privateSvg from './fixtures/plantuml/private.svg?raw'

const originals = {DOMParser:globalThis.DOMParser, XMLSerializer:globalThis.XMLSerializer, document:globalThis.document}
const seqSource = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
const classSource = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
beforeAll(() => installPlantUmlXmlDom())
afterAll(() => { for (const [key,value] of Object.entries(originals)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true}) })
describe('strict worker XML DOM', () => {
  it.each([[sequence,seqSource],[klass,classSource],[privateSvg,'@startuml\nclass User {\n -id: int\n}\n@enduml']])('validates and sanitizes actual engine output', (svg,source) => {
    checkPlantUmlSvg(svg,validatePlantUml(source)); expect(sanitizePlantUmlSvg(svg)).toContain('<svg')
  })
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" x="1" x="2"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><x:g/></svg>',
    '<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///tmp/x">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>',
    '<svg viewBox="0 0 10 10"><text>bad namespace</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text><![CDATA[hidden]]></text></svg>',
    '<?xml-stylesheet href="https://example.test/x"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://example.test/x"/></svg>',
  ])('fails closed on malformed or unsafe XML', svg => expect(() => sanitizePlantUmlSvg(svg)).toThrow())
  it('rejects metadata-preserving SVG with hidden entity', () => {
    expect(() => checkPlantUmlSvg(klass.replace('class="entity"','class="entity" opacity="0"'),validatePlantUml(classSource))).toThrow()
  })
})

it('matches native validation and sanitized geometry for valid and hostile synthetic outputs', () => {
  const cases: [string,string][] = [
    [sequence,seqSource], [klass,classSource],
    [klass.replace('class="entity"','class="entity" opacity="0"'),classSource],
    [klass.replace('stroke="#038048"','stroke="#F1F1F1"'),classSource],
    [sequence.replace('x="31.83" y="97"','x="999" y="97"'),seqSource],
    [sequence.replace('89.64,98 99.64,102 89.64,106 93.64,102','109.64,98 99.64,102 109.64,106 105.64,102'),seqSource],
    [sequence.replace('<defs></defs>','<defs><filter id="x"/></defs>'),seqSource],
    [sequence.replace('<defs></defs>','<script>alert(1)</script>'),seqSource],
    [sequence.replace('xmlns="http://www.w3.org/2000/svg"','xmlns="http://invalid"'),seqSource],
    [sequence.replace('width="128"','width="128" width="128"'),seqSource],
  ]
  const applyOriginals = () => { for (const [key,value] of Object.entries(originals)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true}) }
  const run = (svg: string, source: string) => {
    try {
      checkPlantUmlSvg(svg,validatePlantUml(source))
      const clean = sanitizePlantUmlSvg(svg)
      const doc = new originals.DOMParser().parseFromString(clean,'image/svg+xml')
      if (doc.querySelector('parsererror')) throw new Error('Native parser rejected output')
      return Array.from(doc.querySelectorAll('path,line,rect,polygon,circle,text')).map(element => ({
        tag:element.localName, text:element.textContent, attrs:Array.from(element.attributes).map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0])),
      }))
    } catch { return null }
  }
  for (const [svg,source] of cases) {
    applyOriginals(); const native = run(svg,source)
    installPlantUmlXmlDom(); const worker = run(svg,source)
    expect(worker).toEqual(native)
  }
})
