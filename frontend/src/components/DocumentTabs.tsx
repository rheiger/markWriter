import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { isTauri } from '@tauri-apps/api/core'
import { moveEditorDocument } from '../lib/windowWorkspace'
import { WindowPicker } from './WindowPicker'
import { diskIssueMessage, saveCopyWithDialog, useAppStore, type Document } from '../store/useAppStore'
import { Modal } from './Modal'
import './Workspace.css'

export function DocumentTabs() {
  const { documents, currentDocument, activateDocument, closeDocument, closeOtherDocuments, reorderDocument, windowBusy } = useAppStore()
  const dragging = useRef<string | null>(null)
  const tabList = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ id: string, trigger: HTMLElement, x: number, y: number } | null>(null)
  const [moveTab, setMoveTab] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOwner = !windowBusy && menu && documents.find(doc => doc.id === menu.id)
  const showMenu = Boolean(menuOwner)

  useLayoutEffect(() => {
    const popup = menuRef.current
    if (!showMenu || !menu || !popup) return
    const { width, height } = popup.getBoundingClientRect()
    popup.style.left = `${Math.max(0, Math.min(menu.x, window.innerWidth - width))}px`
    popup.style.top = `${Math.max(0, Math.min(menu.y, window.innerHeight - height))}px`
    popup.querySelector<HTMLElement>('button')?.focus()
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !popup.contains(event.target)) setMenu(null)
    }
    const dismissOnResize = () => {
      setMenu(null)
      if (popup.contains(document.activeElement)) menu.trigger.focus()
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    window.addEventListener('resize', dismissOnResize)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      window.removeEventListener('resize', dismissOnResize)
    }
  }, [menu, showMenu])

  const dismissMenu = () => {
    setMenu(null)
    menu?.trigger.focus({ preventScroll: true })
  }

  const handleMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      event.stopPropagation()
      if (event.key === 'Escape') event.preventDefault()
      dismissMenu()
      return
    }
    const items = Array.from(event.currentTarget.querySelectorAll('button'))
    const index = items.findIndex(item => item === event.target)
    let next: number
    switch (event.key) {
      case 'ArrowDown': next = (index + 1) % items.length; break
      case 'ArrowUp': next = (index + items.length - 1) % items.length; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    event.preventDefault()
    items[next]?.focus()
  }

  const runMenuAction = async (other: boolean) => {
    if (!menu || (other && documents.length < 2)) return
    dismissMenu()
    if (other) await closeOtherDocuments(menu.id)
    else await closeDocument(menu.id)
    if (!menu.trigger.isConnected && document.activeElement === document.body) {
      tabList.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus()
    }
  }

  return <>
    <div ref={tabList} className="document-tabs" role="tablist" aria-label="Documents">
    {documents.map((doc, index) => <div className="document-tab" key={doc.id} draggable
      onContextMenu={event => {
        event.preventDefault()
        const trigger = event.currentTarget.querySelector<HTMLButtonElement>('[role=tab]')
        if (trigger) setMenu({ id: doc.id, trigger, x: event.clientX, y: event.clientY })
      }}
      onKeyDown={event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
        event.preventDefault()
        event.stopPropagation()
        const trigger = event.target
        if (!(trigger instanceof HTMLElement)) return
        const rect = trigger.getBoundingClientRect()
        setMenu({ id: doc.id, trigger, x: rect.left, y: rect.bottom })
      }}
      onDragStart={() => { dragging.current = doc.id }} onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (dragging.current) reorderDocument(dragging.current, index); dragging.current = null }}>
      <button role="tab" aria-selected={doc.id === currentDocument?.id} aria-haspopup="menu" aria-expanded={!!menuOwner && menuOwner.id === doc.id}
        title={doc.path || doc.title}
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
        {doc.diskIssue && <span role="img" aria-label={doc.diskIssue === 'tooLarge' ? 'Disk check unavailable' : 'External file change'}
          title={diskIssueMessage(doc.diskIssue)}>⚠ </span>}
        {documents.some(other => other.id !== doc.id && other.title === doc.title) ? doc.path || doc.title : doc.title}
      </button>
      <button aria-label={`Close ${doc.title}`} title="Close tab" onClick={() => void closeDocument(doc.id)}>×</button>
    </div>)}
    {menuOwner && createPortal(
      <div ref={menuRef} className="document-tab-menu" role="menu" aria-label={`Tab actions for ${menuOwner.title}`} onKeyDown={handleMenuKey}>
        <button role="menuitem" tabIndex={-1} onClick={() => void runMenuAction(false)}>Close Tab</button>
        <button role="menuitem" tabIndex={-1} aria-disabled={documents.length < 2}
          onClick={() => void runMenuAction(true)}>Close Other Tabs</button>
        {isTauri() && <button role="menuitem" tabIndex={-1} onClick={() => {
          if (!menu) return
          dismissMenu()
          setMoveTab(menu.id)
        }}>Move Tab to Window…</button>}
      </div>,
      document.body,
    )}
    </div>
    {moveTab && <WindowPicker move onClose={() => setMoveTab(null)} onChoose={label => {
      setMoveTab(null)
      void moveEditorDocument(moveTab, label)
    }} />}
  </>
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

export function ExternalChangeNotice() {
  const doc = useAppStore(state => state.currentDocument)
  const busy = useAppStore(state => state.isLoading)
  const pending = useAppStore(state => state.pendingDiskReload)
  const [copied, setCopied] = useState<Document>()
  const cancel = () => useAppStore.setState({ pendingDiskReload: null })
  const reload = async (document: Document, discardEdits: boolean) => {
    useAppStore.setState({ pendingDiskReload: { document, loading: true } })
    try { await useAppStore.getState().reloadDocument(document, discardEdits) }
    finally { cancel() }
  }
  return <>
    {doc?.diskIssue && <div className="recovery-notice external-change">
      <span role="status">{diskIssueMessage(doc.diskIssue)}{copied?.id === doc.id && copied.revision === doc.revision && ' Copy saved.'}</span>
      <button disabled={busy || doc.diskIssue === 'missing' || doc.diskIssue === 'unreadable'} onClick={() => {
        if (doc.isDirty) useAppStore.setState({ pendingDiskReload: { document: doc, loading: false } })
        else void reload(doc, false)
      }}>Reload from Disk</button>
      <button disabled={busy} onClick={async () => {
        setCopied(undefined)
        if (await saveCopyWithDialog(doc)) setCopied(doc)
      }}>Save a Copy…</button>
    </div>}
    {pending && (pending.loading ?
      <Modal title="Reloading from Disk" onClose={() => {}}>
        <p role="status">Reading “{pending.document.title}”…</p>
      </Modal> :
      <Modal title="Discard unsaved edits?" onClose={cancel}>
        <p>Reload “{pending.document.title}” from disk and discard your unsaved edits?</p>
        <div className="dialog-actions">
          <button autoFocus onClick={cancel}>Cancel</button>
          <button onClick={() => void reload(pending.document, true)}>Discard and Reload</button>
        </div>
      </Modal>)}
  </>
}
