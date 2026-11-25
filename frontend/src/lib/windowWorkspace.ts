import { invoke } from '@tauri-apps/api/core'
import { captureEditorTransfer, stageEditorTransfer } from './editorTransfer'
import { adoptWorkspaceEpoch, currentWorkspaceEpoch, flushWorkspace, snapshotWorkspace } from './persistence'
import { parseSession } from './session'
import {
  planWindowClose, suspendWindowWorkspace, useAppStore, workspaceAfterRemoving, type Document, type DocumentOwner,
} from '../store/useAppStore'

export interface EditorWindow { label: string, title: string, focused: boolean }

interface WindowTransfer {
  document: unknown
  session?: unknown
}
interface PendingTransfers {
  epoch: number
  transfers: WindowTransfer[]
}

const store = useAppStore
function reportWindowError(message: string, error?: unknown) {
  store.getState().setError(error === undefined ? message : `${message}: ${String(error)}`)
}

export async function listEditorWindows() {
  return await invoke<EditorWindow[] | null>('list_editor_windows') ?? []
}

export async function createEditorWindow() {
  try { return await invoke<string>('create_editor_window') }
  catch (error) { reportWindowError('Could not open a new window', error) }
}

export async function focusEditorWindow(label: string, id?: string) {
  try { await invoke('focus_editor_window', { label, id }) }
  catch (error) { reportWindowError('Could not focus the window', error) }
}

export async function moveEditorDocument(id: string, destination?: string) {
  const resume = suspendWindowWorkspace()
  if (!resume) {
    reportWindowError('Finish the current document operation before moving the tab.')
    return false
  }

  let target = destination
  try {
    const document = store.getState().documents.find(doc => doc.id === id)
    if (!document) return false
    // Capture before awaiting native IPC. The lock also keeps the source
    // snapshot stable while earlier recovery writes settle.
    const session = captureEditorTransfer(document)
    await flushWorkspace()
    if (!target) {
      target = await createEditorWindow()
      if (!target) return false
    }
    const source = snapshotWorkspace()
    source.documents = source.documents.map(doc => doc.id === id
      ? { ...doc, mode: session.mode, viewState: session.view, sourceViewportAnchor: session.sourceViewportAnchor }
      : doc)
    const args = { transactionId: crypto.randomUUID(), destination: target, id, source,
      epoch: currentWorkspaceEpoch(), session }
    const commit = () => invoke<{ epoch: number }>('move_editor_document', args)
    let result: { epoch: number }
    try { result = await commit() }
    catch (firstFailure) {
      // Retrying the same transaction cannot move the tab twice.
      try { result = await commit() }
      catch {
        const status = await invoke<{ owner: DocumentOwner | null, epoch: number }>('editor_document_owner', { id })
        if (status.owner?.label !== target) throw firstFailure
        result = status
      }
    }
    adoptWorkspaceEpoch(result.epoch)
    store.setState(state => workspaceAfterRemoving(state, id))
  } catch (error) {
    reportWindowError('Could not move the tab', error)
    return false
  } finally {
    resume()
  }
  await focusEditorWindow(target, id)
  return true
}

interface IncomingHistory {
  ready: Promise<{ ok: true } | { ok: false, error: unknown }>
  failed: boolean
}

const incoming = new Map<string, IncomingHistory>()
let resumeReceiving: (() => void) | undefined

function stageHistory(doc: Document, session: unknown, remount: boolean): IncomingHistory {
  try {
    const staged = stageEditorTransfer(doc, session, remount ? { remount: true } : undefined)
    return { ready: staged.ready.then(() => ({ ok: true }), error => ({ ok: false, error })), failed: false }
  } catch (error) {
    return { ready: Promise.resolve({ ok: false, error }), failed: false }
  }
}

function prepareTransfers({ epoch, transfers }: PendingTransfers, retryId?: string) {
  const state = store.getState()
  const seen = new Set<string>()
  const documents = [...state.documents]
  let active = state.currentDocument
  for (const transfer of transfers) {
    const doc = parseSession({ version: 1, documents: [transfer.document] }).documents[0]
    seen.add(doc.id)
    if (incoming.has(doc.id) && doc.id !== retryId) continue
    const index = documents.findIndex(document => document.id === doc.id)
    const existing = documents[index]
    const retrying = doc.id === retryId && !!existing
    const installed = retrying ? { ...doc, reloadCount: (existing.reloadCount ?? 0) + 1 } : doc
    incoming.set(doc.id, stageHistory(installed, transfer.session, retrying))
    if (index < 0) documents.push(installed)
    else documents[index] = installed
    if (!active || active.id === installed.id) active = installed
  }
  for (const id of incoming.keys()) if (!seen.has(id)) incoming.delete(id)
  adoptWorkspaceEpoch(epoch)
  store.setState({ documents, currentDocument: active })
}

