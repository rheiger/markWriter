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
  it.each([
    ['literal NUL', '\u0000'], ['literal control', '\u0001'], ['literal backspace', '\u0008'],
    ['literal vertical tab', '\u000b'], ['unpaired high surrogate', '\ud800'], ['unpaired low surrogate', '\udfff'],
    ['noncharacter FFFE', '\ufffe'], ['noncharacter FFFF', '\uffff'],
    ['numeric NUL', '&#0;'], ['numeric control', '&#1;'], ['hex control', '&#x1;'],
    ['numeric surrogate', '&#xD800;'], ['numeric FFFE', '&#xFFFE;'], ['above Unicode', '&#x110000;'],
  ])('matches native XML rejection for %s', (_name, invalid) => {
    const svg = sequence.replace('<title>Alice</title>', `<title>Alice${invalid}</title>`)
    expect(svg).not.toBe(sequence)
    expect(new originals.DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror')).not.toBeNull()
    expect(() => checkPlantUmlSvg(svg, validatePlantUml(seqSource))).toThrow()
  })
  it.each(['\t', '\n', '\r', '&#9;', '&#10;', '&#13;', '&#x20;', '&#xD7FF;', '&#xE000;', '&#xFFFD;', '&#x10000;', '&#x10FFFF;', '&amp;#0;', '😀'])(
    'accepts XML-valid literal or numeric reference %s', valid => {
      const xml = `<svg xmlns="http://www.w3.org/2000/svg"><text>${valid}</text></svg>`
      expect(new originals.DOMParser().parseFromString(xml,'image/svg+xml').querySelector('parsererror')).toBeNull()
      expect(() => new DOMParser().parseFromString(xml,'image/svg+xml')).not.toThrow()
    },
  )
  it.each([
    ['raw CDATA terminator', '<text x="1" y="1">a]]>b</text>'],
    ['invalid xml prefix binding', '<g xmlns:xml="http://invalid"/>'],
    ['xmlns URI bound to other prefix', '<g xmlns:x="http://www.w3.org/2000/xmlns/"/>'],
    ['prefixed namespace undeclaration', '<g xmlns:p=""/>'],
    ['encoded xmlns URI', '<g xmlns:x="http://www.w3.org/2000/xmln&#x73;/"/>'],
    ['xml URI bound to other prefix', '<g xmlns:p="http://www.w3.org/XML/1998/namespace"/>'],
    ['xml URI bound to default namespace', '<g xmlns="http://www.w3.org/XML/1998/namespace"/>'],
    ['reserved xmlns prefix declaration', '<g xmlns:xmlns="http://www.w3.org/2000/xmlns/"/>'],
  ])('rejects malformed XML namespace or text: %s', (_name, fragment) => {
    const svg = sequence.replace('</svg>', `${fragment}</svg>`)
    expect(svg).not.toBe(sequence)
    expect(new originals.DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror')).not.toBeNull()
    expect(() => checkPlantUmlSvg(svg,validatePlantUml(seqSource))).toThrow()
  })
  it.each([
    '<g xmlns:xml="http://www.w3.org/XML/1998/namespace"/>',
    '<g xmlns:p="urn:synthetic"/>',
    '<g xmlns=""/>',
    '<text>text ]]&gt; remains escaped</text>',
  ])('accepts XML-valid namespace or escaped text %s', fragment => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`
    expect(new originals.DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror')).toBeNull()
    expect(() => new DOMParser().parseFromString(svg,'image/svg+xml')).not.toThrow()
  })
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
