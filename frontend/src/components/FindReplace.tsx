import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { findLiteral, renderedHits, replaceRendered, highlightRendered, revealSource, sourceHighlights, type Hit } from '../lib/editorSearch'
import { editorText } from '../lib/sourceCoordinates'
import { useAppStore } from '../store/useAppStore'

interface Props {
  documentId?: string; source: string; view: EditorView | null; editor: Editor | null
  mode: 'markdown' | 'wysiwyg'; active: boolean; open: boolean; replace: boolean; request: number
  onClose: () => void; onSource: () => void
}
export function FindReplace({ documentId, source, view, editor, mode, active, open, replace, request, onClose, onSource }: Props) {
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('')
  const [caseSensitive, setCase] = useState(false), [wholeWord, setWord] = useState(false)
  const [engineRevision, setEngineRevision] = useState(0)
  const [picked, setPicked] = useState<Hit | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const owner = () => active && useAppStore.getState().currentDocument?.id === documentId
  useEffect(() => {
    if (!editor) return
    const changed = () => setEngineRevision(n => n + 1)
    editor.on('update', changed)
    return () => { editor.off('update', changed) }
  }, [editor])
  const snapshot = useMemo(() => {
    void engineRevision
    const options = { query: open ? query : '', caseSensitive, wholeWord }
    return mode === 'markdown' ? { doc: view?.state.doc, hits: findLiteral(editorText(source), { ...options, query: editorText(options.query) }) } : editor ? renderedHits(editor.state.doc, options) : { doc: undefined, hits: [] }
    // Engine transactions can change marks/positions without changing serialized source.
  }, [mode, source, query, caseSensitive, wholeWord, editor, view, open, engineRevision])
  const hits = snapshot.hits
  useEffect(() => { setPicked(null) }, [snapshot])
  useEffect(() => { if (open && active) input.current?.focus() }, [open, active, request])
  useEffect(() => {
    if (!open || !active) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open], .table-picker') || (event.target as Element)?.closest('.menu-dropdown')) return
      event.preventDefault(); event.stopPropagation(); close.current()
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [open, active])
  useEffect(() => {
    if (view) view.dispatch({ effects: sourceHighlights.of(active && mode === 'markdown' ? hits : []) })
    if (editor) highlightRendered(editor, active && mode === 'wysiwyg' ? hits : [])
    return () => { if (view && view.dom.isConnected) view.dispatch({ effects: sourceHighlights.of([]) }); if (editor && !editor.isDestroyed) highlightRendered(editor, []) }
  }, [hits, mode, active, view, editor])
  const navigate = (direction: number) => {
    if (!owner() || !hits.length) return
    const index = picked ? hits.findIndex(h => h.from === picked.from && h.to === picked.to) : -1
    const caret = mode === 'markdown' ? view?.state.selection.main.head ?? 0 : editor?.state.selection.head ?? 0
    let next = index >= 0 ? (index + direction + hits.length) % hits.length : direction > 0 ? hits.findIndex(h => h.from >= caret) : (() => { for (let i = hits.length - 1; i >= 0; i--) if (hits[i].to <= caret) return i; return -1 })()
    if (next < 0) next = direction > 0 ? 0 : hits.length - 1
    const hit = hits[next]; setPicked(hit)
    if (mode === 'markdown' && view) revealSource(view, hit)
    else editor?.chain().setTextSelection(hit).scrollIntoView().run()
  }
  const replaceHits = (all: boolean) => {
    if (!owner()) return
    const targets = all ? hits : picked ? hits.filter(h => h.from === picked.from && h.to === picked.to) : []
    if (!targets.length) { if (!all) navigate(1); return }
    if (mode === 'markdown' && view && view.state.doc === snapshot.doc) {
      view.dispatch({ changes: targets.map(h => ({ ...h, insert: replacement })), annotations: isolateHistory.of('full') })
    } else if (editor && mode === 'wysiwyg' && snapshot.doc === editor.state.doc) {
      replaceRendered(editor, { doc: editor.state.doc, hits }, targets, replacement)
    }
    setPicked(null)
  }
  if (!open || !active) return null
  const index = picked ? hits.findIndex(h => h.from === picked.from && h.to === picked.to) : -1
  return <div role="search" aria-label="Find and Replace" className="find-replace" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); navigate(event.shiftKey ? -1 : 1) }
  }}>
    <div className="find-row">
      <label>Find<textarea ref={input} rows={1} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button type="button" disabled={!hits.length} onClick={() => navigate(-1)} title="Previous (Shift+Enter)">Previous</button>
      <button type="button" disabled={!hits.length} onClick={() => navigate(1)} title="Next (Enter)">Next</button>
      <output aria-live="polite">{!query ? 'Enter a search' : hits.length ? `${index >= 0 ? `${index + 1} of ` : ''}${hits.length} matches · wraps` : 'No matches'}</output>
      <label><input type="checkbox" checked={caseSensitive} onChange={e => setCase(e.target.checked)} />Match case</label>
      <label><input type="checkbox" checked={wholeWord} onChange={e => setWord(e.target.checked)} />Whole word</label>
      <button type="button" onClick={onClose}>Close Find</button>
    </div>
    {replace && <div className="find-row"><label>Replace with<textarea rows={1} value={replacement} onChange={e => setReplacement(e.target.value)} /></label>
      <button type="button" disabled={!hits.length} onClick={() => replaceHits(false)}>Replace</button>
      <button type="button" disabled={!hits.length} onClick={() => replaceHits(true)}>Replace All</button></div>}
    <div className="find-scope">{mode === 'markdown' ? 'Canonical Markdown source · includes folded content · multiline queries supported' : <>Editable rendered text · within each text block; diagram/image internals excluded. <button type="button" onClick={onSource}>Search source</button></>}</div>
  </div>
}
