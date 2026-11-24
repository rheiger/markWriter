import { expect, it, vi } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { history, undo } from '@codemirror/commands'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState as PMEditorState } from '@tiptap/pm/state'
import { history as pmHistory, undo as pmUndo } from '@tiptap/pm/history'
import { codeHighlightKey, HighlightedCodeBlock, sourceCodeHighlighting } from './editorCodeHighlight'

const value = 'Zürich package cache requires local verification and retains the previous release for rollback. '.repeat(2)
const token = 'final_large_toml'
const largeToml = '[packages]\n' + Array.from({ length: 540 }, (_, index) => `package_${index} = "${value}"`).join('\n') +
  `\n${token} = true`

function fence(code: string) { return '~~~toml\n' + code + '\n~~~\n' }

function sourceEditor(source: string) {
  const state = EditorState.create({ doc: source, extensions: [markdown(), history(), sourceCodeHighlighting] })
  ensureSyntaxTree(state, source.length, 5000)
  return new EditorView({ state: state.update({}).state })
}

function richEditor(...blocks: string[]) {
  return new Editor({
    element: null,
    extensions: [StarterKit.configure({ codeBlock: false }), HighlightedCodeBlock],
    content: {
      type: 'doc',
      content: blocks.map(text => ({ type: 'codeBlock', attrs: { language: 'toml' }, content: [{ type: 'text', text }] })),
    },
  })
}

function richState(editor: Editor) {
  const plugin = editor.extensionManager.plugins.find(plugin => plugin.spec.key === codeHighlightKey)!
  return PMEditorState.create({ doc: editor.state.doc, plugins: [pmHistory(), plugin] })
}

async function settle(view: EditorView) {
  await vi.waitFor(() => expect(view.state.field(sourceCodeHighlighting).pendingToml).toBe(false))
}

function sourceToken(state: EditorState, key: string) {
  const start = state.doc.toString().lastIndexOf(key)
  expect(start).toBeGreaterThan(0)
  let found = false
  state.field(sourceCodeHighlighting).decorations.between(start, start + key.length, (from, to, decoration) => {
    if (from === start && to === start + key.length && decoration.spec.class === 'hljs-attr') found = true
  })
  return found
}

function richToken(state: PMEditorState, key: string) {
  const start = state.doc.lastChild!.textContent.lastIndexOf(key) + 1
  expect(start).toBeGreaterThan(0)
  return codeHighlightKey.getState(state)!.decorations.find(start, start + key.length)
    .some(decoration => decoration.from === start && decoration.to === start + key.length)
}

it('highlights large TOML through the final key in both live editors and preserves Undo', async () => {
  const bytes = new TextEncoder().encode(largeToml).length
  expect(bytes).toBeGreaterThan(101 * 1024)
  expect(bytes).toBeLessThan(120 * 1024)
  expect(largeToml.length).toBeGreaterThan(100 * 1024)
  const source = fence(largeToml)
  const view = sourceEditor(source)
  try {
    await settle(view)
    expect(sourceToken(view.state, token)).toBe(true)
    const from = source.indexOf(token)
    view.dispatch({ changes: { from, to: from + token.length, insert: 'changed_key' }, userEvent: 'input.type' })
    view.dispatch({ changes: { from, to: from + 'changed_key'.length, insert: 'edited_key' }, userEvent: 'input.type' })
    await settle(view)
    expect(sourceToken(view.state, 'edited_key')).toBe(true)
    expect(undo(view)).toBe(true)
    await settle(view)
    expect(view.state.doc.toString()).toBe(source)
    expect(sourceToken(view.state, token)).toBe(true)
  } finally { view.destroy() }

  const editor = richEditor(largeToml)
  try {
    const rich = richState(editor)
    expect(richToken(rich, token)).toBe(true)
    const from = largeToml.indexOf(token) + 1
    const edited = rich.apply(rich.tr.insertText('edited_key', from, from + token.length))
    expect(richToken(edited, 'edited_key')).toBe(true)
    let undone = edited
    expect(pmUndo(edited, tr => { undone = edited.apply(tr) })).toBe(true)
    expect(undone.doc.textContent).toBe(largeToml)
    expect(richToken(undone, token)).toBe(true)
  } finally { editor.destroy() }
})

it('preserves literal TOML and annotates dense, long-line, oversized and over-budget fences', async () => {
  const rejected = [
    ('# ' + '[,]'.repeat(600) + '\n').repeat(5) + 'dense_toml = true',
    `text = "${'x'.repeat(2048)}"`,
    '# x\n'.repeat(4097),
    ('# ' + 'x'.repeat(1022) + '\n').repeat(130),
  ]
  const blocks = [...rejected, largeToml, largeToml.replace(token, 'later_large_toml')]
  const source = blocks.map(fence).join('\n')
  const view = sourceEditor(source)
  try {
    await settle(view)
    const fallbackLines: number[] = []
    view.state.field(sourceCodeHighlighting).decorations.between(0, source.length, (from, _to, decoration) => {
      if (decoration.spec.attributes?.['data-toml-fallback']) fallbackLines.push(from)
    })
    expect(fallbackLines).toHaveLength(rejected.length + 1)
    expect(sourceToken(view.state, token)).toBe(true)
    expect(sourceToken(view.state, 'later_large_toml')).toBe(false)
    expect(view.state.doc.toString()).toBe(source)
  } finally { view.destroy() }

  const editor = richEditor(...blocks)
  try {
    const state = richState(editor)
    const decorations = codeHighlightKey.getState(state)!.decorations.find()
    let position = 0
    state.doc.forEach((node, _offset, index) => {
      expect(decorations.some(decoration => decoration.from === position && decoration.to === position + node.nodeSize))
        .toBe(index !== rejected.length)
      position += node.nodeSize
    })
    expect(state.doc.content.content.map(node => node.textContent)).toEqual(blocks)
  } finally { editor.destroy() }
})

it('discards pending TOML presentation when the editor changes documents or disables syntax', async () => {
  const source = fence(largeToml)
  const view = sourceEditor(source)
  const highlighting = new Compartment()
  try {
    expect(view.state.field(sourceCodeHighlighting).pendingToml).toBe(true)
    const next = '# Different tab\n\n~~~toml\nnext_key = true\n~~~\n'
    view.setState(EditorState.create({ doc: next, extensions: [markdown(), highlighting.of(sourceCodeHighlighting)] }))
    expect(sourceToken(view.state, 'next_key')).toBe(true)
    view.dispatch({ effects: highlighting.reconfigure([]) })
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(view.state.doc.toString()).toBe(next)
    expect(view.state.field(sourceCodeHighlighting, false)).toBeUndefined()
  } finally { view.destroy() }
})
