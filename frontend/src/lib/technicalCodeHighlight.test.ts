import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { CODE_LIMIT, createCodeHighlighter, highlightCode } from './codeHighlight'
import { HighlightedCodeBlock, sourceCodeHighlighting } from './editorCodeHighlight'
import { createHtmlExport } from './htmlExport'
import { renderMappedMarkdown, toWysiwygHtml } from './markdown'

const owner = { documentId: 'fixture', revision: 0, generation: 1 }
const fixtures = [
  { label: 'java', keyword: 'class', code: 'public class Example { String text = "世界😀<tag>&"; }' },
  { label: 'pl', keyword: 'my', code: 'my $message = "Welt😀<tag>&";\nprint $message;' },
  { label: 'awk', keyword: 'BEGIN', code: 'BEGIN { print "Welt😀<tag>&"; }\n$1 ~ /test/ { print $0; }' },
  { label: 'CMake', keyword: 'message', code: 'cmake_minimum_required(VERSION 3.24)\nmessage(STATUS "Welt😀<tag>&")' },
]

describe('explicit technical code fences', () => {
  it.each(fixtures)('styles $label in both editors, Preview and offline HTML', async ({ label, keyword, code }) => {
    const source = `\`\`\`${label}\n${code}\n\`\`\`\n`
    const state = EditorState.create({ doc: source, extensions: [markdown(), sourceCodeHighlighting] })
    const keywordStart = source.indexOf(keyword, source.indexOf('\n'))
    let sourceKeyword = false
    state.field(sourceCodeHighlighting).decorations.between(keywordStart, keywordStart + keyword.length, (from, to, decoration) => {
      if (decoration.spec.class === 'hljs-keyword' && state.sliceDoc(from, to) === keyword) sourceKeyword = true
    })
    expect(sourceKeyword).toBe(true)
    expect(state.doc.toString()).toBe(source)

    const editor = new Editor({
      extensions: [StarterKit.configure({ codeBlock: false }), HighlightedCodeBlock],
      content: toWysiwygHtml(source),
    })
    try {
      const preview = renderMappedMarkdown(source, owner)
      const exported = await createHtmlExport(source)
      const outputs = [editor.view.dom, ...[preview.html, exported].map(html => new DOMParser().parseFromString(html, 'text/html'))]
      for (const output of outputs) {
        const fence = output.querySelector('pre > code')!
        expect(fence.textContent).toBe(`${code}\n`)
        expect([...fence.querySelectorAll('.hljs-keyword')].map(token => token.textContent)).toContain(keyword)
        expect(fence.querySelector('tag')).toBeNull()
      }
    } finally {
      editor.destroy()
    }
  })

  it('keeps the existing automatic candidates and plain fallback', () => {
    const perl = 'my $message = "Welt";'
    expect(highlightCode(perl, 'perl title="example"').ranges).toEqual(highlightCode(perl, 'pl').ranges)
    expect(highlightCode(perl, 'perl').ranges.length).toBeGreaterThan(0)
    for (const { label, code } of fixtures) {
      expect(['java', 'perl', 'awk', 'cmake']).not.toContain(highlightCode(code).language)
      expect(highlightCode(code, 'sed').ranges).toEqual([])
      expect(createCodeHighlighter(false)(code, label).ranges).toEqual([])
    }
    const code = 'class Example {}\n'.repeat(Math.ceil(CODE_LIMIT / 17) + 1)
    const source = `\`\`\`java\n${code}\`\`\`\n`
    const preview = new DOMParser().parseFromString(renderMappedMarkdown(source, owner).html, 'text/html')
    expect(preview.querySelector('pre > code')?.textContent).toBe(code)
    expect(preview.querySelector('[class*="hljs-"]')).toBeNull()
  })
})
