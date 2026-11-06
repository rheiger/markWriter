import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { tableAction } from './tableCommands'
import { fromWysiwygHtml, toWysiwygHtml } from './markdown'
let editor: Editor
beforeEach(() => {
  editor = new Editor({ extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, TextAlign.configure({ types: ['tableCell', 'tableHeader'] })],
    content: toWysiwygHtml('Before\n\n| A | B |\n| :--- | ---: |\n| **one** | a \\| b |\n| two | c |\n\nAfter') })
})
afterEach(() => editor.destroy())
function cell(row: number, col = 0) {
  let position = 0, r = -1, c = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableRow') { r++; c = -1 }
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') { c++; if (r === row && c === col) position = pos + 2 }
  })
  editor.commands.setTextSelection(position)
}
function rows() { return new DOMParser().parseFromString(editor.getHTML(), 'text/html').querySelectorAll('tr') }
it('adds and deletes rows/columns with undo and final-cell deletion', () => {
  cell(1); tableAction(editor, 'rowAbove'); expect(rows()).toHaveLength(4)
  tableAction(editor, 'rowBelow'); expect(rows()).toHaveLength(5)
  tableAction(editor, 'columnLeft'); expect(rows()[0].children).toHaveLength(3)
  tableAction(editor, 'columnRight'); expect(rows()[0].children).toHaveLength(4)
  tableAction(editor, 'deleteColumn'); expect(rows()[0].children).toHaveLength(3)
  tableAction(editor, 'deleteRow'); expect(rows()).toHaveLength(4)
  editor.commands.undo(); expect(rows()).toHaveLength(5)
  editor.commands.redo(); expect(rows()).toHaveLength(4)
  // Each operation is a distinct undo event; first undo removes only the final deletion.
})
it('handles special first/last movement boundaries and keeps the header anchored', () => {
  cell(1); tableAction(editor, 'rowUp'); expect(rows()).toHaveLength(4)
  expect(rows()[0].textContent).toBe('AB')
  expect(rows()[1].textContent).toContain('one')
  cell(3); tableAction(editor, 'rowDown'); expect(rows()).toHaveLength(5)
  expect(rows()[4].textContent).toContain('two')
  cell(1, 0); tableAction(editor, 'columnPrevious'); expect(rows()[0].children).toHaveLength(3)
  cell(1, 2); tableAction(editor, 'columnNext'); expect(rows()[0].children).toHaveLength(4)
})
it('moves complete columns with header and alignment and retains inline Markdown fidelity', () => {
  cell(1, 1); tableAction(editor, 'columnPrevious')
  expect(rows()[0].textContent).toBe('BA')
  expect((rows()[0].children[0] as HTMLElement).style.textAlign).toBe('right')
  const source = fromWysiwygHtml(editor.getHTML())
  expect(source).toContain('**one**'); expect(source).toContain('a \\| b')
  expect(source).toContain('Before'); expect(source).toContain('After')
})
it('toggles row/column selection and deletes the final table without dropping surrounding paragraphs', () => {
  cell(1); tableAction(editor, 'selectRow'); expect(editor.state.selection.constructor.name).toBe('CellSelection')
  tableAction(editor, 'selectRow'); expect(editor.state.selection.constructor.name).toBe('TextSelection')
  tableAction(editor, 'selectColumn'); tableAction(editor, 'selectColumn')
  expect(editor.state.selection.constructor.name).toBe('TextSelection')
  for (let i = 0; i < 3; i++) { cell(0); tableAction(editor, 'deleteRow') }
  expect(rows()).toHaveLength(0)
  expect(editor.getText()).toContain('Before'); expect(editor.getText()).toContain('After')
})
