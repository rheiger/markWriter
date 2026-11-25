import { history } from '@tiptap/pm/history'
import { AllSelection, EditorState, NodeSelection, TextSelection, type Plugin, type SelectionBookmark } from '@tiptap/pm/state'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { CellBookmark } from '@tiptap/pm/tables'
import { Step, StepMap } from '@tiptap/pm/transform'
import type { Schema } from '@tiptap/pm/model'
import type { JSONContent } from '@tiptap/core'

type HistoryItem = { map: StepMap; step?: Step; selection?: SelectionBookmark; mirrorOffset?: number }
type HistoryItems = {
  length: number
  forEach: (callback: (item: HistoryItem) => void) => void
  get: (index: number) => HistoryItem | undefined
  append: (items: HistoryItem[]) => HistoryItems
}
type HistoryBranch = { items: HistoryItems; eventCount: number }
type HistoryState = {
  done: HistoryBranch; undone: HistoryBranch; prevRanges: number[] | null; prevTime: number; prevComposition: number
}
type TransferBookmark = { type: 'all' } | { type: 'node' | 'gap'; anchor: number } |
  { type: 'text' | 'cell'; anchor: number; head: number }
type TransferItem = { ranges: number[]; inverted: boolean; step?: unknown; selection?: TransferBookmark; mirrorOffset?: number }
export type RenderedEngineTransfer = {
  editor: { doc: JSONContent; selection: unknown; storedMarks?: unknown[] }
  done: TransferItem[]
  undone: TransferItem[]
  prevRanges: number[] | null
  prevTime: number
  prevComposition: number
}

const probe = history()
const historyKey = probe.spec.key!
const maxBranchItems = 4096
const allBookmark = AllSelection.prototype.getBookmark()
type BookmarkClass = new (anchor: number, head?: number) => SelectionBookmark
const textBookmark = TextSelection.prototype.getBookmark.call({ anchor: 0, head: 0 })
const nodeBookmark = NodeSelection.prototype.getBookmark.call({ anchor: 0 })
const gapBookmark = GapCursor.prototype.getBookmark.call({ anchor: 0 })
const bookmarkClasses = {
  text: textBookmark.constructor as BookmarkClass,
  node: nodeBookmark.constructor as BookmarkClass,
  gap: gapBookmark.constructor as BookmarkClass,
}

export function validInteger(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
}

function handoffFailure(): never {
  throw new Error('The rendered undo history cannot be moved safely.')
}

// Pinned prosemirror-history 1.5.1 has no public plugin-state codec. Only
// this adapter accesses its runtime fields and constructors. Preserve each
// step map and mirror, including non-history edits that remap older events.
function historyState(state: EditorState): HistoryState {
  const value = historyKey.getState(state) as HistoryState | undefined
  if (!value || !validInteger(value.prevTime) || !validInteger(value.prevComposition, -1) ||
      ![value.done, value.undone].every(branch => branch && validInteger(branch.eventCount) &&
        validInteger(branch.items?.length) && typeof branch.items.forEach === 'function' &&
        typeof branch.items.get === 'function' && typeof branch.items.append === 'function')) return handoffFailure()
  return value
}

function encodeBookmark(bookmark: SelectionBookmark): TransferBookmark {
  if (bookmark === allBookmark) return { type: 'all' }
  if (bookmark instanceof CellBookmark) return { type: 'cell', anchor: bookmark.anchor, head: bookmark.head }
  const fields = bookmark as SelectionBookmark & { anchor: number; head: number; pos: number }
  const bookmarkClass: unknown = bookmark.constructor
  if (bookmarkClass === bookmarkClasses.text) return { type: 'text', anchor: fields.anchor, head: fields.head }
  if (bookmarkClass === bookmarkClasses.node) return { type: 'node', anchor: fields.anchor }
  if (bookmarkClass === bookmarkClasses.gap) return { type: 'gap', anchor: fields.pos }
  return handoffFailure()
}

function decodeBookmark(bookmark: TransferBookmark): SelectionBookmark {
  if (bookmark?.type === 'all') return allBookmark
  if (!bookmark || !('anchor' in bookmark) || !validInteger(bookmark.anchor)) return handoffFailure()
  if (bookmark.type === 'node' || bookmark.type === 'gap') return new bookmarkClasses[bookmark.type](bookmark.anchor)
  if (!('head' in bookmark) || !validInteger(bookmark.head)) return handoffFailure()
  if (bookmark.type === 'text') return new bookmarkClasses.text(bookmark.anchor, bookmark.head)
  if (bookmark.type === 'cell') return new CellBookmark(bookmark.anchor, bookmark.head)
  return handoffFailure()
}

