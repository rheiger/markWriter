import MarkdownIt from 'markdown-it'
import markdownItIns from 'markdown-it-ins'
// @ts-expect-error plugin has no bundled declarations
import taskLists from 'markdown-it-task-lists'
import TurndownService from 'turndown'
// @ts-expect-error plugin has no bundled declarations
import { gfm } from 'turndown-plugin-gfm'
import { mapTokens, type MapOwner, type PreviewMap } from './sourceMap'

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
const fence = markdown.renderer.rules.fence!
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index]
  const notation = token.info.trim()
  if (notation === 'dot' || notation === 'graphviz') {
    const lines = (env?.source as string | undefined)?.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []
    const raw = token.map ? lines.slice(token.map[0], token.map[1]).join('').replace(/(?:\r\n|\r|\n)$/, '') : ''
    const escape = markdown.utils.escapeHtml
    return `<div data-type="dot" data-notation="${notation}" data-chart="${escape(token.content)}" data-source-fence="${escape(JSON.stringify(raw.startsWith(token.markup) ? raw : ''))}">${escape(token.content)}</div>\n`
  }
  if (notation !== 'mermaid') return fence(tokens, index, options, env, renderer)
  const source = markdown.utils.escapeHtml(token.content)
  return `<div data-type="mermaid" data-chart="${source}">${source}</div>\n`
}

export function renderMarkdownHtml(source: string): string {
  return markdown.render(source, { source })
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
export function renderMappedMarkdown(source: string, owner: MapOwner): PreviewMap {
  const env = { source }
  const tokens = markdown.parse(source, env)
  const map = mapTokens(source, tokens, owner, text => markdown.utils.unescapeAll(text))
  map.html = mappedRenderer.render(tokens, markdown.options, env)
  return map
}

export function toWysiwygHtml(source: string): string {
  const doc = new DOMParser().parseFromString(markdown.render(source, { source }), 'text/html')
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

function dotFence(node: HTMLElement): string {
  const chart = node.getAttribute('data-chart') ?? ''
  const notation = node.getAttribute('data-notation') === 'graphviz' ? 'graphviz' : 'dot'
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

const turndown = new TurndownService({
  headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-',
  // Atom nodes serialize as empty elements; Turndown checks blankness before custom rules.
  blankReplacement: (_content, node) => {
    const element = node as HTMLElement
    if (element.getAttribute?.('data-type') === 'dot') return dotFence(element)
    if (element.getAttribute?.('data-type') === 'mermaid') return mermaidFence(element)
    return (node as HTMLElement & { isBlock: boolean }).isBlock ? '\n\n' : ''
  },
})
// Extensions use ++ and ~~ delimiters. Literal text must never become those marks on reopen.
const escapeText = turndown.escape.bind(turndown)
turndown.escape = text => escapeText(text).replace(/(\\*)([+~])/g, (_match, slashes: string, char: string) => slashes + (slashes.length % 2 ? '' : '\\') + char)
turndown.use(gfm)
turndown.addRule('dot', { filter: node => node.getAttribute('data-type') === 'dot', replacement: (_content, node) => dotFence(node as HTMLElement) })
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
      turndown.turndown(cell.innerHTML).trim().replace(/(?<!\\)\|/g, '\\|').replace(/\n+/g, '<br>')
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

export function fromWysiwygHtml(html: string): string {
  return turndown.turndown(html)
}
