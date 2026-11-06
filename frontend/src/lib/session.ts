import type { Document } from '../store/useAppStore'

export interface SessionSnapshot { version: 1, activeId: string | null, documents: Document[] }
export function parseSession(value: unknown): SessionSnapshot {
  const record = value as Record<string, unknown> | null
  if (!record || ![0, 1].includes(record.version as number)) throw new Error('Unsupported workspace version')
  if (!Array.isArray(record.documents)) throw new Error('Invalid workspace documents')
  const ids = new Set<string>(), paths = new Set<string>()
  const documents = record.documents.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid recovery document')
    const doc = item as Document
    if (typeof doc.id !== 'string' || !doc.id || typeof doc.title !== 'string' || typeof doc.content !== 'string' || typeof doc.isDirty !== 'boolean' ||
      (doc.path !== undefined && typeof doc.path !== 'string') || (doc.savedContent !== undefined && typeof doc.savedContent !== 'string') || (doc.mode !== undefined && doc.mode !== 'markdown' && doc.mode !== 'wysiwyg') || (doc.conflictPath !== undefined && typeof doc.conflictPath !== 'string')) throw new Error('Invalid recovery document')
    if (ids.has(doc.id) || (doc.path && paths.has(doc.path))) throw new Error('Duplicate recovery document ownership')
    if (doc.viewState !== undefined && (!doc.viewState || typeof doc.viewState !== 'object' || Array.isArray(doc.viewState) || Object.entries(doc.viewState).some(([key, value]) => !['sourceAnchor', 'sourceHead', 'sourceScroll', 'previewScroll', 'renderedAnchor', 'renderedHead', 'renderedScroll'].includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (/Anchor|Head/.test(key) && !Number.isInteger(value))))) throw new Error('Invalid recovery view state')
    ids.add(doc.id); if (doc.path) paths.add(doc.path)
    return { ...doc, lastModified: new Date(doc.lastModified || Date.now()) }
  })
  return { version: 1, documents, activeId: typeof record.activeId === 'string' ? record.activeId : documents[0]?.id ?? null }
}
export async function restoreSnapshot(value: unknown, restoreClean: boolean, read: (path: string) => Promise<{ content: string, path?: string }>) {
  const parsed = parseSession(value)
  const documents: Document[] = []
  const warnings: string[] = []
  for (const doc of parsed.documents) {
    if (!restoreClean && !doc.isDirty) continue
    if (!doc.path) { documents.push(doc); continue }
    try {
      const disk = await read(doc.path)
      if (doc.isDirty && disk.content !== (doc.savedContent ?? '')) {
        documents.push({ ...doc, title: `${doc.title} (recovery)`, path: undefined, conflictPath: doc.path, diskContent: disk.content })
        warnings.push(`External changes: ${doc.path}. Your draft is a separate recovery copy.`)
      } else documents.push({ ...doc, path: disk.path || doc.path, content: doc.isDirty ? doc.content : disk.content,
        savedContent: disk.content, isDirty: doc.isDirty && doc.content !== disk.content })
    } catch {
      documents.push({ ...doc, title: `${doc.title} (recovery)`, path: undefined, conflictPath: doc.path, isDirty: true })
      warnings.push(`Missing/unreadable file: ${doc.path}. A local recovery copy is open.`)
    }
  }
  return { documents, warnings, activeId: documents.some(d => d.id === parsed.activeId) ? parsed.activeId : documents[0]?.id ?? null }
}
