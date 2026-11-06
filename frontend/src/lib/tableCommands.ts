import type { Editor } from '@tiptap/core'
import { Fragment, type Node } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { CellSelection, TableMap } from '@tiptap/pm/tables'

export const tableActions = {
  rowAbove: 'Add row above', rowBelow: 'Add row below', rowUp: 'Move row up', rowDown: 'Move row down',
  deleteRow: 'Delete row', selectRow: 'Select row', columnLeft: 'Add column left', columnRight: 'Add column right',
  columnPrevious: 'Move column left', columnNext: 'Move column right', deleteColumn: 'Delete column', selectColumn: 'Select column',
} as const
export type TableAction = keyof typeof tableActions
function context(editor: Editor) {
  const selection = editor.state.selection
  const $pos = selection instanceof CellSelection ? selection.$anchorCell : selection.$from
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name !== 'table') continue
    const table = $pos.node(depth), start = $pos.start(depth), pos = start - 1
    const map = TableMap.get(table)
    const cell = selection instanceof CellSelection ? selection.$anchorCell.pos : $pos.before(depth + 2)
    const rect = map.findCell(cell - start)
    return { table, start, pos, map, row: rect.top, col: rect.left, cell }
  }
  return null
}
export function tableContext(editor: Editor) {
  try { return context(editor) } catch { return null }
}
// Rebuild only the table node in one transaction. Existing cells retain marks/content/attributes.
export function tableAction(editor: Editor, action: TableAction): boolean {
  const ctx = tableContext(editor)
  if (!ctx) return false
  const { table, pos, start, map } = ctx
  let { row, col } = ctx
  const selection = editor.state.selection
  if (action === 'selectRow' || action === 'selectColumn') {
    const $cell = editor.state.doc.resolve(ctx.cell)
    const selected = selection instanceof CellSelection && (action === 'selectRow' ? selection.isRowSelection() : selection.isColSelection())
    const next = selected ? TextSelection.near(editor.state.doc.resolve(ctx.cell + 1)) :
      action === 'selectRow' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell)
    editor.view.dispatch(editor.state.tr.setSelection(next))
    return true
  }
  const rows: Node[][] = []
  table.forEach(node => { const cells: Node[] = []; node.forEach(cell => cells.push(cell)); rows.push(cells) })
  // Merged cells are not produced by this UI and cannot be safely represented in GFM.
  if (rows.some(cells => cells.some(cell => cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1))) return false
  const blank = (cell: Node) => cell.type.create({ ...cell.attrs, colwidth: null }, editor.schema.nodes.paragraph.create())
  const blankRow = () => rows[0].map(cell => editor.schema.nodes.tableCell.create({ ...cell.attrs, colwidth: null }, editor.schema.nodes.paragraph.create()))
  if (action === 'rowAbove' || action === 'rowBelow') {
    row = action === 'rowAbove' ? Math.max(1, row) : row + 1
    rows.splice(row, 0, blankRow())
  } else if (action === 'rowUp' || action === 'rowDown') {
    if (row === 0) return false
    if (action === 'rowUp' && row === 1) rows.splice(2, 0, blankRow())
    else {
      const target = action === 'rowUp' ? row - 1 : row + 1
      if (target === rows.length) rows.push(blankRow())
      const moved = rows.splice(row, 1)[0]; rows.splice(target, 0, moved); row = target
    }
  } else if (action === 'deleteRow') {
    // A multi-row cell selection deletes the selected rectangle's rows.
    const rect = selection instanceof CellSelection ? map.rectBetween(selection.$anchorCell.pos - start, selection.$headCell.pos - start) : { top: row, bottom: row + 1 }
    rows.splice(rect.top, rect.bottom - rect.top); row = Math.min(rect.top, rows.length - 1)
  } else if (action === 'columnLeft' || action === 'columnRight') {
    col += action === 'columnRight' ? 1 : 0
    rows.forEach(cells => cells.splice(col, 0, blank(cells[Math.min(col, cells.length - 1)])))
  } else if (action === 'columnPrevious' || action === 'columnNext') {
    if (action === 'columnPrevious' && col === 0) rows.forEach(cells => cells.splice(1, 0, blank(cells[0])))
    else {
      const target = action === 'columnPrevious' ? col - 1 : col + 1
      rows.forEach(cells => {
        if (target === cells.length) cells.push(blank(cells[cells.length - 1]))
        const moved = cells.splice(col, 1)[0]; cells.splice(target, 0, moved)
      })
      col = target
    }
  } else if (action === 'deleteColumn') {
    const rect = selection instanceof CellSelection ? map.rectBetween(selection.$anchorCell.pos - start, selection.$headCell.pos - start) : { left: col, right: col + 1 }
    rows.forEach(cells => cells.splice(rect.left, rect.right - rect.left)); col = Math.min(rect.left, (rows[0]?.length ?? 0) - 1)
  }
  const tr = closeHistory(editor.state.tr)
  if (!rows.length || !rows[0].length) {
    tr.delete(pos, pos + table.nodeSize)
  } else {
    const rebuilt = table.type.create(table.attrs, Fragment.fromArray(rows.map((cells, index) =>
      editor.schema.nodes.tableRow.create(table.child(Math.min(index, table.childCount - 1)).attrs,
        cells.map(cell => (index === 0 ? editor.schema.nodes.tableHeader : editor.schema.nodes.tableCell).create(cell.attrs, cell.content, cell.marks))))))
    tr.replaceWith(pos, pos + table.nodeSize, rebuilt)
    const target = TableMap.get(rebuilt).positionAt(Math.max(0, row), Math.max(0, col), rebuilt) + start
    tr.setSelection(TextSelection.near(tr.doc.resolve(target + 1)))
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}
