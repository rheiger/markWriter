import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

// These are view attributes, not document attributes. WebKit checks autocorrect
// on the editing host, so descendants alone cannot protect a technical selection.
export const literalInputAttributes = {
  autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', writingsuggestions: 'false',
}

function technicalRange(doc: PMNode, from: number, to: number) {
  for (const position of [from, to]) {
    const resolved = doc.resolve(position)
    for (let depth = resolved.depth; depth > 0; depth--) {
      if (['codeBlock', 'blockquote'].includes(resolved.node(depth).type.name)) return true
    }
    if (resolved.marks().some(mark => mark.type.name === 'code')) return true
  }
  let protectedText = false
  if (from !== to) doc.nodesBetween(from, to, node => {
    if (protectedText) return false
    protectedText = ['codeBlock', 'blockquote'].includes(node.type.name) || node.marks.some(mark => mark.type.name === 'code')
    return !protectedText
  })
  return protectedText
}

export function cancelAutomaticReplacement(event: InputEvent) {
  // Do not reinterpret intentional Unicode, typing, paste or IME composition.
  if (event.inputType !== 'insertReplacementText' || event.isComposing || !event.cancelable) return false
  event.preventDefault()
  return true
}

function protectedTarget(view: EditorView, event: InputEvent) {
  // A queued OS replacement can target old text after the caret has moved.
  const ranges = typeof event.getTargetRanges === 'function' ? event.getTargetRanges() : []
  return ranges.some(range => {
    if (!view.dom.contains(range.startContainer) || !view.dom.contains(range.endContainer)) return false
    try {
      return technicalRange(view.state.doc, view.posAtDOM(range.startContainer, range.startOffset), view.posAtDOM(range.endContainer, range.endOffset))
    } catch { return false } // Detached/unmapped DOM cannot describe a current document range.
  })
}

export const technicalInput = Extension.create({
  name: 'literalTechnicalInput',
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      attributes: state => state.storedMarks?.some(mark => mark.type.name === 'code') || technicalRange(state.doc, state.selection.from, state.selection.to)
        ? literalInputAttributes : {},
      handleDOMEvents: {
        beforeinput: (view, rawEvent) => {
          const event = rawEvent as InputEvent
          if (event.inputType !== 'insertReplacementText' || event.isComposing || !event.cancelable) return false
          const state = view.state
          return !!(state.storedMarks?.some(mark => mark.type.name === 'code') ||
            technicalRange(state.doc, state.selection.from, state.selection.to) || protectedTarget(view, event)) && cancelAutomaticReplacement(event)
        },
      },
    } })]
  },
})
