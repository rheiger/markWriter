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

it('uses safe fences for edited ordinary code containing closing backticks', () => {
  const source = fromWysiwygHtml('<pre><code>one\n```\ntwo</code></pre>')
  expect(source.startsWith('````')).toBe(true)
  expect(new DOMParser().parseFromString(toWysiwygHtml(source), 'text/html').querySelector('code')!.textContent).toBe('one\n```\ntwo\n')
})

it('escapes literal plus and tilde prefixes exactly once, including existing backslashes', () => {
  for (const text of ['+ list', '++underline++', '~~strike~~', '\\++literal++']) {
    const html = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>'
    const saved = fromWysiwygHtml(html)
    const doc = new DOMParser().parseFromString(toWysiwygHtml(saved), 'text/html')
    expect(doc.body.textContent!.trim()).toBe(text)
    expect(doc.querySelector('ul,ins,s')).toBeNull()
  }
})

describe('inline code whitespace fidelity', () => {
  const codeText = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector('code')?.textContent
  const codeHtml = (text: string) => {
    const code = document.createElement('code')
    code.textContent = text
    return `<p>before ${code.outerHTML} after</p>`
  }

  it('reproduces the repeated-space loss through the production codec', () => {
    const source = 'Before `alpha  beta` after'
    const saved = fromWysiwygHtml(toWysiwygHtml(source))
    expect(codeText(toWysiwygHtml(saved))).toBe('alpha  beta')
  })

  it.each([
    ['repeated spaces', 'a   b', 'a   b'],
    ['leading spaces', '  a', '  a'],
    ['trailing spaces', 'a  ', 'a  '],
    ['spaces on both sides', '  a  ', '  a  '],
    ['one space', ' ', ' '],
    ['all spaces', '   ', '   '],
    ['internal tabs', 'a\t\tb', 'a\t\tb'],
    ['tab edges', '\ta\t', '\ta\t'],
    ['all tabs', '\t\t', '\t\t'],
    ['mixed blank whitespace', ' \t ', ' \t '],
    ['line breaks', 'a\nb', 'a b'],
    ['line breaks and spaces', 'a\n  b', 'a   b'],
    ['a backtick', '`', '`'],
    ['backtick at each edge', '`a`', '`a`'],
    ['multiple backtick runs', 'a ` b `` c ``` d', 'a ` b `` c ``` d'],
    ['backticks and edge spaces', ' `a` ', ' `a` '],
  ])('serializes %s with CommonMark code-span semantics', (_label, text, expected) => {
    const saved = fromWysiwygHtml(codeHtml(text))
    expect(codeText(toWysiwygHtml(saved))).toBe(expected)
  })

  it.each([' ', '   ', '\t\t'])('retains a paragraph containing only whitespace code %j', text => {
    const code = document.createElement('code')
    code.textContent = text
    const saved = fromWysiwygHtml(`<p>${code.outerHTML}</p>`)
    expect(codeText(toWysiwygHtml(saved))).toBe(text)
  })

  it.each([
    ['heading', '<h2><code>   </code></h2>', 'h2 code'],
    ['blockquote', '<blockquote><p><code>   </code></p></blockquote>', 'blockquote code'],
    ['list', '<ul><li><p><code>   </code></p></li></ul>', 'ul li code'],
    ['table', '<table><tr><th>Heading</th></tr><tr><td><p><code>   </code></p></td></tr></table>', 'td code'],
  ])('retains whitespace-only inline code within a %s', (_label, html, selector) => {
    const saved = fromWysiwygHtml(html)
    const doc = new DOMParser().parseFromString(toWysiwygHtml(saved), 'text/html')
    expect(doc.querySelector(selector)?.textContent).toBe('   ')
  })

  it('retains prose spacing on both sides of code that has edge spaces', () => {
    const saved = fromWysiwygHtml('<p>before <code> a </code> after</p>')
    const doc = new DOMParser().parseFromString(toWysiwygHtml(saved), 'text/html')
    expect(doc.querySelector('p')?.textContent).toBe('before  a  after')
    expect(doc.querySelector('code')?.textContent).toBe(' a ')
  })

  it('chooses an unused backtick run and pads edge backticks', () => {
    expect(fromWysiwygHtml(codeHtml('`a`'))).toBe('before `` `a` `` after')
    expect(fromWysiwygHtml(codeHtml('a ` b `` c ``` d'))).toBe('before ````a ` b `` c ``` d```` after')
    expect(fromWysiwygHtml(codeHtml('a ` b ``` c'))).toBe('before ``a ` b ``` c`` after')
  })

  it('preserves semantic code content when CommonMark strips edge padding and normalizes newlines', () => {
    for (const [source, expected] of [
      ['`  a  `', ' a '],
      ['`   `', '   '],
      ['`` `x` ``', '`x`'],
      ['`a\nb`', 'a b'],
    ]) {
      const html = toWysiwygHtml(source)
      expect(codeText(html)).toBe(expected)
      expect(codeText(toWysiwygHtml(fromWysiwygHtml(html)))).toBe(expected)
    }
  })

  it('does not preserve repeated ordinary prose whitespace', () => {
    expect(fromWysiwygHtml('<p>ordinary   prose <code>a  b</code> after   text</p>')).toBe('ordinary prose `a  b` after text')
  })
})
