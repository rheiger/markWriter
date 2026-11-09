import { describe, expect, it } from 'vitest'
import { highlightCode } from './codeHighlight'

describe('explicit SQL highlighting', () => {
  it.each([4095, 4096, 4097, 6900])('styles the final token at %i UTF-16 units', length => {
    const code = '-- padding\n'.repeat(Math.ceil(length / 11)).slice(0, length - 7) + '\nSELECT'
    expect(code).toHaveLength(length)
    const result = highlightCode(code, 'sql')
    expect(result.ranges.some(range => range.from <= length - 6 && range.to === length)).toBe(true)
  })
})

import { createCodeHighlighter, createQuickLookHighlighter, highlightedHtml, SQL_CODE_LIMIT } from './codeHighlight'
import { renderMarkdownHtml } from './markdown'
import { createHtmlExport } from './htmlExport'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { history, undo } from '@codemirror/commands'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { codeHighlightKey, HighlightedCodeBlock, sourceCodeHighlighting } from './editorCodeHighlight'

const sqlFixture = (multibyte = false) => Array.from({ length: 1170 }, (_, n) =>
  `INSERT INTO records VALUES (${n}, '${multibyte ? 'Grüezi 世界 ' : 'representative value '}${'x'.repeat(38)}');`,
).join('\n') + "\n/* a comment\nSELECT not_a_keyword */\nSELECT 'multi\nline <script>&' AS final_sentinel;"

function hasClass(code: string, token: string, className: string) {
  const from = code.indexOf(token)
  return highlightCode(code, 'sql').ranges.some(range => range.from <= from && range.to >= from + token.length && range.className.includes(className))
}

describe('bounded larger SQL fences', () => {
  it.each([false, true])('retains final tokens and multiline lexical state, multibyte=%s', multibyte => {
    const code = sqlFixture(multibyte)
    expect(new TextEncoder().encode(code).length).toBeGreaterThan(100 * 1024)
    expect(code.length).toBeLessThan(SQL_CODE_LIMIT)
    expect(hasClass(code, 'not_a_keyword', 'hljs-comment')).toBe(true)
    expect(hasClass(code, 'line <script>&', 'hljs-string')).toBe(true)
    const final = code.lastIndexOf('AS final_sentinel')
    expect(highlightCode(code, 'sql').ranges.some(r => r.from === final && r.className.includes('keyword'))).toBe(true)
    const el = document.createElement('code'); el.innerHTML = highlightedHtml(code, createQuickLookHighlighter()(code, 'sql'))
    expect(el.textContent).toBe(code)
    expect(el.querySelector('script')).toBeNull()
  })

  it('decorates both editors and preserves text through one Undo', () => {
    const code = sqlFixture(), source = '```sql\n' + code + '\n```'
    let state = EditorState.create({doc:source, extensions:[markdown(), history(), sourceCodeHighlighting]})
    ensureSyntaxTree(state, source.length, 5000); state = state.update({}).state
    const end = source.lastIndexOf('AS final_sentinel')
    let found = false; state.field(sourceCodeHighlighting).between(end, end+2, () => { found = true })
    expect(found).toBe(true)
    const changed = state.update({changes:{from:end,insert:'x'}, userEvent:'input'}).state
    let restored = changed; expect(undo({state:changed, dispatch:tr => { restored = tr.state }})).toBe(true)
    expect(restored.doc.toString()).toBe(source)
    const editor = new Editor({extensions:[StarterKit.configure({codeBlock:false}),HighlightedCodeBlock], content:{type:'doc',content:[{type:'codeBlock',attrs:{language:'sql'},content:[{type:'text',text:code}]}]}})
    try {
      expect(codeHighlightKey.getState(editor.state)!.decorations.find(code.lastIndexOf('AS final_sentinel') + 1, code.lastIndexOf('AS final_sentinel') + 3).length).toBeGreaterThan(0)
      editor.commands.insertContentAt(2, 'x'); expect(editor.commands.undo()).toBe(true)
      expect(editor.state.doc.textContent).toBe(code)
    } finally { editor.destroy() }
  }, 30000)

  it('preserves and safely escapes Preview and self-contained export including the final token', async () => {
    const code=sqlFixture(), source='```sql\n'+code+'\n```'
    for (const html of [renderMarkdownHtml(source), await createHtmlExport(source)]) {
      const doc=new DOMParser().parseFromString(html,'text/html'), node=doc.querySelector('pre > code')!
      expect(node.textContent).toBe(code+'\n')
      expect([...node.querySelectorAll('.hljs-keyword')].some(el => el.textContent === 'AS')).toBe(true)
      expect(node.querySelector('script')).toBeNull()
    }
  })

  it('falls back to exact literal text above the input, line, span, and aggregate budgets', () => {
    const over=('-- a\n'.repeat(Math.ceil(SQL_CODE_LIMIT/5))).slice(0,SQL_CODE_LIMIT+1)
    for (const code of [over, 'x'.repeat(2049), 'SELECT 1;\n'.repeat(13000)]) {
      const result=highlightCode(code,'sql')
      expect(result.ranges).toEqual([])
      expect(result.fallback).toBe(true)
      const el=document.createElement('code'); el.innerHTML=highlightedHtml(code,result); expect(el.textContent).toBe(code)
    }
    const atLimit = (('-- ' + 'x'.repeat(100) + '\n').repeat(Math.ceil(SQL_CODE_LIMIT / 104))).slice(0, SQL_CODE_LIMIT - 7) + '\nSELECT'
    expect(atLimit).toHaveLength(SQL_CODE_LIMIT)
    expect(highlightCode(atLimit, 'sql').ranges.some(r => r.to === atLimit.length)).toBe(true)
    for (const hostile of ["SELECT '" + '<script>&'.repeat(100) + '\n', '/* ' + 'SELECT '.repeat(100) + '\n']) {
      const el = document.createElement('code'); el.innerHTML = highlightedHtml(hostile, highlightCode(hostile, 'sql'))
      expect(el.textContent).toBe(hostile); expect(el.querySelector('script')).toBeNull()
    }
    const highlight=createCodeHighlighter(true), code=sqlFixture()
    expect(highlight(code,'sql').ranges.length).toBeGreaterThan(0)
    expect(highlight(code,'sql').fallback).toBe(true)
    expect(highlight('const x = 1;', 'js').ranges.length).toBeGreaterThan(0)
  })
})

