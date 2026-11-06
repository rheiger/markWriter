import { it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState } from '@codemirror/state'
import { renderMappedMarkdown, renderMarkdownHtml, toWysiwygHtml, fromWysiwygHtml } from './markdown'
import { DotNode } from '../extensions/DotNode'
import { findEmbeddedSource } from './sourceFolds'

it('keeps DOT aliases, escapes, long fences and payload in opaque nodes across rendered edits', () => {
  const fence = '~~~~graphviz\r\ndigraph { a [label="Grüße < & \\"漢\\" ```"]; a -> b }\r\n~~~~'
  const source = '# Before\r\n\r\n' + fence + '\r\n'
  const editor = new Editor({ extensions: [StarterKit, DotNode], content: toWysiwygHtml(source) })
  expect(editor.state.doc.firstChild?.type.name).toBe('heading')
  expect(editor.state.doc.lastChild?.type.name).toBe('dot')
  expect(editor.state.doc.lastChild?.attrs.notation).toBe('graphviz')
  editor.commands.insertContentAt(2, 'edit')
  expect(fromWysiwygHtml(editor.getHTML())).toContain(fence)
  editor.destroy()
})
it('treats DOT and Graphviz SVG as block fallbacks and folds source without text maps', () => {
  for (const notation of ['dot', 'graphviz']) {
    const source = `\`\`\`${notation}\ndigraph {a -> b}\n\`\`\`\n`
    expect(renderMarkdownHtml(source)).toContain('data-type="dot"')
    const map = renderMappedMarkdown(source, { documentId: 'A', revision: 2, generation: 3 })
    expect(map.blocks).toHaveLength(1); expect(map.segments).toHaveLength(0)
    expect(findEmbeddedSource(EditorState.create({ doc: source }))[0].kind).toBe('DOT')
  }
})
it('does not duplicate enclosing blockquote prefixes after an unrelated rendered edit', () => {
  const source='Before\n\n> ~~~~graphviz\n> digraph {a -> b}\n> ~~~~\n'
  const editor=new Editor({extensions:[StarterKit,DotNode],content:toWysiwygHtml(source)})
  editor.commands.insertContentAt(1,'Edit ')
  const html=toWysiwygHtml(fromWysiwygHtml(editor.getHTML()))
  const doc=new DOMParser().parseFromString(html,'text/html')
  expect(doc.querySelectorAll('blockquote')).toHaveLength(1)
  expect(doc.querySelector('blockquote [data-type="dot"]')?.getAttribute('data-chart')).toBe('digraph {a -> b}\n')
  editor.destroy()
})

it.each(['dot','graphviz'])('closes an unmatched %s fence before subsequently inserted rendered prose', notation => {
  const editor=new Editor({extensions:[StarterKit,DotNode],content:toWysiwygHtml(`Before\n\n~~~~${notation}\ndigraph {a -> b}\n`)})
  editor.commands.insertContentAt(editor.state.doc.content.size,'<p>New rendered paragraph.</p>')
  const doc=new DOMParser().parseFromString(toWysiwygHtml(fromWysiwygHtml(editor.getHTML())),'text/html')
  expect(doc.querySelector('[data-type=dot]')?.getAttribute('data-chart')).toBe('digraph {a -> b}\n')
  expect(Array.from(doc.querySelectorAll('p')).map(p=>p.textContent)).toContain('New rendered paragraph.')
  editor.destroy()
})

it('keeps CR-only fence metadata separate from subsequent prose after a rendered edit', () => {
  const source='```dot\rdigraph {a -> b}\r```\r\rAfter'
  const editor=new Editor({extensions:[StarterKit,DotNode],content:toWysiwygHtml(source)})
  editor.commands.insertContentAt(editor.state.doc.content.size,'<p>New rendered paragraph.</p>')
  const doc=new DOMParser().parseFromString(toWysiwygHtml(fromWysiwygHtml(editor.getHTML())),'text/html')
  expect(doc.querySelector('[data-type=dot]')?.getAttribute('data-chart')).toBe('digraph {a -> b}\n')
  expect(Array.from(doc.querySelectorAll('p')).map(p=>p.textContent)).toEqual(['After','New rendered paragraph.'])
  editor.destroy()
})

it('does not let stale raw-fence metadata override a changed chart', () => {
  const atom=document.createElement('div')
  atom.setAttribute('data-type','dot');atom.setAttribute('data-chart','digraph {new -> chart}\n')
  atom.setAttribute('data-source-fence',JSON.stringify('```dot\ndigraph {old -> chart}\n```'))
  const doc=new DOMParser().parseFromString(toWysiwygHtml(fromWysiwygHtml(atom.outerHTML)),'text/html')
  expect(doc.querySelector('[data-type=dot]')?.getAttribute('data-chart')).toBe('digraph {new -> chart}\n')
})
