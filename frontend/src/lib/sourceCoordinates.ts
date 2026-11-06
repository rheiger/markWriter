import type { ChangeSet } from '@codemirror/state'

export const editorText = (source: string) => source.replace(/\r\n?/g, '\n')
// CodeMirror stores one UTF-16 newline unit; canonical CRLF stores two. Keep that conversion explicit.
export function sourceCoordinates(source: string) {
  const breaks = Array.from(source.matchAll(/\r\n/g), match => match.index!)
  const countBefore = (position: number, editor: boolean) => {
    let lo = 0, hi = breaks.length
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (breaks[mid] - (editor ? mid : 0) < position) lo = mid + 1; else hi = mid }
    return lo
  }
  return { toEditor: (position: number) => position - countBefore(position, false), toSource: (position: number) => position + countBefore(position, true) }
}
export function applyEditorChanges(source: string, changes: ChangeSet, newlineStyle?: string) {
  const coordinates = sourceCoordinates(source)
  const edits: { from: number; to: number; text: string }[] = []
  const newline = newlineStyle ?? (source.includes('\r\n') ? '\r\n' : '\n')
  changes.iterChanges((from, to, _fromB, _toB, inserted) => edits.push({ from: coordinates.toSource(from), to: coordinates.toSource(to), text: inserted.toString().replace(/\n/g, newline) }))
  for (const edit of edits.reverse()) source = source.slice(0, edit.from) + edit.text + source.slice(edit.to)
  return source
}
