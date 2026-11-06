import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'

export function toggleSourceMark(view: EditorView, delimiter: string, placeholder: string) {
  let { from, to } = view.state.selection.main
  let text = view.state.sliceDoc(from, to)
  if (text.startsWith(delimiter) && text.endsWith(delimiter) && text.length >= delimiter.length * 2) text = text.slice(delimiter.length, -delimiter.length)
  else if (from >= delimiter.length && view.state.sliceDoc(from - delimiter.length, from) === delimiter && view.state.sliceDoc(to, to + delimiter.length) === delimiter) {
    from -= delimiter.length; to += delimiter.length
  } else text = `${delimiter}${text || placeholder}${delimiter}`
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, annotations: isolateHistory.of('full') })
  view.focus()
}

export function toggleSourceCode(view: EditorView) {
  const doc = view.state.doc, { from, to } = view.state.selection.main
  let start = doc.lineAt(from).from
  let end = doc.lineAt(to > from && doc.lineAt(to).from === to ? to - 1 : to).to
  let content: string | undefined
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n), open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.text)
    if (!open) continue
    const marker = open[1][0], length = open[1].length
    let last = n + 1
    while (last <= doc.lines && !new RegExp(`^ {0,3}${marker}{${length},}\\s*$`).test(doc.line(last).text)) last++
    if (last > doc.lines) continue
    if (from >= line.from && to <= doc.line(last).to) {
      start = line.from; end = doc.line(last).to
      content = doc.sliceString(line.to + 1, Math.max(line.to + 1, doc.line(last).from - 1))
      break
    }
    n = last
  }
  if (content === undefined) {
    const selected = doc.sliceString(start, end)
    const length = Math.max(3, ...Array.from(selected.matchAll(/`+/g), match => match[0].length + 1))
    const fence = '`'.repeat(length)
    content = `${fence}\n${selected}\n${fence}`
  }
  view.dispatch({ changes: { from: start, to: end, insert: content }, selection: { anchor: start + content.length }, annotations: isolateHistory.of('full') })
  view.focus()
}

export function toggleRenderedCode(editor: Editor) {
  const state = editor.state, { from, to } = state.selection
  const blocks: { node: PMNode; pos: number }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) { blocks.push({ node, pos }); return false }
    return true
  })
  if (!blocks.length) return
  const first = blocks[0], last = blocks[blocks.length - 1]
  // Preserve containing cells/lists: only combine sibling textblocks. Single blocks always toggle.
  if (blocks.length > 1 && !state.doc.resolve(first.pos).sameParent(state.doc.resolve(last.pos))) return
  const text = blocks.map(({ node }) => node.textBetween(0, node.content.size, '\n', '\n')).join('\n')
  const type = blocks.every(b => b.node.type.name === 'codeBlock') ? editor.schema.nodes.paragraph : editor.schema.nodes.codeBlock
  const node = type.create(null, text ? editor.schema.text(text) : undefined)
  const tr = closeHistory(state.tr).replaceWith(first.pos, last.pos + last.node.nodeSize, node)
  tr.setSelection(TextSelection.create(tr.doc, first.pos + node.nodeSize - 1))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  editor.commands.focus()
}

export function finishRenderedFormat(editor: Editor) {
  const end = editor.state.selection.to
  const marks = editor.state.storedMarks ?? editor.state.selection.$to.marks()
  const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(end), -1)).setStoredMarks(marks).setMeta('addToHistory', false)
  editor.view.dispatch(tr)
}
