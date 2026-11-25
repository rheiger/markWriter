import type { Document } from '../store/useAppStore'
import type { EditorTransfer } from './editorTransfer'

type LiveEditorSession = {
  capture: (document: Document) => EditorTransfer
  isComposing: () => boolean
}
const sessions = new Map<string, LiveEditorSession>()

export function registerEditorTransfer(id: string, session: LiveEditorSession) {
  sessions.set(id, session)
  return () => { if (sessions.get(id) === session) sessions.delete(id) }
}

export function editorTransferSession(id: string) {
  return sessions.get(id)
}

export function editorIsComposing(id: string) {
  return sessions.get(id)?.isComposing() ?? false
}
