import { describe, expect, it } from 'vitest'
import { renderQuickLookMarkdown } from './quickLookMarkdown'

const parse = (source: string) => new DOMParser().parseFromString(renderQuickLookMarkdown(source), 'text/html')

describe('Quick Look Markdown', () => {
  it('renders tables, inline formatting, links and reference links in one document', () => {
    const document = parse('| Name | Detail |\n| --- | --- |\n| **Bold** | [label][ref] and `code` |\n\n[ref]: https://example.test/path')
    expect(document.querySelectorAll('table th')).toHaveLength(2)
    expect(document.querySelector('td strong')?.textContent).toBe('Bold')
    expect(document.querySelector('td code')?.textContent).toBe('code')
    expect(document.querySelector('td:nth-child(2)')?.textContent).toContain('label')
    expect(document.querySelector('a, [href], [src]')).toBeNull()
  })
  it('preserves fenced code for diagram and highlighting, including nested and tilde fences', () => {
    const document = parse('> ~~~mermaid extra\n> graph TD\n> A-->B\n> ~~~\n\n```python\nprint("hi")\n```')
    const code = document.querySelectorAll('pre > code')
    expect(code[0].getAttribute('data-language')).toBe('mermaid')
    expect(code[0].textContent).toBe('graph TD\nA-->B\n')
    expect(code[1].getAttribute('data-language')).toBe('python')
  })
  it('keeps untrusted HTML, images and dangerous destinations inert', () => {
    const document = parse('<img src=x onerror=alert(1)>\n\n![alt <text>](https://example.test/x) [safe](javascript:alert(1)) [link](https://example.test)')
    expect(document.querySelector('img, a, script, [src], [href], [onerror]')).toBeNull()
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(document.body.textContent).toContain('alt <text>')
    expect(document.body.textContent).toContain('link')
  })
})
