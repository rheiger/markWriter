import { Extension, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration as PMDecoration, DecorationSet as PMDecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { foldedRanges, unfoldEffect } from '@codemirror/language'
import type { RegexGroup, SearchSegment } from './regexSearch'

export interface SearchOptions { query: string; caseSensitive: boolean; wholeWord: boolean }
export interface Hit { from: number; to: number; groups?: RegexGroup[] }
const word = /[\p{L}\p{N}\p{M}_]/u
export function findLiteral(text: string, options: SearchOptions): Hit[] {
  if (!options.query) return []
  const pattern = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(pattern, options.caseSensitive ? 'gu' : 'giu')
  const result: Hit[] = []
  for (const match of text.matchAll(expression)) {
    const from = match.index!, to = from + match[0].length
    const before = text.slice(Math.max(0, from - 2), from).match(/.$/u)?.[0] ?? ''
    const after = String.fromCodePoint(text.codePointAt(to) ?? 0)
    if (!options.wholeWord || !word.test(before) && !word.test(after)) result.push({ from, to })
  }
  return result
}
export function renderedSegments(doc: PMNode): SearchSegment[] {
  const segments: SearchSegment[] = []
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true
    let text = '', start = position + 1
    const flush = () => { if (text) segments.push({ text, start }); text = '' }
    node.forEach((child, offset) => {
      if (child.isText) { if (!text) start = position + 1 + offset; text += child.text }
      else flush()
    })
    flush()
    if (node.childCount === 0) segments.push({ text: '', start: position + 1 })
    return false
  })
  return segments
}
export function renderedHits(doc: PMNode, options: SearchOptions) {
  return { doc, hits: renderedSegments(doc).flatMap(segment => findLiteral(segment.text, options).map(hit => ({ from: segment.start + hit.from, to: segment.start + hit.to }))) }
}
export function replaceRendered(editor: Editor, snapshot: ReturnType<typeof renderedHits>, hits: Hit[], replacement: string | ((hit: Hit) => string)): boolean {
  if (editor.isDestroyed || editor.state.doc !== snapshot.doc || !hits.length) return false
  const tr = closeHistory(editor.state.tr)
  for (const hit of [...hits].reverse()) {
    const marks = snapshot.doc.nodeAt(hit.from)?.marks ?? snapshot.doc.resolve(hit.from).marks()
    const text = typeof replacement === 'function' ? replacement(hit) : replacement
    tr.replaceWith(hit.from, hit.to, text ? editor.schema.text(text, marks) : [])
  }
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  return true
}
function decorationRanges(hits: Hit[]) {
  return hits.flatMap(hit => [
    ...(hit.to > hit.from ? [{ from: hit.from, to: hit.to, className: 'search-match' }] : []),
    ...(hit.groups ?? []).filter(group => group.to > group.from).map(group => ({ from: group.from, to: group.to, className: `search-group search-group-${(group.index - 1) % 6}` })),
  ])
}
export const sourceHighlights = StateEffect.define<Hit[]>()
export const sourceSearchDecorations = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.docChanged) value = Decoration.none
    for (const effect of tr.effects) if (effect.is(sourceHighlights)) value = Decoration.set(decorationRanges(effect.value).map(({ from, to, className }) => Decoration.mark({ class: className }).range(from, to)), true)
    return value
  },
  provide: field => EditorView.decorations.from(field),
})
const renderedHighlightKey = new PluginKey('markwriter-search')
export const renderedSearchDecorations = Extension.create({
  name: 'markwriterSearch',
  addProseMirrorPlugins: () => [new Plugin({
    key: renderedHighlightKey,
    state: {
      init: () => PMDecorationSet.empty,
      apply(tr, previous) {
        const hits = tr.getMeta(renderedHighlightKey) as Hit[] | undefined
        return hits ? PMDecorationSet.create(tr.doc, decorationRanges(hits).map(({ from, to, className }) => PMDecoration.inline(from, to, { class: className }))) : tr.docChanged ? PMDecorationSet.empty : previous
      },
    },
    props: { decorations: state => renderedHighlightKey.getState(state) },
  })],
})
export function highlightRendered(editor: Editor, hits: Hit[]) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(renderedHighlightKey, hits).setMeta('addToHistory', false))
}
export function revealSource(view: EditorView, hit: Hit) {
  const effects: ReturnType<typeof unfoldEffect.of>[] = []
  foldedRanges(view.state).between(hit.from, hit.to, (from, to) => { effects.push(unfoldEffect.of({ from, to })) })
  view.dispatch({ selection: { anchor: hit.from, head: hit.to }, effects: [...effects, EditorView.scrollIntoView(hit.from, { y: 'center' })] })
}
