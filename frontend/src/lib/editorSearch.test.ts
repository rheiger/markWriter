import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { findLiteral, renderedHits, replaceRendered } from './editorSearch'

describe('literal search adapters', () => {
  it('preserves Unicode offsets, case/whole-word and multiline source', () => {
    expect(findLiteral('😀 Same sameish SAME\nline', { query: 'same', caseSensitive: false, wholeWord: true })).toEqual([{ from: 3, to: 7 }, { from: 16, to: 20 }])
    expect(findLiteral('x\ny x\ny', { query: 'x\ny', caseSensitive: true, wholeWord: false })).toHaveLength(2)
    expect(findLiteral('Été été', { query: 'été', caseSensitive: false, wholeWord: true })).toHaveLength(2)
  })
  it('searches across marks within blocks and preserves marks and block structure with one-step undo', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p><strong>sa</strong>me <strong>same</strong></p><p>same</p>' })
    const snapshot = renderedHits(editor.state.doc, { query: 'same', caseSensitive: false, wholeWord: false })
    expect(snapshot.hits).toHaveLength(3)
    expect(replaceRendered(editor, snapshot, snapshot.hits, 'new')).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>new</strong> <strong>new</strong></p><p>new</p>')
    editor.commands.undo()
    expect(editor.getHTML()).toBe('<p><strong>sa</strong>me <strong>same</strong></p><p>same</p>')
    expect(renderedHits(editor.state.doc, { query: 'same\nsame', caseSensitive: false, wholeWord: false }).hits).toHaveLength(0)
    editor.commands.insertContentAt(1, 'changed')
    expect(replaceRendered(editor, snapshot, snapshot.hits, 'stale')).toBe(false)
    editor.destroy()
  })
})

describe('regex editor transactions', () => {
  it('replaces captures across marks atomically and rejects stale rendered snapshots', async () => {
    const { executeRegex, expandReplacement } = await import('./regexSearch')
    const { renderedSegments } = await import('./editorSearch')
    const editor = new Editor({ extensions: [StarterKit], content: '<p><strong>a</strong>b ab</p><p>ab</p>' })
    const doc = editor.state.doc
    const result = executeRegex({ pattern: '(a)(b)', caseSensitive: true, wholeWord: false, segments: renderedSegments(doc) })
    expect(result.hits).toHaveLength(3)
    expect(replaceRendered(editor, { doc, hits: result.hits }, result.hits, hit => expandReplacement('$2$1', hit as typeof result.hits[number]))).toBe(true)
    expect(editor.getText()).toBe('ba ba\n\nba')
    expect(replaceRendered(editor, { doc, hits: result.hits }, result.hits, 'stale')).toBe(false)
    editor.commands.undo()
    expect(editor.getText()).toBe('ab ab\n\nab')
    editor.destroy()
  })
})