export async function prepareInitialTransfers() {
  try {
    const pending = await invoke<PendingTransfers | null>('take_editor_transfers')
    if (pending?.transfers.length) prepareTransfers(pending)
  } catch (error) { reportWindowError('Could not check for incoming tabs', error) }
}

async function finishIncomingTransfers(retryId?: string) {
  const pending = await invoke<PendingTransfers | null>('take_editor_transfers')
  if (!pending?.transfers.length) { incoming.clear(); return }
  prepareTransfers(pending, retryId)
  for (const [id, history] of incoming) {
    const hydrated = await history.ready
    if (!hydrated.ok) {
      history.failed = true
      store.setState({ transferRecovery: { id, message: String(hydrated.error) } })
      return
    }
    await invoke('ack_editor_transfer', { id })
    incoming.delete(id)
  }
}

export async function receiveEditorTransfers(): Promise<boolean> {
  if (store.getState().transferRecovery) return true
  if (resumeReceiving || document.querySelector('dialog[open]')) return false
  const resume = suspendWindowWorkspace()
  if (!resume) return false
  resumeReceiving = resume
  try {
    await finishIncomingTransfers()
    return true
  } catch (error) {
    reportWindowError('Could not finish receiving a tab', error)
    return false
  } finally {
    if (!store.getState().transferRecovery) {
      resumeReceiving?.()
      resumeReceiving = undefined
    }
  }
}

export async function recoverEditorTransfer(id: string, retryHistory: boolean) {
  const recovery = store.getState().transferRecovery
  if (recovery?.id !== id || !incoming.get(id)?.failed) return
  store.setState({ transferRecovery: null })
  try {
    if (!retryHistory) {
      // Until the user chooses this fallback, the inbox retains the history.
      await invoke('ack_editor_transfer', { id })
      incoming.delete(id)
      store.setState(state => {
        const documents = state.documents.map(doc => doc.id === id ? { ...doc, reloadCount: (doc.reloadCount ?? 0) + 1 } : doc)
        return { documents, currentDocument: documents.find(doc => doc.id === state.currentDocument?.id) ?? null }
      })
    }
    await finishIncomingTransfers(retryHistory ? id : undefined)
  } catch (error) {
    if (incoming.get(id)?.failed) store.setState({ transferRecovery: { id, message: String(error) } })
    else reportWindowError('Could not finish receiving a tab', error)
  } finally {
    if (!store.getState().transferRecovery) {
      resumeReceiving?.()
      resumeReceiving = undefined
    }
  }
}

export async function closeEditorWindow() {
  const resume = suspendWindowWorkspace()
  if (!resume) {
    reportWindowError('Finish the current document operation before closing the window.')
    return
  }
  try {
    const value = await planWindowClose()
    if (!value) return
    // Keep the original drafts durable until native close actually commits.
    await flushWorkspace()
    await invoke('finish_editor_window_close', { value, epoch: currentWorkspaceEpoch() })
  } catch (error) { reportWindowError('Could not close the window', error) }
  finally { resume() }
}

export async function requestAppQuit() {
  try { await invoke('quit_app') }
  catch (error) { reportWindowError('Could not quit MarkWriter', error) }
}

let quitReview: { token: string, resume: () => void } | undefined
export async function reviewAppQuit(token: string) {
  if (quitReview?.token === token) return
  const resume = !document.querySelector('dialog[open]') ? suspendWindowWorkspace() : undefined
  const review = resume ? { token, resume } : undefined
  if (review) quitReview = review
  try {
    const value = review && await planWindowClose()
    if (review && quitReview !== review) return
    if (value) await flushWorkspace()
    if (review && quitReview !== review) return
    await invoke('answer_app_quit', { token, allowed: !!value, value: value || undefined, epoch: currentWorkspaceEpoch() })
    if (!value) cancelAppQuit(token)
  } catch (error) {
    cancelAppQuit(token)
    reportWindowError('Could not prepare the window to quit', error)
    try { await invoke('answer_app_quit', { token, allowed: false }) }
    catch { /* The original failure is already visible. */ }
  }
}

export function cancelAppQuit(token: string, message?: string) {
  if (quitReview?.token === token) {
    const review = quitReview
    quitReview = undefined
    store.getState().pendingClose?.resolve('cancel')
    review.resume()
  }
  if (message) reportWindowError(message)
}
