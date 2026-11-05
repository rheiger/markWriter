import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language'
import { findEmbeddedSource, embeddedSourceFolds } from './sourceFolds'
const chart = 'Before\n\n```mermaid\nflowchart TD\n A --> B\n```\n\nAfter'
it('finds only complete Mermaid and long image payloads, retaining short references and incomplete fences', () => {
  const image = `![x](data:image/png;base64,${'ABCD'.repeat(100)})`
  const state = EditorState.create({ doc: chart + '\n' + image + '\n![short](x.png)\n```mermaid\nincomplete' })
  expect(findEmbeddedSource(state)).toHaveLength(2)
  expect(findEmbeddedSource(state)[1].kind).toBe('image/png base64')
})
it('folding/unfolding, mapped edits and selected search matches preserve canonical bytes', () => {
  let state = EditorState.create({ doc: chart, extensions: [embeddedSourceFolds()] })
  const range = findEmbeddedSource(state)[0]
  state = state.update({ effects: foldEffect.of(range) }).state
  expect(state.doc.toString()).toBe(chart)
  expect(foldedRanges(state).size).toBe(1)
  state = state.update({ changes: { from: 0, insert: 'X' } }).state
  expect(foldedRanges(state).iter().from).toBe(range.from + 1)
  state = state.update({ selection: { anchor: range.from + 6 } }).state
  expect(foldedRanges(state).size).toBe(0)
  expect(state.doc.toString()).toBe('X' + chart)
  state = state.update({ effects: [foldEffect.of({ from: range.from + 1, to: range.to + 1 }), unfoldEffect.of({ from: range.from + 1, to: range.to + 1 })] }).state
  expect(state.doc.toString()).toBe('X' + chart)
})
