import { it, expect } from 'vitest'
import { ChangeSet } from '@codemirror/state'
import { sourceCoordinates, editorText, applyEditorChanges } from './sourceCoordinates'
it('keeps canonical CRLF and UTF-16 offsets through editor edits', () => {
  const source = '😀 first\r\nsecond\r\nlast'
  const coordinates = sourceCoordinates(source)
  expect(coordinates.toEditor(source.indexOf('second'))).toBe(editorText(source).indexOf('second'))
  expect(coordinates.toSource(editorText(source).indexOf('last'))).toBe(source.indexOf('last'))
  const from = editorText(source).indexOf('second')
  expect(applyEditorChanges(source, ChangeSet.of({ from, to: from + 6, insert: 'new\nline' }, editorText(source).length))).toBe('😀 first\r\nnew\r\nline\r\nlast')
})

it('applies many disjoint replacements as one source assembly', () => {
  const source = 'a_b_'.repeat(10000) + '\r\nend'
  const edits = Array.from({length:10000}, (_,i)=>({from:i*4,to:i*4+1,insert:'xy'}))
  expect(applyEditorChanges(source, ChangeSet.of(edits,editorText(source).length))).toBe('xy_b_'.repeat(10000)+'\r\nend')
})