it('explains SQL fallback on both editors, Preview, and export without changing text', async () => {
  const code = 'SELECT 1;\n' + 'x'.repeat(2049) + '\n', source = '```sql\n' + code + '```'
  expect(highlightCode(code, 'sql').fallback).toBe(true)
  expect(createCodeHighlighter(false)(code, 'sql').fallback).toBeUndefined()
  let state = EditorState.create({doc:source,extensions:[markdown(),sourceCodeHighlighting]})
  ensureSyntaxTree(state,source.length,1000); state=state.update({}).state
  let explained = false
  state.field(sourceCodeHighlighting).between(0,source.length,(_from,_to,value) => {
    if (value.spec.attributes?.['aria-description']) explained = true
  })
  expect(explained).toBe(true)
  expect(state.doc.toString()).toBe(source)
  const editor = new Editor({extensions:[StarterKit.configure({codeBlock:false}),HighlightedCodeBlock],content:{type:'doc',content:[{type:'codeBlock',attrs:{language:'sql'},content:[{type:'text',text:code}]}]}})
  try {
    const pre=editor.view.dom.querySelector('pre')!
    expect(pre.getAttribute('aria-description')).toContain('original text is preserved')
    expect(pre.textContent).toBe(code)
    expect(editor.state.doc.textContent).toBe(code)
  } finally { editor.destroy() }
  for (const html of [renderMarkdownHtml(source), await createHtmlExport(source)]) {
    const doc=new DOMParser().parseFromString(html,'text/html'), pre=doc.querySelector('pre')!
    expect(pre.getAttribute('aria-description')).toContain('original text is preserved')
    expect(pre.querySelector('code')!.textContent).toBe(code)
  }
})
