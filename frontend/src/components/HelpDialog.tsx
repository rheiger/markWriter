import { useEffect, useRef, useState, type RefObject } from 'react'
import { findHelpTopics, helpTopics, type HelpTopic } from './HelpContent'
import './HelpDialog.css'

interface HelpDialogProps {
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement>
}

function TopicContent({ topic }: { topic: HelpTopic }) {
  return <>
    <h3>{topic.title}</h3>
    {topic.blocks.map((block, index) => {
      switch (block.kind) {
        case 'paragraph': return <p key={index}>{block.text}</p>
        case 'example': return <figure key={index}><figcaption>{block.label}</figcaption><pre><code>{block.code}</code></pre></figure>
        case 'shortcuts': return <div className="help-table-wrap" key={index}><table>
          <thead><tr><th scope="col">Action</th><th scope="col">macOS</th><th scope="col">Windows / Linux</th></tr></thead>
          <tbody>{block.rows.map(row => <tr key={row.action}><th scope="row">{row.action}</th><td>{row.mac}</td><td>{row.other}</td></tr>)}</tbody>
        </table></div>
      }
    })}
  </>
}

export function HelpDialog({ onClose, returnFocusRef }: HelpDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const article = useRef<HTMLElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(helpTopics[0].id)
  const topics = findHelpTopics(query)
  const active = topics.find(topic => topic.id === selected) ?? topics[0]

  useEffect(() => {
    const previous = returnFocusRef?.current ?? document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    search.current?.focus()
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [returnFocusRef])
  useEffect(() => { if (article.current) article.current.scrollTop = 0 }, [active?.id])

  return <dialog ref={dialog} className="help-dialog" aria-labelledby="help-title"
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); onClose(); return
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]') ?? [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <header className="help-header">
      <div><h2 id="help-title">MarkWriter Help</h2><p>A guide available offline</p></div>
      <label className="help-search">Search help<input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search topics" /></label>
    </header>
    <div className="help-body">
      <nav className="help-topics" aria-label="Help topics">
        <p aria-live="polite">{query.trim() ? `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} found` : 'Topics'}</p>
        {topics.map(topic => <button key={topic.id} type="button" aria-pressed={active?.id === topic.id} onClick={() => setSelected(topic.id)}>{topic.title}</button>)}
      </nav>
      <article className="help-content" ref={article}>
        {active ? <TopicContent topic={active} /> : <p>No help topics match your search. Try another word or clear the search.</p>}
      </article>
    </div>
    <footer className="help-actions"><button type="button" onClick={onClose}>Close</button></footer>
  </dialog>
}
