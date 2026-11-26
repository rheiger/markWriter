import { DOMImplementation, DOMParser as XmlParser, XMLSerializer as XmlSerializer, onWarningStopParsing } from '@xmldom/xmldom'

// This adapter is installed only inside the isolated validation Worker. Its
// selector vocabulary is deliberately closed over the existing validators.
const selectorNames = new Set(['*', 'g', 'text', 'rect', 'path', 'circle', 'line', 'polygon', 'parsererror', 'linearGradient', 'radialGradient'])
function select(root: Document | Element, selector: string): Element[] {
  const selectors = selector.split(',').map(part => part.trim())
  if (!selectors.length || selectors.some(s => !selectorNames.has(s) && s !== '[data-visibility-modifier]')) throw new Error('Unsupported validation selector')
  return Array.from(root.getElementsByTagName('*')).filter(node => selectors.some(s => s === '*' || s === '[data-visibility-modifier]' && node.hasAttribute('data-visibility-modifier') || node.localName === s))
}
function installSelectorMethods(): void {
  const probe = new XmlParser({onError:onWarningStopParsing}).parseFromString('<root><child/><child/></root>', 'application/xml')
  const docPrototype = Object.getPrototypeOf(probe), elementPrototype = Object.getPrototypeOf(probe.documentElement)
  for (const prototype of [docPrototype, elementPrototype]) {
    Object.defineProperty(prototype, 'querySelectorAll', {configurable:true, value:function(this: Document | Element, selector: string) { return select(this,selector) }})
    Object.defineProperty(prototype, 'querySelector', {configurable:true, value:function(this: Document | Element, selector: string) { return select(this,selector)[0] ?? null }})
  }
  Object.defineProperty(elementPrototype, 'nextElementSibling', {configurable:true, get:function(this: Element) {
    let next: Node | null = this.nextSibling
    while (next && next.nodeType !== 1) next = next.nextSibling
    return next
  }})
}
// XML 1.0 Char production. xmldom 0.9.12 can otherwise admit illegal
// literal controls and character references which native XML parsers reject.
function validXmlChar(value: number): boolean {
  return value === 0x9 || value === 0xa || value === 0xd || value >= 0x20 && value <= 0xd7ff || value >= 0xe000 && value <= 0xfffd || value >= 0x10000 && value <= 0x10ffff
}
function validateXmlCharacters(source: string): void {
  for (const character of source) {
    if (!validXmlChar(character.codePointAt(0)!)) throw new Error('Invalid XML character')
  }
  for (const match of source.matchAll(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g)) {
    const value = Number.parseInt(match[1] ?? match[2], match[1] ? 16 : 10)
    if (!validXmlChar(value)) throw new Error('Invalid XML character reference')
  }
}

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'
function validateNamespaceBindings(doc: Document): void {
  // Examine decoded attribute values: numeric references in namespace URIs
  // cannot bypass the reserved-binding and prefix-undeclaration rules.
  for (const element of Array.from(doc.getElementsByTagName('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name
      if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue
      const prefix = name === 'xmlns' ? '' : name.slice(6), uri = attribute.value
      if (prefix === 'xmlns' || uri === XMLNS_NAMESPACE || prefix === 'xml' && uri !== XML_NAMESPACE || prefix !== 'xml' && uri === XML_NAMESPACE || prefix !== '' && uri === '') throw new Error('Invalid XML namespace binding')
    }
  }
}

class StrictParser {
  parseFromString(source: string, type: string): Document {
    if (type !== 'image/svg+xml' || source.includes(']]>') || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(source) || (source.match(/<\?[\s\S]*?\?>/g) ?? []).some(pi => !/^<\?plantuml-src [\w-]*\?>$/.test(pi))) throw new Error('Unsupported XML declaration')
    validateXmlCharacters(source)
    // application/xml does not invent an SVG namespace for an unqualified root.
    const doc = new XmlParser({onError:onWarningStopParsing}).parseFromString(source, 'application/xml') as unknown as Document
    validateNamespaceBindings(doc)
    return doc
  }
}
export function installPlantUmlXmlDom(): void {
  installSelectorMethods()
  Object.defineProperty(globalThis,'DOMParser',{configurable:true,writable:true,value:StrictParser})
  Object.defineProperty(globalThis,'XMLSerializer',{configurable:true,writable:true,value:XmlSerializer})
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{implementation:new DOMImplementation()}})
}
