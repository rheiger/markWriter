import { describe, expect, it } from 'vitest'
import { EditorState, NodeSelection } from '@tiptap/pm/state'
import { Schema } from '@tiptap/pm/model'
import { history, undo, redo, closeHistory, redoDepth, undoDepth } from '@tiptap/pm/history'
import { captureRenderedEngine, restoreRenderedEngine } from './renderedHistoryTransfer'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    atom: { group: 'block', atom: true },
  },
  marks: { strong: {} },
})
const plugins = [history()]
const roundTrip = (state: EditorState) => restoreRenderedEngine(schema, JSON.parse(JSON.stringify(captureRenderedEngine(state))), plugins)
function advance(state: EditorState, command: typeof undo) {
  let next = state
  expect(command(state, transaction => { next = state.apply(transaction) })).toBe(true)
  return next
}

describe('rendered plugin history codec', () => {
  it('preserves the bookmark and remaps Undo around non-history document changes', () => {
    const paragraph = schema.node('paragraph', null, schema.text('original'))
    const doc = schema.node('doc', null, [paragraph, schema.node('atom')])
    let source = EditorState.create({ schema, doc, plugins, selection: NodeSelection.create(doc, paragraph.nodeSize) })
    source = source.apply(closeHistory(source.tr.insertText('first ', 1)))
    source = source.apply(closeHistory(source.tr.insertText('second ', 1)))
    source = source.apply(source.tr.insertText('untracked ', 1).setMeta('addToHistory', false))
    source = advance(source, undo)
    let destination = roundTrip(source)
    expect(destination.doc.eq(source.doc)).toBe(true)
    expect(destination.selection.eq(source.selection)).toBe(true)
    expect(undoDepth(destination)).toBe(1)
    expect(redoDepth(destination)).toBe(1)
    for (const command of [undo, redo, redo]) {
      destination = advance(destination, command)
      source = advance(source, command)
      expect(destination.doc.eq(source.doc)).toBe(true)
      expect(destination.selection.toJSON()).toEqual(source.selection.toJSON())
      expect(destination.doc.textContent).toContain('untracked')
    }
  })

  it('preserves pending stored marks without manufacturing a history event', () => {
    const source = EditorState.create({ schema, plugins })
    const marked = source.apply(source.tr.addStoredMark(schema.mark('strong')))
    const destination = roundTrip(marked)
    expect(destination.storedMarks).toEqual(marked.storedMarks)
    expect(undoDepth(destination)).toBe(0)
    expect(redoDepth(destination)).toBe(0)
  })
})