function encodeBranch(branch: HistoryBranch): TransferItem[] {
  if (branch.items.length > maxBranchItems) return handoffFailure()
  const items: TransferItem[] = []
  branch.items.forEach(item => {
    const map = item.map as StepMap & { ranges: readonly number[]; inverted: boolean }
    if (!Array.isArray(map.ranges) || typeof map.inverted !== 'boolean') return handoffFailure()
    items.push({
      ranges: [...map.ranges],
      inverted: map.inverted,
      ...(item.step && { step: item.step.toJSON() }),
      ...(item.selection && { selection: encodeBookmark(item.selection) }),
      ...(item.mirrorOffset !== undefined && { mirrorOffset: item.mirrorOffset }),
    })
  })
  if (items.filter(item => item.selection).length !== branch.eventCount) return handoffFailure()
  return items
}

export function captureRenderedEngine(state: EditorState): RenderedEngineTransfer {
  const { done, undone, prevRanges, prevTime, prevComposition } = historyState(state)
  return { editor: state.toJSON(), done: encodeBranch(done), undone: encodeBranch(undone),
    prevRanges: prevRanges && [...prevRanges], prevTime, prevComposition }
}

const factories = new WeakMap<Schema, {
  Branch: new (items: HistoryItems, eventCount: number) => HistoryBranch
  Item: new (map: StepMap, step?: Step, selection?: SelectionBookmark, mirrorOffset?: number) => HistoryItem
  State: new (done: HistoryBranch, undone: HistoryBranch, ranges: number[] | null, time: number, composition: number) => HistoryState
  empty: HistoryItems
}>()

function historyFactories(schema: Schema) {
  const cached = factories.get(schema)
  if (cached) return cached
  // Derive constructors from a throwaway history with one known edit. There
  // is no need to fork or replace the production ProseMirror history plugin.
  const initial = EditorState.create({ schema, plugins: [probe] })
  const empty = historyState(initial)
  const sample = historyState(initial.apply(initial.tr.insertText('x', 1))).done.items.get(0)
  if (!sample || typeof (sample as HistoryItem & { merge?: unknown }).merge !== 'function') return handoffFailure()
  const value = {
    Branch: empty.done.constructor as NonNullable<ReturnType<typeof factories.get>>['Branch'],
    Item: sample.constructor as NonNullable<ReturnType<typeof factories.get>>['Item'],
    State: empty.constructor as NonNullable<ReturnType<typeof factories.get>>['State'],
    empty: empty.done.items,
  }
  factories.set(schema, value)
  return value
}

function decodeBranch(schema: Schema, input: TransferItem[]): HistoryBranch {
  if (!Array.isArray(input) || input.length > maxBranchItems) return handoffFailure()
  const { Branch, Item, empty } = historyFactories(schema)
  let eventCount = 0
  const items = input.map(item => {
    // A retained mapping can still refer to an item pruned below this branch.
    // ProseMirror ignores such mirrors when building its bounded remapping.
    if (!item || !Array.isArray(item.ranges) || item.ranges.length % 3 !== 0 ||
        item.ranges.some((entry: unknown) => !validInteger(entry)) || typeof item.inverted !== 'boolean' ||
        (item.mirrorOffset !== undefined && !validInteger(item.mirrorOffset, 1)) ||
        (item.selection && !item.step)) return handoffFailure()
    const selection = item.selection && decodeBookmark(item.selection)
    if (selection) eventCount++
    return new Item(new StepMap(item.ranges, item.inverted), item.step === undefined ? undefined : Step.fromJSON(schema, item.step),
      selection, item.mirrorOffset)
  })
  return new Branch(empty.append(items), eventCount)
}

export function restoreRenderedEngine(schema: Schema, input: RenderedEngineTransfer, plugins: readonly Plugin[] = [probe]): EditorState {
  if (!input?.editor || !validInteger(input.prevTime) || !validInteger(input.prevComposition, -1) ||
      (input.prevRanges !== null && (!Array.isArray(input.prevRanges) || input.prevRanges.length % 2 !== 0 ||
        input.prevRanges.some(entry => !validInteger(entry))))) return handoffFailure()
  const state = EditorState.fromJSON({ schema, plugins }, input.editor)
  state.doc.check()
  const { State } = historyFactories(schema)
  const restored = new State(decodeBranch(schema, input.done), decodeBranch(schema, input.undone),
    input.prevRanges, input.prevTime, input.prevComposition)
  // Same metadata the installed history plugin uses when applying an undo.
  // It is a state-only transaction with no document changes or synthetic edits.
  const result = state.apply(state.tr.setMeta(historyKey, { historyState: restored, redo: false }))
  if (historyState(result) !== restored || !result.doc.eq(state.doc) || !result.selection.eq(state.selection)) return handoffFailure()
  return result
}
