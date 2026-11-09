import { StateField, type EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView } from '@codemirror/view'
import { CodeBlock, type CodeBlockOptions } from '@tiptap/extension-code-block'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration as PMDecoration, DecorationSet } from '@tiptap/pm/view'
import { createCodeHighlighter } from './codeHighlight'

// Public CodeMirror StateField/Decoration contracts: installed @codemirror/{state,view}/dist/index.d.ts.
function sourceDecorations(state: EditorState) {
  const highlight = createCodeHighlighter(true), decorations: ReturnType<Decoration['range']>[] = []
  syntaxTree(state).iterate({ enter({ node }) {
    if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return
    let code = '', info = ''
    const chunks: { from: number; to: number; offset: number }[] = []
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === 'CodeInfo') info = state.sliceDoc(child.from, child.to)
      if (child.name === 'CodeText') {
        chunks.push({ from: child.from, to: child.to, offset: code.length })
        code += state.sliceDoc(child.from, child.to)
      }
    }
    let chunkIndex = 0
    for (const token of highlight(code, info).ranges) {
      while (chunkIndex < chunks.length && chunks[chunkIndex].offset + chunks[chunkIndex].to - chunks[chunkIndex].from <= token.from) chunkIndex++
      for (let i = chunkIndex; i < chunks.length && chunks[i].offset < token.to; i++) {
        const chunk = chunks[i]
        const from = Math.max(token.from, chunk.offset), to = Math.min(token.to, chunk.offset + chunk.to - chunk.from)
        if (to > from) decorations.push(Decoration.mark({ class: token.className }).range(chunk.from + from - chunk.offset, chunk.from + to - chunk.offset))
      }
    }
    return false
  } })
  return Decoration.set(decorations, true)
}
export const sourceCodeHighlighting = StateField.define({
  create: sourceDecorations,
  update: (value, tr) => tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? sourceDecorations(tr.state) : value,
  provide: field => EditorView.decorations.from(field),
})

export const codeHighlightKey = new PluginKey<{ enabled: boolean; decorations: DecorationSet }>('markwriter-code-highlighting')
function renderedDecorations(doc: PMNode, enabled: boolean) {
  const highlight = createCodeHighlighter(enabled), decorations: PMDecoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true
    for (const token of highlight(node.textContent, node.attrs.language ?? '').ranges) {
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
