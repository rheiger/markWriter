import { editorText } from './sourceCoordinates'
import { EditorState, StateField, type Extension } from '@codemirror/state'
import { codeFolding, foldGutter, foldService, foldKeymap, foldedRanges, unfoldEffect, foldEffect } from '@codemirror/language'
import { keymap, EditorView, Decoration, type DecorationSet } from '@codemirror/view'

const cache = new WeakMap<EditorState, { from: number, to: number, kind: string }[]>()
export function findEmbeddedSource(state: EditorState) {
  const cached = cache.get(state)
  if (cached) return cached
  const result: { from: number, to: number, kind: string }[] = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line.text)
    if (fence) {
      const marker = fence[1][0], length = fence[1].length
      let end = n + 1
      while (end <= state.doc.lines && !new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${length},}\\s*$`).test(state.doc.line(end).text)) end++
      if (end <= state.doc.lines && fence[2].trim() === 'mermaid' && end > n + 1) {
        result.push({ from: line.to, to: state.doc.line(end).from - 1, kind: 'Mermaid' })
      }
      n = end
      continue
    }
    const images = /!\[[^\]\n]*\]\(<?data:(image\/[\w.+-]+)((?:;[^,\s]*)?),([^\s)>]{160,})>?\)/g
    for (const match of line.text.matchAll(images)) {
      const from = line.from + match.index! + match[0].indexOf(match[3])
      result.push({ from, to: from + match[3].length, kind: `${match[1]} ${match[2].includes(';base64') ? 'base64' : 'URL encoded'}` })
    }
  }
  cache.set(state, result)
  return result
}

// Public CodeMirror fold state maps ranges through edits and unfolds selection/search heads.
// API contracts: @codemirror/language/dist/index.d.ts (foldService/codeFolding/foldGutter).
export function embeddedSourceFolds(): Extension {
  const styling = (state: EditorState) => Decoration.set(findEmbeddedSource(state).filter(range => range.to > range.from).map(range => Decoration.mark({ class: 'embedded-source' }).range(range.from, range.to)), true)
  return [
    StateField.define<DecorationSet>({ create: styling, update: (value, tr) => tr.docChanged ? styling(tr.state) : value,
      provide: field => EditorView.decorations.from(field),
    }),
    foldService.of((state, from, to) => findEmbeddedSource(state).find(range => range.from >= from && range.from <= to) ?? null),
    codeFolding({
      preparePlaceholder: (state, range) => {
        const found = findEmbeddedSource(state).find(item => item.from === range.from)
        const text = state.sliceDoc(range.from, range.to).trim().replace(/\s+/g, ' ')
        return `${found?.kind ?? 'Source'} · ${text.slice(0, 24)} … ${text.slice(-16)} · ${range.to - range.from} chars`
      },
      placeholderDOM: (_view, onclick, summary: string) => {
        const button = document.createElement('button')
        button.type = 'button'; button.className = 'source-fold'; button.textContent = summary
        button.setAttribute('aria-label', `Expand ${summary}`); button.setAttribute('aria-expanded', 'false')
        button.onclick = onclick
        return button
      },
    }),
    foldGutter({ markerDOM: open => {
      const button = document.createElement('span')
      button.textContent = open ? '⌄' : '›'
      button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', open ? 'Collapse source' : 'Expand source')
      return button
    } }),
    keymap.of(foldKeymap),
    EditorState.transactionExtender.of(tr => {
      if (!tr.docChanged) return null
      const effects: ReturnType<typeof unfoldEffect.of>[] = []
      foldedRanges(tr.startState).between(0, tr.startState.doc.length, (from, to) => {
        tr.changes.iterChangedRanges((a, b) => {
          if (a > from && a < to || b > from && b < to) effects.push(unfoldEffect.of({ from: tr.changes.mapPos(from), to: tr.changes.mapPos(to) }))
        })
      })
      return effects.length ? { effects } : null
    }),
    EditorView.theme({ '.cm-line': { overflowWrap: 'anywhere' }, '.cm-foldGutter button': { border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' } }),
  ]
}

// Keep each block's presentation choice when WYSIWYG changes require source synchronization.
export function synchronizeSource(view: EditorView, text: string, anchor: number, collapseDefault: boolean) {
  if (view.state.doc.toString() === editorText(text)) return
  const key = (state: EditorState, range: { from: number, to: number, kind: string }, index: number) => {
    const body = state.sliceDoc(range.from, range.to)
    let hash = 2166136261
    for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 16777619)
    return `${range.kind}:${index}:${body.length}:${hash}`
  }
  const choices = new Map<string, boolean>()
  const folded = foldedRanges(view.state)
  findEmbeddedSource(view.state).forEach((range, index) => {
    let collapsed = false
    folded.between(range.from, range.to, () => { collapsed = true })
    choices.set(key(view.state, range, index), collapsed)
  })
  anchor = Math.min(anchor, editorText(text).length)
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor } })
  const effects = findEmbeddedSource(view.state).flatMap((range, index) =>
    (choices.get(key(view.state, range, index)) ?? collapseDefault) && (anchor <= range.from || anchor >= range.to) ? [foldEffect.of(range)] : [])
  if (effects.length) view.dispatch({ effects })
}
