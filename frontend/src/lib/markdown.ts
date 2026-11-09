import MarkdownIt from 'markdown-it'
import markdownItIns from 'markdown-it-ins'
// @ts-expect-error plugin has no bundled declarations
import taskLists from 'markdown-it-task-lists'
import TurndownService from 'turndown'
// @ts-expect-error plugin has no bundled declarations
import { gfm } from 'turndown-plugin-gfm'
import { mapTokens, type MapOwner, type PreviewMap } from './sourceMap'
import { createCodeHighlighter, highlightedHtml } from './codeHighlight'

const markdown = new MarkdownIt({ html: false, linkify: true })
markdown.use(markdownItIns).use(taskLists)
// GFM table cells use <br> for line breaks; allow only this exact safe HTML form.
markdown.inline.ruler.before('escape', 'table_break', (state, silent) => {
  const match = /^<br\s*\/?>(?!>)/i.exec(state.src.slice(state.pos))
  if (!match) return false
  if (!silent) state.push('hardbreak', 'br', 0)
  state.pos += match[0].length
  return true
})
const opaqueFences = new Set(['dot', 'dbml', 'math'])
const sourceLines = (source: string) => source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []
const withoutLastNewline = (text: string) => text.replace(/(?:\r\n|\r|\n)$/, '')
type MarkdownToken = ReturnType<typeof markdown.parse>[number]

function enclosingContainer(tokens: MarkdownToken[], index: number) {
  const map = tokens[index].map
  if (!map || !tokens[index].level) return undefined
  for (let previous = index - 1; previous >= 0; previous--) {
    const token = tokens[previous]
    if (token.level || token.nesting !== 1 || !token.map) continue
    return token.map[1] >= map[1] ? token.map : undefined
  }
}

const fence = markdown.renderer.rules.fence!
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index]
  const notation = token.info.trim()
  const type = notation === 'graphviz' ? 'dot' : notation
  if (opaqueFences.has(type)) {
    const lines = typeof env?.source === 'string' ? (env.sourceLines ??= sourceLines(env.source)) as string[] : []
    const raw = token.map ? withoutLastNewline(lines.slice(...token.map).join('')) : ''
    let metadata: string | { raw: string; container?: string } = raw.startsWith(token.markup) ? raw : ''
    if (type === 'dbml' && env?.retainDbmlSource) {
      metadata = { raw }
      const container = enclosingContainer(tokens, index)
      if (container) {
        const retained = (env.dbmlContainers ??= new Set<number>()) as Set<number>
        if (!retained.has(container[0])) {
          retained.add(container[0])
          metadata.container = withoutLastNewline(lines.slice(...container).join(''))
        }
      }
    }
    const escape = markdown.utils.escapeHtml
    return `<div data-type="${type}" data-notation="${notation}" data-chart="${escape(token.content)}" data-source-fence="${escape(JSON.stringify(metadata))}">${escape(token.content)}</div>\n`
  }
  const highlight = env?.highlightCode as ReturnType<typeof createCodeHighlighter> | undefined
  if (notation !== 'mermaid') return fence(tokens, index, { ...options, highlight: highlight ? (code, language) => highlightedHtml(code, highlight(code, language)) : null }, env, renderer)
  const source = markdown.utils.escapeHtml(token.content)
  return `<div data-type="mermaid" data-chart="${source}">${source}</div>\n`
}

markdown.renderer.rules.code_block = (tokens, index, _options, env) => {
  const code = tokens[index].content
  const highlight = env?.highlightCode as ReturnType<typeof createCodeHighlighter> | undefined
  return `<pre><code>${highlight ? highlightedHtml(code, highlight(code)) : markdown.utils.escapeHtml(code)}</code></pre>\n`
}
export function renderMarkdownHtml(source: string, highlighting = true): string {
  return markdown.render(source, { source, highlightCode: createCodeHighlighter(highlighting) })
}

