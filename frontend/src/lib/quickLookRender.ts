import mermaid from 'mermaid'
import { instance } from '@viz-js/viz'
import { validateDot, sanitizeDotSvg, checkedDotErrors } from './dotSafety'
import { createCodeHighlighter, highlightedHtml } from './codeHighlight'
import tokenCss from './codeHighlight.css?inline'

// The native wrapper supplies escaped HTML and a locked-down offline CSP.
// Budgets are per request; native must also time out and destroy the WKWebView.
const MERMAID_BLOCKS = 4
const MERMAID_BLOCK_CHARS = 8 * 1024
const MERMAID_TOTAL_CHARS = 16 * 1024
const MAX_SVG_BYTES = 512 * 1024
const MAX_PNG_BYTES = 3 * 1024 * 1024
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

function safeMermaid(source: string): boolean {
  return !!source.trim() && source.length <= MERMAID_BLOCK_CHARS &&
    !/^\s*---(?:\s|$)/.test(source) && !/%%\s*\{/i.test(source) &&
    !/(?:https?:|file:|data:|javascript:|@import|url\s*\(|<\s*[a-z!/])/i.test(source) &&
    !/^\s*(?:click|classDef|style|linkStyle)\b/im.test(source)
}

function safeCss(css: string): boolean {
  if (/[\\]/.test(css) || /@/.test(css.replace(/@keyframes\s+[\w-]+\s*\{/g, ''))) return false
  const stripped = css.replace(/url\(\s*["']?#[\w.-]+["']?\s*\)/gi, '')
  return !/url\s*\(/i.test(stripped)
}

function safeSvg(svg: string): { svg: string; width: number; height: number } {
  if (svg.length > MAX_SVG_BYTES || new TextEncoder().encode(svg).length > MAX_SVG_BYTES || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('SVG exceeds limits')
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = parsed.documentElement
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || parsed.querySelector('parsererror')) throw new Error('Invalid SVG')
  root.querySelectorAll('filter').forEach(node => node.remove())
  const allowed = new Set('svg g defs marker path rect line circle ellipse polygon polyline text tspan style clipPath mask title desc'.split(' '))
  const nodes = [root, ...Array.from(root.querySelectorAll('*'))]
  if (nodes.length > 10000) throw new Error('SVG complexity')
  for (const node of nodes) {
    if (node.namespaceURI !== root.namespaceURI || !allowed.has(node.localName)) throw new Error('Unsupported SVG element: ' + node.localName)
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.localName)) throw new Error('SVG event')
      if (/^(?:href|src)$/i.test(attr.localName) && !/^#[\w.-]+$/.test(attr.value)) throw new Error('SVG external reference')
      if (/url\s*\(/i.test(attr.value) && !/^url\(\s*#[\w.-]+\s*\)$/.test(attr.value)) throw new Error('SVG external paint')
      if (/^(?:style)$/i.test(attr.localName) && !safeCss(attr.value)) throw new Error('SVG unsafe style')
    }
    if (node.localName === 'style') {
      const css = node.textContent ?? ''
      if (!safeCss(css)) throw new Error('SVG unsafe stylesheet')
    }
  }
  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (!box || box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[2] <= 0 || box[3] <= 0 || box[2] > 4096 || box[3] > 4096) throw new Error('SVG dimensions')
  const scale = Math.min(1, 1600 / box[2], 1600 / box[3])
  return { svg: new XMLSerializer().serializeToString(root), width: Math.max(1, Math.ceil(box[2] * scale)), height: Math.max(1, Math.ceil(box[3] * scale)) }
}

async function rasterize(svg: string): Promise<string> {
  const clean = safeSvg(svg)
  const url = URL.createObjectURL(new Blob([clean.svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Diagram image timeout')), 2000)
      image.onload = () => { clearTimeout(timer); resolve() }
      image.onerror = () => { clearTimeout(timer); reject(new Error('Diagram image failed')) }
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = clean.width; canvas.height = clean.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0, clean.width, clean.height)
    const png = canvas.toDataURL('image/png')
    if (!png.startsWith('data:image/png;base64,') || png.length > MAX_PNG_BYTES) throw new Error('PNG exceeds limit')
    return png
  } finally { URL.revokeObjectURL(url) }
}

export async function quickLookRender(html: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const highlight = createCodeHighlighter(true)
  let diagrams = 0, diagramChars = 0
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, htmlLabels: false, maxTextSize: MERMAID_BLOCK_CHARS, maxEdges: 160 })
  for (const pre of Array.from(parsed.querySelectorAll('pre'))) {
    const code = pre.querySelector(':scope > code')
    const target = code ?? pre
    const language = (target.getAttribute('data-language') ?? '').toLowerCase()
    const source = target.textContent ?? ''
    if (language === 'mermaid' || language === 'dot' || language === 'graphviz') {
      if (++diagrams > MERMAID_BLOCKS || (diagramChars += source.length) > MERMAID_TOTAL_CHARS || source.length > MERMAID_BLOCK_CHARS) continue
      try {
        let svg: string
        if (language === 'mermaid') {
          if (!safeMermaid(source)) continue
          svg = (await mermaid.render(`mwql-${diagrams}`, source)).svg
        } else {
          validateDot(source)
          const viz = await instance()
          const rendered = viz.render(source, { format: 'svg', engine: 'dot' })
          if (rendered.status !== 'success' || checkedDotErrors(rendered.errors).length) throw new Error('DOT render failed')
          svg = sanitizeDotSvg(rendered.output)
        }
        const png = await rasterize(svg)
        const img = parsed.createElement('img'); img.src = png; img.alt = language === 'mermaid' ? 'Mermaid diagram' : 'DOT diagram'
        const details = parsed.createElement('details'), summary = parsed.createElement('summary')
        summary.textContent = 'Diagram source'; details.append(summary, pre.cloneNode(true))
        pre.replaceWith(img, details)
        if (new TextEncoder().encode(parsed.documentElement.outerHTML).length > MAX_OUTPUT_BYTES) { img.replaceWith(pre); details.remove() }
      } catch { /* Keep the escaped source. */ }
    } else if (language && language !== 'dot' && language !== 'graphviz') {
      target.innerHTML = highlightedHtml(source, highlight(source, language))
    }
  }
  parsed.querySelectorAll('script, iframe, object, embed, link, base, form').forEach(node => node.remove())
  for (const node of Array.from(parsed.querySelectorAll('*'))) {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name) || /^(?:href|src|srcset|action|formaction)$/i.test(attribute.name) && !(node.localName === 'img' && attribute.name === 'src' && attribute.value.startsWith('data:image/png;base64,'))) node.removeAttribute(attribute.name)
    }
  }
  const style = parsed.createElement('style'); style.textContent = tokenCss; parsed.head.append(style)
  const result = '<!doctype html>' + parsed.documentElement.outerHTML
  if (new TextEncoder().encode(result).length > MAX_OUTPUT_BYTES) throw new Error('Quick Look output limit exceeded')
  return result
}

declare global { var markwriterQuickLookRender: (html: string) => Promise<string> }
globalThis.markwriterQuickLookRender = quickLookRender
