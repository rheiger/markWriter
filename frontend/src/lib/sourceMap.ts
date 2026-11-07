import type { Token } from 'markdown-it'

export interface MapOwner { documentId: string; revision: number; generation: number }
export interface SourceBlock { id: number; from: number; to: number; kind: string }
export interface TextSegment { id: number; block: number; text: string; starts: number[]; ends: number[] }
export interface PreviewMap { owner: MapOwner; blocks: SourceBlock[]; segments: TextSegment[]; html: string }

export function sourceOffset(segment: TextSegment, offset: number, bias = 1): number {
  if (offset >= segment.text.length) return segment.ends[segment.ends.length - 1]
  if (offset <= 0 || bias > 0) return segment.starts[Math.max(0, offset)]
  return segment.ends[offset - 1]
}
export function renderedOffset(segment: TextSegment, source: number): number {
  let lo = 0, hi = segment.ends.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (segment.ends[mid] <= source) lo = mid + 1; else hi = mid }
  return lo
}

// Normalize exactly as the parser does, retaining original UTF-16 intervals (not byte offsets).
function normalizedSource(source: string) {
  let text = ''
  const starts: number[] = [], ends: number[] = []
  for (let i = 0; i < source.length; i++) {
    const start = i
    const char = source[i] === '\r' ? '\n' : source[i] === '\0' ? '\ufffd' : source[i]
    if (source[i] === '\r' && source[i + 1] === '\n') i++
    text += char; starts.push(start); ends.push(i + 1)
  }
  const lines = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1)
  return { text, starts, ends, lines }
}

// Locate *raw parser content* in its parser-owned lines, not rendered text in the document.
function inlineOrigins(raw: string, content: string, from: number, to: number): number[] | null {
  const result: number[] = []
  let lineStart = from
  for (const [lineNumber, part] of content.split('\n').entries()) {
    if (lineNumber) { result.push(Math.max(from, lineStart - 1)) }
    const end = Math.min(to, raw.indexOf('\n', lineStart) < 0 ? raw.length : raw.indexOf('\n', lineStart))
    const index = raw.slice(lineStart, end).indexOf(part)
    if (index < 0) return null
    for (let i = 0; i < part.length; i++) result.push(lineStart + index + i)
    lineStart = end + 1
  }
  return result
}

function cells(raw: string, from: number, to: number) {
  const result: { content: string; origins: number[] }[] = []
  let content = '', origins: number[] = []
  const flush = () => {
    const left = content.length - content.trimStart().length, right = content.trimEnd().length
    result.push({ content: content.trim(), origins: origins.slice(left, right) }); content = ''; origins = []
  }
  for (let i = from; i < to && raw[i] !== '\n'; i++) {
    if (raw[i] === '\\' && raw[i + 1] === '|') { i++; content += '|'; origins.push(i) }
    else if (raw[i] === '|') flush()
    else { content += raw[i]; origins.push(i) }
  }
  flush()
  if (!result[0]?.content) result.shift()
  if (!result[result.length - 1]?.content) result.pop()
  return result
}

function linkEnd(raw: string, start: number): number {
  let p = start
  if (raw[p] === ']') p++
  if (raw[p] === '(') {
    let depth = 1; p++
    while (p < raw.length && depth) {
      if (raw[p] === '\\') { p += 2; continue }
      if (raw[p] === '(') depth++
      if (raw[p] === ')') depth--
      p++
    }
  } else if (raw[p] === '[') { const end = raw.indexOf(']', p + 1); if (end >= 0) p = end + 1 }
  return p
}