// Mapping is opt-in and never used by export or the editable document codec.
const mappedRenderer = new MarkdownIt().renderer
Object.assign(mappedRenderer.rules, markdown.renderer.rules)
// Preview interaction navigates source. An active href reserves native drags for URLs
// even with draggable=false; retain the destination as a tooltip, with selectable labels.
mappedRenderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  const token = tokens[index], destination = token.attrGet('href')
  if (destination) token.attrSet('title', token.attrGet('title') ? `${token.attrGet('title')} (${destination})` : destination)
  token.attrs = token.attrs?.filter(([name]) => name !== 'href') ?? null
  return renderer.renderToken(tokens, index, options)
}
for (const type of ['text', 'code_inline']) {
  const original = markdown.renderer.rules[type]
  mappedRenderer.rules[type] = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const text = markdown.utils.escapeHtml(token.content)
    const body = token.meta?.navigationText === undefined ? text : `<span data-mw-text="${token.meta.navigationText}">${text}</span>`
    return type === 'code_inline' ? `<code${renderer.renderAttrs(token)}>${body}</code>` : token.meta?.navigationText === undefined ? original(tokens, index, options, env, renderer) : body
  }
}
for (const type of ['fence', 'code_block']) {
  const original = markdown.renderer.rules[type]!
  mappedRenderer.rules[type] = (tokens, index, options, env, renderer) => {
    let body = original(tokens, index, options, env, renderer)
    const segment = tokens[index].meta?.navigationText
    if (segment !== undefined) body = body.replace(/(<code[^>]*>)([\s\S]*?)(\n?<\/code>)/, `$1<span data-mw-text="${segment}">$2</span>$3`)
    return `<div data-mw-block="${tokens[index].meta?.navigationBlock}">${body}</div>`
  }
}
export function renderMappedMarkdown(source: string, owner: MapOwner, highlighting = true): PreviewMap {
  const env = { source, highlightCode: createCodeHighlighter(highlighting) }
  const tokens = markdown.parse(source, env)
  const map = mapTokens(source, tokens, owner, text => markdown.utils.unescapeAll(text))
  map.html = mappedRenderer.render(tokens, markdown.options, env)
  return map
}

// Keep every existing source byte and require an independent top-level fence.
export function appendDbmlFence(source: string, dbml: string) {
  if (source.length > 512 * 1024) throw new Error('This document is too large for SQL import. Import into a new document instead.')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const chart = dbml.replace(/\r\n?/g, '\n').replace(/\n+$/, '') + '\n'
  let fenceLength = 3
  for (const run of chart.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, run[0].length + 1)
  const fence = '`'.repeat(fenceLength)
  // Two newlines also work when a trailing CR joins the first inserted LF.
  const separator = source ? newline + newline : ''
  const raw = fence + 'dbml' + newline + chart.replace(/\n/g, newline) + fence
  const addition = separator + raw + newline
  const last = markdown.parse(source + addition, {}).at(-1)
  if (last?.type !== 'fence' || last.level !== 0 || last.info !== 'dbml' ||
      last.markup !== fence || last.content !== chart || !last.map ||
      sourceLines(source + addition).slice(...last.map).join('') !== raw + newline) {
    throw new Error('Close the unfinished Markdown block at the end of the document, then try again.')
  }
  return { addition, raw, chart }
}

export function toWysiwygHtml(source: string): string {
  const doc = new DOMParser().parseFromString(markdown.render(source, { source, retainDbmlSource: true }), 'text/html')
  doc.querySelectorAll('ins').forEach(node => {
    const underline = doc.createElement('u')
    underline.append(...Array.from(node.childNodes))
    node.replaceWith(underline)
  })
  doc.querySelectorAll('li.task-list-item').forEach(item => {
    const checkbox = item.querySelector<HTMLInputElement>('input[type="checkbox"]')
    item.setAttribute('data-type', 'taskItem')
    item.setAttribute('data-checked', String(checkbox?.checked ?? false))
    item.parentElement?.setAttribute('data-type', 'taskList')
    checkbox?.remove()
  })
  return doc.body.innerHTML
}

