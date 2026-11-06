import { elementFromString, getSchema } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser, Fragment, Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { createInlineCodeClipboardParser, parseInlineCodeDocument } from './inlineCodeParser'

const schema = getSchema([StarterKit])

function codeTexts(doc: ProseMirrorNode): string[] {
  const result: string[] = []
  doc.descendants(node => {
    if (node.isText && node.marks.some(mark => mark.type.name === 'code')) result.push(node.text!)
  })
  return result
}

describe('inline code DOM parser', () => {
  it('preserves code whitespace at paragraph edges, including all-whitespace spans', () => {
    const html = '<p>ordinary   prose <code>a  b</code> <code>a\tb</code> <code>   </code></p><p><code> tail </code></p>'
    const doc = parseInlineCodeDocument(html, schema)
    expect(codeTexts(doc)).toEqual(['a  b', 'a\tb', '   ', ' tail '])
    expect(doc.firstChild?.firstChild?.text).toBe('ordinary prose ')
  })

  it('handles whitespace-only code inside headings, quotes and lists', () => {
    const html = '<h2><code>  </code></h2><blockquote><p><code>\t</code></p></blockquote><ul><li><p><code>   </code></p></li></ul>'
    const doc = parseInlineCodeDocument(html, schema)
    expect(codeTexts(doc)).toEqual(['  ', '\t', '   '])
    expect(doc.child(0).type.name).toBe('heading')
    expect(doc.child(1).type.name).toBe('blockquote')
    expect(doc.child(2).type.name).toBe('bulletList')
  })

  it('matches ordinary Tiptap parsing for documents without inline code', () => {
    const html = '<h2>  A    heading  </h2>\n<p> A <strong>  bold   phrase </strong> and   prose<br> after </p>\n<ul>\n<li><p> one </p></li>\n<li><p> two </p></li>\n</ul><pre><code>  block\n  text\n</code></pre>'
    const expected = ProseMirrorDOMParser.fromSchema(schema).parse(elementFromString(html))
    expect(parseInlineCodeDocument(html, schema).toJSON()).toEqual(expected.toJSON())
  })

  it('keeps arbitrary private-use characters and strings resembling internal markers', () => {
    const value = '\uE0000\uE001s \uE0001\uE001t \uE0002\uE001s\t\uE000\uE001'
    const code = document.createElement('code')
    code.textContent = value
    const doc = parseInlineCodeDocument(`<p>${code.outerHTML}</p><p>\uE0003\uE001s</p>`, schema)
    expect(codeTexts(doc)).toEqual([value])
    expect(doc.child(1).textContent).toBe('\uE0003\uE001s')
  })

  it('does not confuse user text with a marker when ignored DOM is removed', () => {
    const input = document.createElement('div')
    input.innerHTML = '<p><code>\uE000</code><script>ignored</script><code>0\uE001s </code></p>'
    const slice = createInlineCodeClipboardParser(schema).parseSlice(input)
    const doc = schema.topNodeType.create(null, slice.content)
    expect(codeTexts(doc)).toEqual(['\uE0000\uE001s '])
  })

  it('preserves content even when every private-use code point already appears', () => {
    const ranges = [[0xE000, 0xF8FF], [0xF0000, 0xFFFFD], [0x100000, 0x10FFFD]]
    const characters: string[] = []
    for (const [first, last] of ranges) {
      for (let point = first; point <= last; point++) characters.push(String.fromCodePoint(point))
    }
    const value = `${characters.join('')}  end`
    const code = document.createElement('code')
    code.textContent = value
    expect(codeTexts(parseInlineCodeDocument(`<p>${code.outerHTML}</p>`, schema))).toEqual([value])
  })

  it('handles long whitespace runs without a token per character', () => {
    const value = `a${' '.repeat(200_000)}b`
    const code = document.createElement('code')
    code.textContent = value
    expect(codeTexts(parseInlineCodeDocument(`<p>${code.outerHTML}</p>`, schema))).toEqual([value])
  })

  it('avoids marker collisions with values used by schema parse rules', () => {
    const echoSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }] },
        echo: { group: 'block', content: 'text*', parseDOM: [{
          tag: 'div[data-copy]',
          getContent: (node, schema) => Fragment.from(schema.text((node as HTMLElement).getAttribute('data-copy')!)),
        }] },
        text: { group: 'inline' },
      },
      marks: { code: { parseDOM: [{ tag: 'code' }] } },
    })
    const literal = '\uE0000\uE001s'
    const doc = parseInlineCodeDocument(`<p><code>  a  </code></p><div data-copy="${literal}"></div>`, echoSchema)
    expect(codeTexts(doc)).toEqual(['  a  '])
    expect(doc.child(1).textContent).toBe(literal)
  })

  it('retains newline-only inline code and keeps real code blocks unchanged', () => {
    const doc = parseInlineCodeDocument('<p><code>\n</code></p><pre><code>  block\n  text\n</code></pre>', schema)
    expect(codeTexts(doc)).toEqual([' '])
    expect(doc.child(1).textContent).toBe('  block\n  text\n')
  })

  it('parses HTML clipboard slices without modifying the input DOM', () => {
    const input = document.createElement('div')
    input.innerHTML = '<p>before <code> a  b </code> after</p><p><code>   </code></p>'
    const before = input.innerHTML
    const slice = createInlineCodeClipboardParser(schema).parseSlice(input)
    const doc = schema.topNodeType.create(null, slice.content)
    expect(codeTexts(doc)).toEqual([' a  b ', '   '])
    expect(input.innerHTML).toBe(before)
  })

  it('normalizes line endings inside pasted inline code to CommonMark spaces', () => {
    const input = document.createElement('div')
    input.innerHTML = '<p><code>a\n  b</code></p>'
    const slice = createInlineCodeClipboardParser(schema).parseSlice(input)
    const doc = schema.topNodeType.create(null, slice.content)
    expect(codeTexts(doc)).toEqual(['a   b'])
  })

  it('honors the clipboard parser range and preserves text adjacent to code', () => {
    const input = document.createElement('div')
    input.innerHTML = '<p>ignored</p><p> a   <code>  x  </code>   b </p><p>ignored</p>'
    const slice = createInlineCodeClipboardParser(schema).parseSlice(input, { from: 1, to: 2 })
    const doc = schema.topNodeType.create(null, slice.content)
    expect(codeTexts(doc)).toEqual(['  x  '])
    expect(doc.textContent).toBe('a   x   b')
  })
})