export function mapTokens(source: string, tokens: Token[], owner: MapOwner, decode: (text: string) => string): PreviewMap {
  const norm = normalizedSource(source)
  const map: PreviewMap = { owner, blocks: [], segments: [], html: '' }
  let block: SourceBlock | undefined
  let rowCells: ReturnType<typeof cells> = [], cell = 0
  for (const token of tokens) {
    if (token.map && token.type !== 'inline' && (token.nesting === 1 || token.nesting === 0)) {
      const from = norm.lines[token.map[0]] ?? norm.text.length, to = norm.lines[token.map[1]] ?? norm.text.length
      block = { id: map.blocks.length, from: norm.starts[from] ?? source.length, to: norm.starts[to] ?? source.length, kind: token.type }
      map.blocks.push(block)
      if (!token.hidden) token.attrSet('data-mw-block', String(block.id))
      token.meta = { ...token.meta, navigationBlock: block.id }
      if (token.type === 'tr_open') { rowCells = cells(norm.text, from, to); cell = 0 }
      if ((token.type === 'fence' && !['mermaid', 'dot', 'graphviz', 'dbml', 'math'].includes(token.info.trim()) || token.type === 'code_block') && token.content) {
        const origins = inlineOrigins(norm.text, token.content.replace(/\n$/, ''), norm.lines[token.map[0] + (token.type === 'fence' ? 1 : 0)], to)
        if (origins) {
          const text = token.content.replace(/\n$/, '')
          const segment = { id: map.segments.length, block: block.id, text,
            starts: origins.map(i => norm.starts[i]), ends: origins.map(i => norm.ends[i]) }
          map.segments.push(segment); token.meta = { ...token.meta, navigationText: segment.id }
        }
      }
    }
    if (token.type !== 'inline' || !block) continue
    let origins: number[] | null
    if (token.map) {
      origins = inlineOrigins(norm.text, token.content, norm.lines[token.map[0]], norm.lines[token.map[1]] ?? norm.text.length)
    } else { const entry = rowCells[cell++]; origins = entry?.content === token.content ? entry.origins : null }
    if (!origins) continue
    let p = 0
    const raw = token.content
    const consumeText = (text: string) => {
      const starts: number[] = [], ends: number[] = []
      let i = 0
      while (i < text.length && p < raw.length) {
        const begin = p
        let value = raw[p], size = 1
        if (raw[p] === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(raw[p + 1] ?? '')) { value = raw[p + 1]; size = 2 }
        else if (raw[p] === '&') {
          const entity = /^&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][a-zA-Z\d]+);/.exec(raw.slice(p))
          if (entity && decode(entity[0]) !== entity[0]) { value = decode(entity[0]); size = entity[0].length }
        }
        if (!text.startsWith(value, i)) return null // deterministic block fallback, never guess
        for (let j = 0; j < value.length; j++) {
          starts.push(norm.starts[origins![begin]]); ends.push(norm.ends[origins![begin + size - 1]])
        }
        i += value.length; p += size
      }
      return i === text.length ? { starts, ends } : null
    }
    for (const child of token.children ?? []) {
      if (child.type === 'text' && child.content) {
        const positions = consumeText(child.content)
        if (positions) {
          const segment = { id: map.segments.length, block: block.id, text: child.content, ...positions }
          map.segments.push(segment); child.meta = { ...child.meta, navigationText: segment.id }
        } else break
      } else if (child.type === 'code_inline') {
        const start = p + child.markup.length, end = raw.indexOf(child.markup, start)
        if (end < 0) break
        let bodyStart = start, bodyEnd = end
        const body = raw.slice(start, end).replace(/\n/g, ' ')
        if (body.startsWith(' ') && body.endsWith(' ') && /[^ ]/.test(body)) { bodyStart++; bodyEnd-- }
        if (raw.slice(bodyStart, bodyEnd).replace(/\n/g, ' ') === child.content) {
          const segment = { id: map.segments.length, block: block.id, text: child.content,
            starts: origins.slice(bodyStart, bodyEnd).map(i => norm.starts[i]), ends: origins.slice(bodyStart, bodyEnd).map(i => norm.ends[i]) }
          map.segments.push(segment); child.meta = { ...child.meta, navigationText: segment.id }
        }
        p = end + child.markup.length
      } else if (child.type === 'link_open') { if (raw[p] === '[' || raw[p] === '<') p++ }
      else if (child.type === 'link_close') { p = raw[p] === '>' ? p + 1 : linkEnd(raw, p) }
      else if (child.type === 'image') { const end = raw.indexOf(']', p + 2); if (end < 0) break; p = linkEnd(raw, end) }
      else if (child.type === 'html_inline' && child.content.includes('checkbox')) { const task = /^\[[ xX]\]\s?/.exec(raw.slice(p)); if (task) p += task[0].length }
      else if (child.type === 'softbreak' || child.type === 'hardbreak') {
        const br = /^<br\s*\/?>(?!>)/i.exec(raw.slice(p))
        if (br) p += br[0].length
        else { const newline = raw.indexOf('\n', p); if (newline < 0) break; p = newline + 1; while (raw[p] === ' ') p++ }
      } else if (child.markup && (child.nesting || child.type === 'text_special')) {
        if (raw.startsWith(child.markup, p)) p += child.markup.length
        else if (child.content) break
      }
    }
  }
  return map
}