function embeddedFence(node: HTMLElement): string {
  const chart = node.getAttribute('data-chart') ?? ''
  const type = node.getAttribute('data-type')
  const notation = type === 'math' || type === 'dbml' ? type : node.getAttribute('data-notation') === 'graphviz' ? 'graphviz' : 'dot'
  const raw = node.getAttribute('data-source-fence')
  if (raw) {
    try {
      const sourceFence = JSON.parse(raw)
      if (typeof sourceFence === 'string' && sourceFence) {
        const tokens = markdown.parse(sourceFence, {}), token = tokens[0]
        const closer = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(sourceFence.split(/\r\n?|\n/).at(-1) ?? '')
        // Reuse only a complete, semantically matching fence. Unmatched or stale
        // pasted metadata must not swallow subsequently inserted rendered prose.
        if (tokens.length === 1 && token.type === 'fence' && token.info.trim() === notation && token.content === chart &&
          closer && closer[1][0] === token.markup[0] && closer[1].length >= token.markup.length) return `\n\n${sourceFence}\n\n`
      }
    } catch { /* Invalid metadata falls back to a safely closed source fence. */ }
  }
  let size = 3
  for (const match of chart.matchAll(/`+/g)) size = Math.max(size, match[0].length + 1)
  const fence = '`'.repeat(size)
  return `\n\n${fence}${notation}\n${chart.replace(/\n$/, '')}\n${fence}\n\n`
}
function mermaidFence(node: HTMLElement): string {
  const chart = node.getAttribute('data-chart') ?? node.textContent ?? ''
  // Pick a fence longer than any run in the source.
  let size = 3
  for (const match of chart.matchAll(/`+/g)) size = Math.max(size, match[0].length + 1)
  const fence = '`'.repeat(size)
  return `\n\n${fence}mermaid\n${chart.replace(/\n$/, '')}\n${fence}\n\n`
}

function inlineCode(text: string, tableCell = false): string {
  // CommonMark turns line endings into spaces in a code span. Padding protects
  // edge backticks and compensates for the one-space trim on both edges.
  const normalized = text.replace(/\r\n?|\n/g, ' ')
  // GFM consumes one backslash before every table pipe, including inside code.
  const content = tableCell ? normalized.replace(/\|/g, '\\|') : normalized
  if (!content) return ''
  const runs = new Set((content.match(/`+/g) ?? []).map(run => run.length))
  let size = 1
  while (runs.has(size)) size++
  const fence = '`'.repeat(size)
  const pad = content.startsWith('`') || content.endsWith('`') ||
    (content.startsWith(' ') && content.endsWith(' ') && /[^ ]/.test(content)) ? ' ' : ''
  return `${fence}${pad}${content}${pad}${fence}`
}

const turndown = new TurndownService({
  headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', preformattedCode: true,
  // Atom nodes serialize as empty elements; Turndown checks blankness before custom rules.
  blankReplacement: (_content, node) => {
    const element = node as HTMLElement
    if (opaqueFences.has(element.getAttribute?.('data-type') ?? '')) return embeddedFence(element)
    if (element.getAttribute?.('data-type') === 'mermaid') return mermaidFence(element)
    return (node as HTMLElement & { isBlock: boolean }).isBlock ? '\n\n' : ''
  },
})
// Extensions use ++ and ~~ delimiters. Literal text must never become those marks on reopen.
const escapeText = turndown.escape.bind(turndown)
turndown.escape = text => escapeText(text).replace(/(\\*)([+~])/g, (_match, slashes: string, char: string) => slashes + (slashes.length % 2 ? '' : '\\') + char)
turndown.use(gfm)
turndown.addRule('inlineCode', {
  filter: node => node.nodeName === 'CODE' && node.parentElement?.nodeName !== 'PRE',
  replacement: (_content, node) => inlineCode(node.textContent ?? '', !!(node as HTMLElement).closest('[data-mw-table-cell]')),
})
turndown.addRule('embeddedFence', { filter: node => opaqueFences.has(node.getAttribute('data-type') ?? ''), replacement: (_content, node) => embeddedFence(node as HTMLElement) })
turndown.addRule('mermaid', {
  filter: node => node.getAttribute('data-type') === 'mermaid',
  replacement: (_content, node) => mermaidFence(node as HTMLElement),
})
turndown.addRule('underline', { filter: ['u', 'ins'], replacement: content => `++${content}++` })
turndown.addRule('strike', { filter: ['s', 'del'], replacement: content => `~~${content}~~` })
turndown.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLTableElement).rows, row => Array.from(row.cells, cell =>
      fromWysiwygHtml(cell.innerHTML, true).trim().replace(/(?<!\\)\|/g, '\\|').replace(/\n+/g, '<br>')
    ))
    if (!rows.length) return ''
    const line = (cells: string[]) => `| ${cells.join(' | ')} |`
    const separators = Array.from((node as HTMLTableElement).rows[0].cells, cell => {
      const alignment = cell.style.textAlign
      return alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : alignment === 'left' ? ':---' : '---'
    })
    return '\n\n' + [line(rows[0]), line(separators), ...rows.slice(1).map(line)].join('\n') + '\n\n'
  },
})
turndown.addRule('taskLabel', {
  filter: node => node.nodeName === 'LABEL' && node.parentElement?.getAttribute('data-type') === 'taskItem',
  replacement: () => '',
})
turndown.addRule('taskItem', {
  filter: node => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => `\n- [${(node as HTMLElement).getAttribute('data-checked') === 'true' ? 'x' : ' '}] ${content.trim().replace(/\n/g, '\n    ')}\n`,
})
turndown.addRule('listParagraph', {
  filter: node => node.nodeName === 'P' && !!node.closest('li'),
  replacement: content => content + '\n',
})

function restoreDbmlFences(root: HTMLElement, rendered: string): string {
  const atoms = Array.from(root.querySelectorAll('[data-type="dbml"][data-source-fence]'))
  if (!atoms.length) return rendered

  const tokens = markdown.parse(rendered, {})
  const fences = tokens.flatMap((token, index) => token.type === 'fence' && token.info.trim() === 'dbml' ? [{ token, index }] : [])
  if (fences.length !== atoms.length) return rendered

  const lines = sourceLines(rendered)
  const signature = (source: string) => {
    const env: NonNullable<Parameters<typeof markdown.render>[1]> = {}
    const html = markdown.render(source, env)
    return JSON.stringify([html, env.references])
  }
  const semantic = signature(rendered)
  const raw = new Map<number, { end: number; text: string }>()
  const containers = new Map<number, { end: number; text: string }>()
  for (const [position, { token, index }] of fences.entries()) {
    const atom = atoms[position]
    if (!token.map || token.content !== atom.getAttribute('data-chart')) continue
    let metadata: { raw?: unknown; container?: unknown } | null
    try { metadata = JSON.parse(atom.getAttribute('data-source-fence') ?? '') } catch { continue }
    if (!metadata || typeof metadata.raw !== 'string' || !metadata.raw) continue
    raw.set(token.map[0], { end: token.map[1], text: metadata.raw })
    const container = enclosingContainer(tokens, index)
    if (container && typeof metadata.container === 'string' && metadata.container &&
        signature(lines.slice(...container).join('')) === signature(metadata.container)) {
      containers.set(container[0], { end: container[1], text: metadata.container })
    }
  }
  if (!raw.size) return rendered

  // Preserve verbatim fence bytes when their container still means the same
  // thing. An unchanged surrounding list may require restoring its indentation
  // too. Parse the whole result before accepting metadata from clipboard HTML.
  const splice = (useContainers: boolean) => {
    const output: string[] = []
    for (let line = 0; line < lines.length;) {
      const range = (useContainers ? containers.get(line) : undefined) ?? raw.get(line)
      if (!range) { output.push(lines[line++]); continue }
      const ending = /(?:\r\n|\r|\n)$/.exec(lines[range.end - 1])?.[0] ?? ''
      output.push(range.text, ending)
      line = range.end
    }
    return output.join('')
  }
  const exact = splice(false)
  if (signature(exact) === semantic) return exact
  if (containers.size) {
    const nested = splice(true)
    if (signature(nested) === semantic) return nested
  }
  return rendered
}

export function fromWysiwygHtml(html: string, tableCell = false): string {
  const root = document.createElement('x-turndown')
  root.innerHTML = html
  if (tableCell) root.setAttribute('data-mw-table-cell','true')
  // Turndown treats whitespace-only elements (including their ancestors) as
  // blank before selecting any rule. A temporary void child keeps such code
  // spans and their surrounding block structure meaningful; our code rule
  // reads textContent, so the marker never appears in the saved Markdown.
  root.querySelectorAll('code').forEach(code => {
    if (!code.closest('pre') && code.textContent && /^\s+$/.test(code.textContent)) {
      code.appendChild(document.createElement('wbr'))
    }
  })
  return restoreDbmlFences(root, turndown.turndown(root))
}
