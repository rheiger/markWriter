import { useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { Modal } from './Modal'
import './Workspace.css'

export function DocumentTabs() {
  const { documents, currentDocument, activateDocument, closeDocument, reorderDocument } = useAppStore()
  const dragging = useRef<string | null>(null)
  return <div className="document-tabs" role="tablist" aria-label="Documents">
    {documents.map((doc, index) => <div className="document-tab" key={doc.id} draggable
      onDragStart={() => { dragging.current = doc.id }} onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (dragging.current) reorderDocument(dragging.current, index); dragging.current = null }}>
      <button role="tab" aria-selected={doc.id === currentDocument?.id} title={doc.path || doc.title}
        tabIndex={doc.id === currentDocument?.id ? 0 : -1} onClick={() => activateDocument(doc.id)}
        onKeyDown={event => {
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
          if (!delta) return
          event.preventDefault()
          if (event.altKey) reorderDocument(doc.id, index + delta)
          else {
            const next = documents[(index + delta + documents.length) % documents.length]
            activateDocument(next.id)
            const tabs = event.currentTarget.closest('[role=tablist]')?.querySelectorAll<HTMLElement>('[role=tab]')
            tabs?.[(index + delta + documents.length) % documents.length]?.focus()
          }
        }}>
        {doc.isDirty && <span aria-label="Unsaved">● </span>}
        {documents.some(other => other.id !== doc.id && other.title === doc.title) ? doc.path || doc.title : doc.title}
      </button>
      <button aria-label={`Close ${doc.title}`} title="Close tab" onClick={() => void closeDocument(doc.id)}>×</button>
    </div>)}
  </div>
}

export function UnsavedDialog() {
  const pending = useAppStore(state => state.pendingClose)
  if (!pending) return null
  return <Modal title="Unsaved changes" onClose={() => pending.resolve('cancel')}>
    <p>Save changes to “{pending.title}” before closing?</p>
    <div className="dialog-actions">
      <button onClick={() => pending.resolve('cancel')}>Cancel</button>
      <button onClick={() => pending.resolve('discard')}>Discard</button>
      <button autoFocus onClick={() => pending.resolve('save')}>Save</button>
    </div>
  </Modal>
}

export function RecoveryNotice() {
  const { currentDocument: doc, openDocument } = useAppStore()
  if (!doc?.conflictPath) return null
  return <div className="recovery-notice" role="status">
    <span>Recovery copy of {doc.conflictPath}. The original file is unchanged.</span>
    <button onClick={() => void openDocument(doc.conflictPath)}>Open disk version</button>
    <button onClick={() => {
      const state = useAppStore.getState()
      const documents = state.documents.map(d => d.id === doc.id ? { ...d, conflictPath: undefined, diskContent: undefined } : d)
      useAppStore.setState({ documents, currentDocument: documents.find(d => d.id === state.currentDocument?.id) ?? null })
    }}>Keep recovery copy</button>
  </div>
}
