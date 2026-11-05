import { describe, expect, it } from 'vitest'
import { fromWysiwygHtml, renderMarkdownHtml, toWysiwygHtml } from './markdown'

describe('Markdown parsing and serialization boundaries', () => {
  it('accepts tilde Mermaid fences and CRLF input', () => {
    const doc = new DOMParser().parseFromString(toWysiwygHtml('~~~mermaid\r\nflowchart TD\r\n A --> B\r\n~~~'), 'text/html')
    expect(doc.querySelector('[data-type="mermaid"]')?.getAttribute('data-chart')).toContain('A --> B')
  })
  it('does not expose raw HTML markup in Preview', () => {
    const doc = new DOMParser().parseFromString(renderMarkdownHtml('<img src=x onerror="alert(1)">'), 'text/html')
    expect(doc.querySelector('img')).toBeNull()
  })
  it('preserves empty atom source and uses a safe Mermaid fence length', () => {
    const source = 'flowchart TD\n A["```"] --> B'
    const el = document.createElement('div')
    el.setAttribute('data-type', 'mermaid')
    el.setAttribute('data-chart', source)
    const result = fromWysiwygHtml(el.outerHTML)
    expect(result).toContain(source)
    expect(result.startsWith('````mermaid')).toBe(true)
  })
  it('retains a table cell line break over conversion', () => {
    const source = fromWysiwygHtml('<table><tr><th>Heading</th></tr><tr><td><p>First</p><p>Second</p></td></tr></table>')
    const doc = new DOMParser().parseFromString(toWysiwygHtml(source), 'text/html')
    expect(doc.querySelector('td br')).not.toBeNull()
  })

})
