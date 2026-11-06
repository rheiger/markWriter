import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { createCodeHighlighter, highlightCode, highlightedHtml } from './codeHighlight'
import { HighlightedCodeBlock, codeHighlightKey, sourceCodeHighlighting } from './editorCodeHighlight'
import { renderMarkdownHtml } from './markdown'
import { createHtmlExport } from './htmlExport'

// Synthetic technical document: same block sizes/order as the reported case,
// without copying user document contents into the repository.
const python = Array.from({ length: 127 }, (_, n) => `value_${n} = score(image_${n}, weight=0.75)`).join('\n')
const json = (lines: number) => JSON.stringify(Object.fromEntries(Array.from({ length: lines - 2 }, (_, n) => [`image_${n}`, `score_${n}`])), null, 2)
const blocks = [
  ['python', python], ['json', json(33)], ['json', json(40)], ['json', json(17)],
  ['json', json(443)], ['json', json(289)],
] as const
const source = blocks.map(([language, code]) => `\`\`\`${language}\n${code}\n\`\`\``).join('\n\n')

describe('long explicit Python and JSON highlighting', () => {
  it('highlights the full document in order and preserves every code character', () => {
    const highlight = createCodeHighlighter(true)
    for (const [language, code] of blocks) {
      const result = highlight(code, language)
      expect(result.language).toBe(language)
      expect(result.ranges.length).toBeGreaterThan(0)
      const el = document.createElement('code'); el.innerHTML = highlightedHtml(code, result)
      expect(el.textContent).toBe(code)
    }
  })

  it('decorates every block in both editors without changing source or document', () => {
    let state = EditorState.create({ doc: source, extensions: [markdown(), sourceCodeHighlighting] })
    ensureSyntaxTree(state, source.length, 1000)
    state = state.update({}).state
    const marks = state.field(sourceCodeHighlighting)
    let offset = 0
    for (const [language, code] of blocks) {
      const from = source.indexOf(`\`\`\`${language}\n`, offset), to = from + language.length + 4 + code.length
      let count = 0; marks.between(from, to, () => { count++ })
      expect(count).toBeGreaterThan(0); offset = to
    }
    expect(state.doc.toString()).toBe(source)

    const editor = new Editor({ extensions: [StarterKit.configure({ codeBlock: false }), HighlightedCodeBlock],
      content: { type: 'doc', content: blocks.map(([language, text]) => ({ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] })) } })
    try {
      const before = editor.getJSON()
      const decorated = codeHighlightKey.getState(editor.state)!.decorations
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'codeBlock') expect(decorated.find(pos + 1, pos + node.nodeSize - 1).length).toBeGreaterThan(0)
      })
      expect(editor.getJSON()).toEqual(before)
    } finally { editor.destroy() }
  })

  it('highlights Preview and self-contained export, and honors the disabled setting', async () => {
    for (const html of [renderMarkdownHtml(source), await createHtmlExport(source)]) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const nodes = [...doc.querySelectorAll('pre > code')]
      expect(nodes).toHaveLength(blocks.length)
      nodes.forEach((node, n) => {
        expect(node.querySelector('span')).not.toBeNull()
        expect(node.textContent).toBe(blocks[n][1] + '\n')
      })
    }
    expect(renderMarkdownHtml(source, false)).not.toContain('class="hljs-')
  })

  it('retains conservative bounds for automatic detection, other grammars and oversized input', () => {
    expect(highlightCode(python).ranges).toEqual([])
    expect(highlightCode(python, 'cpp').ranges).toEqual([])
    expect(highlightCode('x'.repeat(16 * 1024 + 1), 'python').ranges).toEqual([])
    expect(highlightCode('"'.repeat(2049), 'json').ranges).toEqual([])
    const highlight = createCodeHighlighter(true)
    const large = json(443)
    expect(highlight(large, 'json').ranges.length).toBeGreaterThan(0)
    expect(highlight(large, 'json').ranges.length).toBeGreaterThan(0)
    expect(highlight(large, 'json').ranges).toEqual([])
    expect(highlight('const answer = 42;', 'js').ranges.length).toBeGreaterThan(0)
    // An individually ineligible block must not consume a document's lexer budget.
    const fresh = createCodeHighlighter(true)
    fresh('x'.repeat(17 * 1024), 'python')
    for (const [language, code] of blocks) expect(fresh(code, language).ranges.length).toBeGreaterThan(0)
    expect(highlightCode(python, 'py title="score"').language).toBe('python')
    const boundary = '{"valid": true}\n'.padEnd(16 * 1024, '\n')
    expect(highlightCode(boundary, 'json').ranges.length).toBeGreaterThan(0)
    expect(highlightCode(boundary + '\n', 'json').ranges).toEqual([])
    const separate = createCodeHighlighter(true)
    const ordinary = 'const answer = 42;\n' + '// padding\n'.repeat(360)
    for (let n = 0; n < 4; n++) expect(separate(ordinary, 'js').ranges.length).toBeGreaterThan(0)
    expect(separate(ordinary, 'js').ranges).toEqual([])
    expect(separate(python, 'python').ranges.length).toBeGreaterThan(0)
  })
})
