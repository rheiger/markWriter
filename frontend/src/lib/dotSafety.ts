// This is deliberately a small static DOT/SVG subset, not an HTML/CSS sanitizer.
export const DOT_LIMITS = { inputBytes: 64 * 1024, outputBytes: 2 * 1024 * 1024, layoutMs: 2000, startupMs: 5000, queued: 32 } as const
export const DOT_ATTRIBUTES = new Set(('label xlabel headlabel taillabel rankdir rank ranksep nodesep shape style color fillcolor bgcolor fontcolor fontname fontsize penwidth arrowhead arrowtail arrowsize dir constraint weight minlen width height fixedsize margin ordering peripheries labelloc labeljust lhead ltail compound concentrate splines clusterrank group tooltip').split(' '))
const bytes = (text: string) => new TextEncoder().encode(text).length

// Tokenize before checking assignments: quoted names, comments and escapes must not
// bypass the resource policy. Graphviz itself remains the syntax parser.
export function validateDot(source: string): void {
  if (!source.trim()) throw new Error('DOT source is empty')
  if (source.length > DOT_LIMITS.inputBytes || bytes(source) > DOT_LIMITS.inputBytes) throw new Error('DOT exceeds 64 KiB input limit')
  const tokens: { value: string; operator?: boolean }[] = []
  for (let i = 0; i < source.length;) {
    const ch = source[i]
    if (/\s/.test(ch)) { i++; continue }
    if (source.startsWith('//', i) || ch === '#') { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end + 1; continue }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error('Unclosed DOT comment'); i = end + 2; continue }
    if (ch === '<' || ch === '+') throw new Error('HTML labels and string concatenation are unsupported in DOT')
    if (ch === '"') {
      let value = '', closed = false; i++
      while (i < source.length) {
        const next = source[i++]
        if (next === '"') { closed = true; break }
        if (next === '\\') { if (i >= source.length) break; value += '\\' + source[i++]; continue }
        value += next
      }
      if (!closed) throw new Error('Unclosed DOT string')
      tokens.push({ value }); continue
    }
    const id = /^[\w\u0080-\uffff.:-]+/.exec(source.slice(i))
    if (id) { tokens.push({ value: id[0] }); i += id[0].length; continue }
    tokens.push({ value: ch, operator: true }); i++
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].operator && tokens[i].value === '=' && !DOT_ATTRIBUTES.has(tokens[i - 1]?.value)) throw new Error(`Unsupported DOT attribute: ${tokens[i - 1]?.value ?? '(missing)'}`)
  }
}

const NS = 'http://www.w3.org/2000/svg'
const elements = new Set('svg g polygon polyline path ellipse circle rect line text tspan title desc'.split(' '))
const numeric = new Set('x y x1 y1 x2 y2 cx cy rx ry r width height stroke-width stroke-miterlimit stroke-dashoffset font-size opacity fill-opacity stroke-opacity'.split(' '))
const numberList = /^[\s,0-9eE+.-]+$/
const boundedNumbers = (value: string) => numberList.test(value) && value.trim().split(/[\s,]+/).every(n => Number.isFinite(Number(n)) && Math.abs(Number(n)) <= 100000)
const color = /^(?:none|transparent|currentColor|[a-zA-Z]{1,32}|#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/
function safeAttribute(name: string, value: string): boolean {
  if (numeric.has(name)) return boundedNumbers(value)
  if (name === 'viewBox') return value.trim().split(/[\s,]+/).length === 4 && boundedNumbers(value) && value.trim().split(/[\s,]+/).slice(2).every(n => Number(n) > 0)
  if (name === 'points' || name === 'stroke-dasharray') return boundedNumbers(value)
  if (name === 'd') return /^[\s,0-9eE+.-MmLlHhVvCcSsQqTtAaZz]+$/.test(value) && (value.match(/[+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?/g) ?? []).every(n => Math.abs(Number(n)) <= 100000)
  if (name === 'transform') return /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\s,0-9eE+.-]+\)\s*)+$/.test(value) && boundedNumbers(value.replace(/[a-zA-Z]+\(/g, '').replace(/\)/g, ' '))
  if (name === 'fill' || name === 'stroke') return color.test(value)
  if (name === 'font-family') return /^[\w\s,.'-]{1,160}$/.test(value)
  if (name === 'text-anchor') return /^(start|middle|end)$/.test(value)
  if (name === 'font-weight') return /^(normal|bold|[1-9]00)$/.test(value)
  if (name === 'font-style') return /^(normal|italic|oblique)$/.test(value)
  if (name === 'stroke-linecap') return /^(butt|round|square)$/.test(value)
  if (name === 'stroke-linejoin') return /^(miter|round|bevel)$/.test(value)
  if (name === 'fill-rule' || name === 'clip-rule') return /^(nonzero|evenodd)$/.test(value)
  return false
}

export function sanitizeDotSvg(raw: string): string {
  if (raw.length > DOT_LIMITS.outputBytes || bytes(raw) > DOT_LIMITS.outputBytes) throw new Error('DOT exceeds 2 MiB SVG limit')
  // Only Graphviz's fixed standard DTD is tolerated; no entities/internal subsets.
  raw = raw.replace(/<!DOCTYPE svg PUBLIC "-\/\/W3C\/\/DTD SVG 1\.1\/\/EN"\s+"http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd">/, '')
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('Unsupported SVG declaration')
  const parsed = new DOMParser().parseFromString(raw, 'image/svg+xml')
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg' || parsed.documentElement.namespaceURI !== NS) throw new Error('Invalid DOT SVG')
  const output = document.implementation.createDocument(NS, 'svg', null)
  let count = 0
  function copy(node: Element, parent: Element, depth: number): void {
    if (++count > 50000 || depth > 64) throw new Error('DOT SVG complexity limit exceeded')
    if (node.namespaceURI !== NS) return
    // Strip links while retaining safe text/geometry. Other unsupported subtrees vanish.
    if (node.localName === 'a') { for (const child of Array.from(node.children)) copy(child, parent, depth + 1); return }
    if (!elements.has(node.localName)) return
    const clean = node === parsed.documentElement ? output.documentElement : output.createElementNS(NS, node.localName)
    for (const attr of Array.from(node.attributes)) {
      if (attr.namespaceURI === 'http://www.w3.org/XML/1998/namespace' && attr.localName === 'space' && attr.value === 'preserve') {
        clean.setAttributeNS(attr.namespaceURI, 'xml:space', 'preserve'); continue
      }
      if (attr.namespaceURI || !safeAttribute(attr.name, attr.value)) continue
      clean.setAttribute(attr.name, attr.value)
    }
    if (node === parsed.documentElement && !clean.hasAttribute('viewBox')) throw new Error('DOT SVG has no bounded viewBox')
    if (clean !== output.documentElement) parent.appendChild(clean)
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) copy(child as Element, clean, depth + 1)
      else if (child.nodeType === 3 && /^(text|tspan|title|desc)$/.test(node.localName)) clean.appendChild(output.createTextNode(child.textContent ?? ''))
    }
  }
  copy(parsed.documentElement, output.documentElement, 0)
  return new XMLSerializer().serializeToString(output)
}

// The embedded font metrics approximate UTF-8 labels. This known non-resource
// diagnostic is permitted; all other warnings/errors become recoverable errors.
export function checkedDotErrors<T extends { level?: string; message: string }>(errors: readonly T[]): T[] {
  return errors.filter(error => error.level !== 'warning' || !/^Warning: no value for width of non-ASCII character \d{1,3}\. Falling back to width of space character$/.test(error.message))
}
