// Per-revision budgets limit work retained by a single document. Input limits
// are checked before a worker is started; the worker repeats them independently.
export const MATH_LIMITS = {
  inputBytes: 16 * 1024, outputBytes: 1024 * 1024,
  documentBlocks: 64, documentInputBytes: 256 * 1024, documentOutputBytes: 4 * 1024 * 1024,
  maxExpand: 512, maxSize: 50, startupMs: 5000, renderMs: 2000, documentMs: 15000, queued: 64,
} as const

export const mathBytes = (text: string) => new TextEncoder().encode(text).length

export function validateMathSource(source: string): void {
  if (!source.trim()) throw new Error('Math source is empty')
  if (source.length > MATH_LIMITS.inputBytes || mathBytes(source) > MATH_LIMITS.inputBytes) {
    throw new Error('Math exceeds the 16 KiB source limit')
  }
}

// KaTeX promises escaped HTML with trust disabled. Validate its output again at
// the worker boundary and reject resource-bearing markup before HTML parsing.
const elements = new Set(('span math semantics annotation mrow mi mn mo mtext mspace ms msqrt mroot mfrac msub msup msubsup munder mover munderover mmultiscripts mprescripts none mstyle merror mpadded mphantom menclose mtable mtr mlabeledtr mtd maction svg path line').split(' '))
const attributes = new Set(('class style aria-hidden xmlns display encoding mathvariant mathcolor mathbackground mathsize displaystyle scriptlevel accent accentunder columnalign columnlines columnspacing rowalign rowlines rowspacing depth height width lspace rspace voffset linethickness minsize maxsize stretchy fence separator largeop linebreak notation valign d viewbox preserveaspectratio x1 x2 y1 y2 stroke-width').split(' '))
const properties = new Set(('background-color border-bottom-width border-color border-right-style border-right-width border-style border-top-width border-width bottom color height left margin margin-left margin-right margin-top min-width padding-left position text-shadow top vertical-align width').split(' '))

export function validateMathOutput(html: string): string {
  if (html.length > MATH_LIMITS.outputBytes || mathBytes(html) > MATH_LIMITS.outputBytes) throw new Error('Math exceeds the 1 MiB output limit')
  if (!html.startsWith('<span class="katex-display">') ||
      /<\s*\/?\s*(?:img|iframe|object|embed|link|style|script|mglyph|image|use|feimage|audio|video|source|track)\b/i.test(html) ||
      /<[a-z][^>]*\s(?:src|href|xlink:href)\s*=/i.test(html)) throw new Error('Unsupported math output')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (doc.head.childNodes.length || doc.body.children.length !== 1 || !doc.body.firstElementChild?.classList.contains('katex-display')) throw new Error('Invalid math output')
  let count = 0
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (++count > 30000 || !elements.has(element.localName.toLowerCase())) throw new Error('Unsupported math output')
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase(), value = attribute.value
      if (!attributes.has(name) || Array.from(value).some(char => { const code = char.charCodeAt(0); return code < 32 && code !== 9 && code !== 10 && code !== 13 })) throw new Error('Unsupported math output')
      if (name === 'style') {
        for (const declaration of value.split(';').filter(Boolean)) {
          const split = declaration.indexOf(':')
          const property = declaration.slice(0, split).trim().toLowerCase(), content = declaration.slice(split + 1).trim()
          if (split < 1 || !properties.has(property) || !/^[#a-zA-Z0-9.%(),+\-\s]+$/.test(content) || /url|expression|var\s*\(/i.test(content)) throw new Error('Unsupported math output style')
        }
      }
    }
  }
  return html
}
