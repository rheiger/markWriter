import { EditorState, type Extension } from '@codemirror/state'
import { history, historyField } from '@codemirror/commands'
import { codeFolding, foldState } from '@codemirror/language'
import { getSchema } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import type { Document } from '../store/useAppStore'
import { renderedEditorExtensions } from './renderedEditorExtensions'
import { restoreRenderedEngine, validInteger, type RenderedEngineTransfer } from './renderedHistoryTransfer'
import { editorText } from './sourceCoordinates'

const transferLimit = 8 * 1024 * 1024
const fields = { history: historyField, folds: foldState }
type SourceEngineTransfer = { doc: string; selection: unknown; history: { done: unknown[]; undone: unknown[] }; folds?: unknown }

export function captureSourceEngine(state: EditorState): SourceEngineTransfer {
  return state.toJSON(fields) as SourceEngineTransfer
}

export function restoreSourceEngine(input: SourceEngineTransfer, extensions: Extension) {
  if (typeof input?.doc !== 'string' || !Array.isArray(input.history?.done) || !Array.isArray(input.history?.undone) ||
      input.history.done.length > 4096 || input.history.undone.length > 4096) {
    throw new Error('The Markdown undo history cannot be moved safely.')
  }
  return EditorState.fromJSON(input, { extensions }, fields)
}

type SourcePatch = { semantic: string; prefix: number; suffix: number; original: string }
export type RenderedJournal = {
  depth: number
  previous: number
  patches: Map<number, SourcePatch>
  anchor: { depth: number; patch: SourcePatch } | null
}
type JournalTransfer = {
  depth: number
  previous: number
  values: SourcePatch[]
  patches: [number, number][]
  anchor: { depth: number; index: number } | null
}

export function captureRenderedJournal({ depth, previous, patches, anchor }: RenderedJournal): JournalTransfer {
  // The journal’s retention budget counts shared patches once and exempts
  // copies of the pinned baseline. Keep that identity through the JSON hop.
  const values: SourcePatch[] = []
  const indexes = new Map<SourcePatch, number>()
  const indexOf = (patch: SourcePatch) => {
    const existing = indexes.get(patch)
    if (existing !== undefined) return existing
    const index = values.length
    values.push(patch)
    indexes.set(patch, index)
    return index
  }
  return { depth, previous, values, patches: [...patches].map(([position, patch]) => [position, indexOf(patch)]),
    anchor: anchor && { depth: anchor.depth, index: indexOf(anchor.patch) } }
}

export function restoreRenderedJournal(journal: JournalTransfer): RenderedJournal {
  const validPatch = (patch: SourcePatch) => !!patch && typeof patch.semantic === 'string' && typeof patch.original === 'string' &&
    validInteger(patch.prefix) && validInteger(patch.suffix) && patch.prefix + patch.suffix <= patch.semantic.length
  const validIndex = (index: unknown): index is number => validInteger(index) && index < journal.values.length
  if (!journal || !validInteger(journal.depth) || !validInteger(journal.previous) ||
      !Array.isArray(journal.values) || journal.values.length > 129 || !journal.values.every(validPatch) ||
      !Array.isArray(journal.patches) || journal.patches.length > 128 ||
      !journal.patches.every(row => Array.isArray(row) && row.length === 2 && validInteger(row[0]) && validIndex(row[1])) ||
      (journal.anchor !== null && (!validInteger(journal.anchor?.depth) || !validIndex(journal.anchor.index)))) {
    throw new Error('The rendered Markdown history cannot be moved safely.')
  }
  const patches = new Map(journal.patches.map(([position, index]) => [position, journal.values[index]]))
  if (patches.size !== journal.patches.length) throw new Error('The rendered Markdown history contains duplicate positions.')
  const anchor = journal.anchor && { depth: journal.anchor.depth, patch: journal.values[journal.anchor.index] }
  return { depth: journal.depth, previous: journal.previous, patches, anchor }
}

export type EditorTransfer = {
  version: 1
  id: string
  revision: number
  mode: NonNullable<Document['mode']>
  source: SourceEngineTransfer | null
  sourceNewline: '\n' | '\r\n'
  rendered: RenderedEngineTransfer
  renderedSource: string
  renderedSemantic: string
  journal: JournalTransfer
  view: NonNullable<Document['viewState']>
  sourceViewportAnchor?: number
  split: number
}

