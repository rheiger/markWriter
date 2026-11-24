import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { CodeBlock, type CodeBlockOptions } from '@tiptap/extension-code-block'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration as PMDecoration, DecorationSet } from '@tiptap/pm/view'
import { codeLanguage, createCodeHighlighter, LONG_CODE_LIMIT, SQL_FALLBACK_NOTICE, TOML_FALLBACK_NOTICE } from './codeHighlight'

function fallbackAttributes(language: string | null) {
  const notice = language === 'toml' ? TOML_FALLBACK_NOTICE : SQL_FALLBACK_NOTICE
  return { [language === 'toml' ? 'data-toml-fallback' : 'data-sql-fallback']: notice, title: notice, 'aria-description': notice }
}

const refreshSourceToml = StateEffect.define<undefined>()
const SOURCE_TOML_SETTLE_MS = 100

// Keep synchronous decorations for other languages and small TOML fences.
// Once a large TOML fence is deferred, later TOML fences must wait for the
// same pass so they are admitted against the real document budget.
function sourceDecorations(state: EditorState, deferLargeToml: boolean) {
  const highlight = createCodeHighlighter(true), decorations: ReturnType<Decoration['range']>[] = []
  let pendingToml = false
  syntaxTree(state).iterate({ enter({ node }) {
    if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return
    const label = node.getChild('CodeInfo')
    const info = label ? state.sliceDoc(label.from, label.to) : ''
    if (deferLargeToml && (pendingToml || node.to - node.from > LONG_CODE_LIMIT) && codeLanguage(info) === 'toml') {
      pendingToml = true
      highlight('', info) // Count the skipped fence in the common block budget.
      return false
    }
    let code = ''
    const chunks: { from: number; to: number; offset: number }[] = []
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === 'CodeText') {
        chunks.push({ from: child.from, to: child.to, offset: code.length })
        code += state.sliceDoc(child.from, child.to)
      }
    }
    const result = highlight(code, info)
    if (result.fallback) decorations.push(Decoration.line({ attributes: fallbackAttributes(result.language) }).range(state.doc.lineAt(node.from).from))
    let chunkIndex = 0
    for (const token of result.ranges) {
      while (chunkIndex < chunks.length && chunks[chunkIndex].offset + chunks[chunkIndex].to - chunks[chunkIndex].from <= token.from) chunkIndex++
      for (let i = chunkIndex; i < chunks.length && chunks[i].offset < token.to; i++) {
        const chunk = chunks[i]
        const from = Math.max(token.from, chunk.offset), to = Math.min(token.to, chunk.offset + chunk.to - chunk.from)
        if (to > from) decorations.push(Decoration.mark({ class: token.className }).range(chunk.from + from - chunk.offset, chunk.from + to - chunk.offset))
      }
    }
    return false
  } })
  return { decorations: Decoration.set(decorations, true), pendingToml }
}

class SourceTomlRefresh {
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(view: EditorView) { this.schedule(view) }

  update({ view, startState, state }: ViewUpdate) {
    if (startState.field(sourceCodeHighlighting, false) !== state.field(sourceCodeHighlighting, false)) this.schedule(view)
  }

  destroy() { clearTimeout(this.timer) }

  private schedule(view: EditorView) {
    clearTimeout(this.timer)
    const pending = view.state.field(sourceCodeHighlighting, false)
    if (!pending?.pendingToml) return
    this.timer = setTimeout(() => {
      if (view.state.field(sourceCodeHighlighting, false) !== pending) return
      if (view.composing) this.schedule(view)
      else view.dispatch({ effects: refreshSourceToml.of(undefined) })
    }, SOURCE_TOML_SETTLE_MS)
  }
}

const sourceTomlRefresh = ViewPlugin.fromClass(SourceTomlRefresh)

export const sourceCodeHighlighting = StateField.define({
  create: state => sourceDecorations(state, true),
  update(value, tr) {
    if (tr.effects.some(effect => effect.is(refreshSourceToml))) return sourceDecorations(tr.state, false)
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return sourceDecorations(tr.state, true)
    return value
  },
  provide: field => [EditorView.decorations.from(field, value => value.decorations), sourceTomlRefresh],
})

export const codeHighlightKey = new PluginKey<{ enabled: boolean; decorations: DecorationSet }>('markwriter-code-highlighting')
function renderedDecorations(doc: PMNode, enabled: boolean) {
  const highlight = createCodeHighlighter(enabled), decorations: PMDecoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true
    const result = highlight(node.textContent, node.attrs.language ?? '')
    if (result.fallback) decorations.push(PMDecoration.node(pos, pos + node.nodeSize, fallbackAttributes(result.language)))
    for (const token of result.ranges) {
      decorations.push(PMDecoration.inline(pos + 1 + token.from, pos + 1 + token.to, { class: token.className }))
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}
// Retain codeBlock schema, commands and keyboard behavior; replace only its presentation plugin.
// Source: installed @tiptap/extension-code-block/src/code-block.ts.
export const HighlightedCodeBlock = CodeBlock.extend<CodeBlockOptions & { highlighting: boolean }>({
  addOptions() { return { ...this.parent!(), highlighting: true } },
  addProseMirrorPlugins() {
    const enabled = this.options.highlighting
    return [...(this.parent?.() ?? []), new Plugin({
      key: codeHighlightKey,
      state: {
        init: (_, state) => ({ enabled, decorations: renderedDecorations(state.doc, enabled) }),
        apply(tr, previous) {
          const requested = tr.getMeta(codeHighlightKey) as boolean | undefined
          const enabled = requested ?? previous.enabled
          return tr.docChanged || requested !== undefined ? { enabled, decorations: renderedDecorations(tr.doc, enabled) } : previous
        },
      },
      props: { decorations: state => codeHighlightKey.getState(state)?.decorations },
    })]
  },
})
