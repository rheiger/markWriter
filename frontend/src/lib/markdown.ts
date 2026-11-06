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
  if (token.info.trim() !== 'mermaid') return fence(tokens, index, options, env, renderer)
  const source = markdown.utils.escapeHtml(token.content)
  return `<div data-type="mermaid" data-chart="${source}">${source}</div>\n`
}

export function renderMarkdownHtml(source: string): string {
  return markdown.render(source)
}

// Mapping is opt-in and never used by export or the editable document codec.
const mappedRenderer = new MarkdownIt().renderer
Object.assign(mappedRenderer.rules, markdown.renderer.rules)
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
    const body = original(tokens, index, options, env, renderer)
    return `<div data-mw-block="${tokens[index].meta?.navigationBlock}">${body}</div>`
  }
}
export function renderMappedMarkdown(source: string, owner: MapOwner): PreviewMap {
  const env = {}
  const tokens = markdown.parse(source, env)
  const map = mapTokens(source, tokens, owner, text => markdown.utils.unescapeAll(text))
  map.html = mappedRenderer.render(tokens, markdown.options, env)
  return map
}

export function toWysiwygHtml(source: string): string {
  const doc = new DOMParser().parseFromString(markdown.render(source), 'text/html')
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

function mermaidFence(node: HTMLElement): string {
  const chart = node.getAttribute('data-chart') ?? node.textContent ?? ''
  // Pick a fence longer than any run in the source.
  const size = Math.max(3, ...Array.from(chart.matchAll(/`+/g), match => match[0].length + 1))
  const fence = '`'.repeat(size)
  return `\n\n${fence}mermaid\n${chart.replace(/\n$/, '')}\n${fence}\n\n`
}

const turndown = new TurndownService({
  headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-',
  // Atom nodes serialize as empty elements; Turndown checks blankness before custom rules.
  blankReplacement: (_content, node) => {
    const element = node as HTMLElement
    if (element.getAttribute?.('data-type') === 'mermaid') return mermaidFence(element)
    return (node as HTMLElement & { isBlock: boolean }).isBlock ? '\n\n' : ''
  },
})
turndown.use(gfm)
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
