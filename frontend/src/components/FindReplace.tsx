import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { findLiteral, renderedHits, renderedSegments, replaceRendered, highlightRendered, revealSource, sourceHighlights, type Hit } from '../lib/editorSearch'
import { startRegex, prepareReplacements, type RegexResult } from '../lib/regexSearch'
import { editorText } from '../lib/sourceCoordinates'
import { preserveEmbeddedFolds } from '../lib/sourceFolds'
import { useAppStore } from '../store/useAppStore'

interface Props {
  documentId?: string; source: string; view: EditorView | null; editor: Editor | null
  mode: 'markdown' | 'wysiwyg'; active: boolean; open: boolean; replace: boolean; request: number
  onClose: () => void; onSource: () => void
}
export function FindReplace({ documentId, source, view, editor, mode, active, open, replace, request, onClose, onSource }: Props) {
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('')
  const [caseSensitive, setCase] = useState(false), [wholeWord, setWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [engineRevision, setEngineRevision] = useState(0)
  const [picked, setPicked] = useState<Hit | null>(null)
  const [replacementError, setReplacementError] = useState('')
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
  const basis = useMemo(() => {
    void engineRevision
    const options = { query: open && !regex ? query : '', caseSensitive, wholeWord }
    if (mode === 'markdown') {
      const text = view?.state.doc.toString() ?? editorText(source)
      return { doc: view?.state.doc, hits: findLiteral(text, { ...options, query: editorText(options.query) }), segments: [{ text, start: 0 }] }
    }
    return editor ? { ...renderedHits(editor.state.doc, options), segments: renderedSegments(editor.state.doc) } : { doc: undefined, hits: [], segments: [] }
  }, [mode, source, query, caseSensitive, wholeWord, regex, editor, view, open, engineRevision])
  const [computed, setComputed] = useState<{ basis: typeof basis; result: RegexResult } | null>(null)
  useEffect(() => {
    if (!regex || !open || !active || !query) return
    return startRegex({ pattern: editorText(query), caseSensitive, wholeWord, segments: basis.segments }, result => {
      if (useAppStore.getState().currentDocument?.id !== documentId) return
      if (mode === 'markdown' ? view?.state.doc !== basis.doc : editor?.state.doc !== basis.doc) return
      setComputed({ basis, result })
    })
  }, [basis, regex, open, active, query, caseSensitive, wholeWord, documentId, mode, view, editor])
  const currentEngine = mode === 'markdown' ? view?.state.doc : editor?.state.doc
  const result = computed?.basis === basis && basis.doc === currentEngine ? computed.result : null
  const snapshot = basis
  const hits: Hit[] = useMemo(() => regex ? result?.hits ?? [] : basis.hits, [regex, result, basis])
  useEffect(() => { setPicked(null); setReplacementError('') }, [snapshot, result, replacement])
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
    if (!owner() || all && !!result?.limited) return
    const targets = all ? hits : picked ? hits.filter(h => h.from === picked.from && h.to === picked.to) : []
    if (!targets.length) { if (!all) navigate(1); return }
    if (mode === 'markdown' ? !view || view.state.doc !== snapshot.doc : !editor || editor.state.doc !== snapshot.doc) return
    const prepared = prepareReplacements(replacement, targets, regex)
    if (prepared.error || !prepared.replacements) { setReplacementError(prepared.error ?? 'Cannot replace matches.'); return }
    const replacements = prepared.replacements
    if (mode === 'markdown' && view) {
      view.dispatch({ changes: targets.map((h, index) => ({ from: h.from, to: h.to, insert: replacements[index] })), annotations: [isolateHistory.of('full'), preserveEmbeddedFolds.of(all)] })
    } else if (editor && mode === 'wysiwyg') {
      const values = new Map(targets.map((hit, index) => [hit, replacements[index]]))
      replaceRendered(editor, { doc: editor.state.doc, hits }, targets, hit => values.get(hit)!)
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
      <output aria-live="polite">{!query ? 'Enter a search' : regex && !result ? 'Searching…' : result?.error ? result.error : hits.length ? `${index >= 0 ? `${index + 1} of ` : ''}${hits.length}${result?.limited ? '+' : ''} matches · wraps` : 'No matches'}</output>
      <label><input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} />Regex</label>
      <label><input type="checkbox" checked={caseSensitive} onChange={e => setCase(e.target.checked)} />Match case</label>
      <label><input type="checkbox" checked={wholeWord} onChange={e => setWord(e.target.checked)} />Whole word</label>
      <button type="button" onClick={onClose}>Close Find</button>
    </div>
    {replace && <div className="find-row"><label>Replace with<textarea rows={1} value={replacement} onChange={e => setReplacement(e.target.value)} /></label>
      <button type="button" disabled={!hits.length} onClick={() => replaceHits(false)}>Replace</button>
      <button type="button" disabled={!hits.length || !!result?.limited} onClick={() => replaceHits(true)}>Replace All</button></div>}
    {replacementError && <div role="alert">{replacementError}</div>}
    {regex && <div className="find-scope">JavaScript Unicode regex · $&amp; full match, $1–$99 or $&lt;name&gt; groups, $$ literal dollar · 2,000 results maximum. Group colors repeat after six; nested groups overlap. Zero-width matches are selectable but have no color.</div>}
    {regex && result && !result.error && <div className="find-scope" aria-label="Capture group legend">{Array.from(new Map(result.hits.flatMap(hit => hit.groups.map(group => [group.index, group] as const))).values()).sort((a, b) => a.index - b.index).map(group => <span key={group.index} className={`search-group search-group-${(group.index - 1) % 6}`}> Group {group.index}{group.name ? ` (${group.name})` : ''} </span>)}</div>}
    <div className="find-scope">{mode === 'markdown' ? 'Canonical Markdown source · includes folded content · multiline queries supported' : <>Editable rendered text · within each text block; diagram/image internals excluded. <button type="button" onClick={onSource}>Search source</button></>}</div>
  </div>
}
