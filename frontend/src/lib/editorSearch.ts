import { Extension, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration as PMDecoration, DecorationSet as PMDecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { foldedRanges, unfoldEffect } from '@codemirror/language'

export interface SearchOptions { query: string; caseSensitive: boolean; wholeWord: boolean }
export interface Hit { from: number; to: number }
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
export function renderedHits(doc: PMNode, options: SearchOptions) {
  const hits: Hit[] = []
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true
    let text = '', start = position + 1
    const flush = () => { hits.push(...findLiteral(text, options).map(hit => ({ from: start + hit.from, to: start + hit.to }))); text = '' }
    node.forEach((child, offset) => {
      if (child.isText) { if (!text) start = position + 1 + offset; text += child.text }
      else flush() // hard breaks and all atoms are explicit search boundaries
    })
    flush()
    return false
  })
  return { doc, hits }
}
export function replaceRendered(editor: Editor, snapshot: ReturnType<typeof renderedHits>, hits: Hit[], replacement: string): boolean {
  if (editor.isDestroyed || editor.state.doc !== snapshot.doc || !hits.length) return false
  const tr = closeHistory(editor.state.tr)
  for (const hit of [...hits].reverse()) {
    const marks = snapshot.doc.nodeAt(hit.from)?.marks ?? snapshot.doc.resolve(hit.from).marks()
    tr.replaceWith(hit.from, hit.to, replacement ? editor.schema.text(replacement, marks) : [])
  }
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  return true
}
export const sourceHighlights = StateEffect.define<Hit[]>()
export const sourceSearchDecorations = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.docChanged) value = Decoration.none
    for (const effect of tr.effects) if (effect.is(sourceHighlights)) value = Decoration.set(effect.value.map(hit => Decoration.mark({ class: 'search-match' }).range(hit.from, hit.to)), true)
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
        return hits ? PMDecorationSet.create(tr.doc, hits.map(hit => PMDecoration.inline(hit.from, hit.to, { class: 'search-match' }))) : tr.docChanged ? PMDecorationSet.empty : previous
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
