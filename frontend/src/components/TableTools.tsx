import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { CellSelection } from '@tiptap/pm/tables'
import { tableAction, tableActions, tableContext, type TableAction } from '../lib/tableCommands'

export function TableTools({ editor }: { editor: Editor | null }) {
  const [, update] = useState(0)
  useEffect(() => {
    if (!editor) return
    const changed = () => update(value => value + 1)
    editor.on('transaction', changed)
    return () => { editor.off('transaction', changed) }
  }, [editor])
  if (!editor) return null
  const ctx = tableContext(editor)
  if (!ctx) return null
  const selection = editor.state.selection
  return <div className="table-tools" role="toolbar" aria-label="Table tools">
    {(Object.entries(tableActions) as [TableAction, string][]).map(([action, label]) => <button key={action} title={label}
      aria-pressed={action === 'selectRow' ? selection instanceof CellSelection && selection.isRowSelection() : action === 'selectColumn' ? selection instanceof CellSelection && selection.isColSelection() : undefined}
      disabled={(action === 'rowUp' || action === 'rowDown') && ctx.row === 0}
      onMouseDown={event => event.preventDefault()} onClick={() => { tableAction(editor, action); editor.commands.focus() }}>{label}</button>)}
  </div>
}
