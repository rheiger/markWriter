// Minimal DOM for the pinned PlantUML JS engine in a dedicated Worker. No
// document, network loader, script element or arbitrary HTML is exposed.
// Text metrics use OffscreenCanvas, so visual parity must be qualified per host.
const NS = 'http://www.w3.org/2000/svg'
const elements = new Set('svg defs g a rect line path text circle ellipse polygon polyline title desc'.split(' '))
const MAX_NODES = 50000, MAX_UNITS = 2 * 1024 * 1024
let nodeCount = 0, units = 0
function charge(value: string): string {
  units += value.length
  if (units > MAX_UNITS) throw new Error('PlantUML DOM output limit exceeded')
  return value
}
class SvgElement {
  readonly attributes: Record<string, string> = Object.create(null)
  readonly children: (SvgElement | Instruction)[] = []
  readonly style: Record<string, string> = Object.create(null)
  readonly ownerDocument = workerDocument
  private content = ''
  constructor(readonly name: string) {
    if (++nodeCount > MAX_NODES) throw new Error('PlantUML SVG node limit exceeded')
  }
  set textContent(value: string) { this.content = charge(String(value)) }
  get textContent(): string { return this.content }
  setAttribute(name: string, value: string): void { this.attributes[name] = charge(String(value)) }
  setAttributeNS(_namespace: string, name: string, value: string): void { this.setAttribute(name, value) }
  appendChild<T extends SvgElement | Instruction>(child: T): T { this.children.push(child); return child }
  removeChild(child: SvgElement | Instruction): void { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1) }
  getBBox(): { width: number; height: number; x: number; y: number } {
    const canvas = new OffscreenCanvas(1, 1), context = canvas.getContext('2d')
    if (!context) throw new Error('PlantUML requires OffscreenCanvas text metrics')
    const size = Number(this.attributes['font-size']) || 12
    context.font = `${size}px ${this.attributes['font-family'] || 'sans-serif'}`
    const metrics = context.measureText(this.textContent)
    return {width:metrics.width, height:(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) || size, x:0, y:-(metrics.actualBoundingBoxAscent || size * 0.8)}
  }
}
type Instruction = { target: string; data: string }
const workerDocument = {
  createElementNS(namespace: string, name: string): SvgElement {
    if (namespace !== NS || !elements.has(name)) throw new Error('Unsupported PlantUML element')
    return new SvgElement(name)
  },
  createElement(name: string): OffscreenCanvas {
    if (name !== 'canvas' || typeof OffscreenCanvas === 'undefined') throw new Error('Unsupported PlantUML DOM capability')
    return new OffscreenCanvas(1, 1)
  },
  createProcessingInstruction(target: string, data: string): Instruction {
    if (target !== 'plantuml-src' || !/^[\w-]*$/.test(data)) throw new Error('Unsupported PlantUML instruction')
    return {target, data:charge(data)}
  },
  getElementById(): null { return null },
  body: { appendChild(): void {}, removeChild(): void {} },
}
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
class SvgSerializer {
  serializeToString(root: SvgElement): string {
    const render = (node: SvgElement | Instruction, depth: number): string => {
      if (depth > 64) throw new Error('PlantUML SVG depth limit exceeded')
      if (!(node instanceof SvgElement)) return `<?${node.target} ${node.data}?>`
      const attrs = Object.entries(node.attributes).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('')
      return `<${node.name}${attrs}>${escapeXml(node.textContent)}${node.children.map(child => render(child, depth + 1)).join('')}</${node.name}>`
    }
    return render(root, 0)
  }
}
export function installPlantUmlWorkerDom(): void {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('PlantUML requires OffscreenCanvas')
  Object.defineProperty(globalThis, 'window', {value:globalThis})
  Object.defineProperty(globalThis, 'document', {value:workerDocument})
  Object.defineProperty(globalThis, 'XMLSerializer', {value:SvgSerializer})
}
