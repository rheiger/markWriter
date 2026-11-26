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
class StrictParser {
  parseFromString(source: string, type: string): Document {
    if (type !== 'image/svg+xml' || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(source) || (source.match(/<\?[\s\S]*?\?>/g) ?? []).some(pi => !/^<\?plantuml-src [\w-]*\?>$/.test(pi))) throw new Error('Unsupported XML declaration')
    // application/xml does not invent an SVG namespace for an unqualified root.
    return new XmlParser({onError:onWarningStopParsing}).parseFromString(source, 'application/xml') as unknown as Document
  }
}
export function installPlantUmlXmlDom(): void {
  installSelectorMethods()
  Object.defineProperty(globalThis,'DOMParser',{configurable:true,writable:true,value:StrictParser})
  Object.defineProperty(globalThis,'XMLSerializer',{configurable:true,writable:true,value:XmlSerializer})
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{implementation:new DOMImplementation()}})
}