function boundedJSON(value: unknown) {
  const serialized = JSON.stringify(value)
  if (!serialized || serialized.length > transferLimit || new TextEncoder().encode(serialized).length > transferLimit) {
    throw new Error('This tab’s editor state exceeds the 8 MiB move limit.')
  }
  return serialized
}

const viewKeys = new Set(['sourceAnchor', 'sourceHead', 'sourceScroll', 'previewScroll', 'renderedAnchor', 'renderedHead', 'renderedScroll'])
let schema: ReturnType<typeof getSchema> | undefined
function preflight(document: Document, data: EditorTransfer) {
  if (data?.version !== 1 || data.id !== document.id || data.revision !== (document.revision ?? 0) ||
      !['markdown', 'wysiwyg'].includes(data.mode) || data.mode !== (document.mode ?? 'wysiwyg') ||
      !['\n', '\r\n'].includes(data.sourceNewline) || typeof data.renderedSource !== 'string' ||
      typeof data.renderedSemantic !== 'string' || !Number.isFinite(data.split) || data.split < 20 || data.split > 80 ||
      (data.sourceViewportAnchor !== undefined && !validInteger(data.sourceViewportAnchor)) ||
      !data.view || Array.isArray(data.view) || typeof data.view !== 'object' ||
      !Object.entries(data.view).every(([key, value]) => viewKeys.has(key) && typeof value === 'number' &&
        Number.isFinite(value) && value >= 0 && (!/Anchor|Head/.test(key) || validInteger(value)))) {
    throw new Error('The captured editor state does not match this tab.')
  }
  if (data.mode === 'wysiwyg' && data.renderedSource !== document.content ||
      data.mode === 'markdown' && data.source?.doc !== editorText(document.content)) {
    throw new Error('The tab changed while preparing to move it. Try again.')
  }
  if (data.source !== null) restoreSourceEngine(data.source, [history(), codeFolding()])
  const rendered = restoreRenderedEngine(schema ??= getSchema(renderedEditorExtensions(undefined, false)), data.rendered)
  if (restoreRenderedJournal(data.journal).depth !== undoDepth(rendered)) {
    throw new Error('The rendered history does not match its Markdown journal.')
  }
}

export function validateEditorTransfer(document: Document, payload: unknown): EditorTransfer {
  const data = JSON.parse(boundedJSON(payload)) as EditorTransfer
  preflight(document, data)
  return data
}

const sessions = new Map<string, (document: Document) => EditorTransfer>()
const staged = new Map<string, {
  data: EditorTransfer
  hydrated: () => void
  failed: (cause: unknown) => void
}>()

export function registerEditorTransfer(id: string, capture: (document: Document) => EditorTransfer) {
  sessions.set(id, capture)
  return () => { if (sessions.get(id) === capture) sessions.delete(id) }
}

export function captureEditorTransfer(document: Document): EditorTransfer {
  const capture = sessions.get(document.id)
  if (!capture) throw new Error('Wait for this tab’s editor to finish loading, then try moving it again.')
  return validateEditorTransfer(document, capture(document))
}

/** Stage before mounting the imported tab. The caller owns rollback until ready resolves. */
export function stageEditorTransfer(document: Document, payload: unknown, options: { remount?: true } = {}) {
  if (staged.has(document.id) || (sessions.has(document.id) && !options.remount)) {
    throw new Error('An editor for this tab already exists in the destination window.')
  }
  const data = validateEditorTransfer(document, payload)
  let hydrated!: () => void
  let failed!: (cause: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    hydrated = () => { if (staged.get(document.id) === entry) { staged.delete(document.id); resolve() } }
    failed = cause => { if (staged.get(document.id) === entry) { staged.delete(document.id); reject(cause) } }
  })
  const entry = { data, hydrated, failed }
  staged.set(document.id, entry)
  return { ready, cancel: () => {
    if (staged.get(document.id) === entry) failed(new Error('The tab move was canceled.'))
  } }
}

export function stagedEditorTransfer(id: string | undefined) {
  return id === undefined ? undefined : staged.get(id)
}
