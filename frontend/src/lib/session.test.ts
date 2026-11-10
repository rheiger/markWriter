import { describe, expect, it } from 'vitest'
import { restoreSnapshot, parseSession } from './session'
const doc = { id: 'a', title: 'a.md', path: '/a.md', content: 'draft', savedContent: 'original', isDirty: true }
const snapshot = { version: 1, activeId: 'a', documents: [doc] }
describe('local recovery and conflicts', () => {
  it('restores drafts and order while detecting externally changed original files', async () => {
    const restored = await restoreSnapshot(snapshot, true, async () => ({ content: 'external', path: '/a.md' }))
    expect(restored.documents[0]).toMatchObject({ content: 'draft', path: undefined, isDirty: true, conflictPath: '/a.md', diskContent: 'external' })
    expect(restored.activeId).toBe('a')
  })
  it('recovers deleted and unnamed drafts without overwriting their original path', async () => {
    const restored = await restoreSnapshot({ ...snapshot, documents: [doc, { ...doc, id: 'b', path: undefined }] }, false, async () => { throw new Error('Missing') })
    expect(restored.documents).toHaveLength(2)
    expect(restored.documents.every(d => !d.path && d.content === 'draft')).toBe(true)
  })
  it('loads current disk text for clean tabs and respects disabled session restore', async () => {
    const clean = { ...snapshot, documents: [{ ...doc, isDirty: false, content: 'original' }] }
    expect((await restoreSnapshot(clean, true, async () => ({ content: 'external', path: '/a.md' }))).documents[0].content).toBe('external')
    expect((await restoreSnapshot(clean, false, async () => ({ content: '' }))).documents).toHaveLength(0)
  })
  it('rejects malformed/newer snapshots and duplicate document ownership', () => {
    expect(() => parseSession({ ...snapshot, version: 9 })).toThrow(/version/)
    expect(() => parseSession({ ...snapshot, documents: [doc, doc] })).toThrow(/duplicate/i)
    expect(() => parseSession({ ...snapshot, documents: [{ ...doc, content: null }] })).toThrow(/document/i)
  })
})

it('validates optional persisted navigation metadata separately from content', () => {
  const document = { id: 'view', title: 'View', content: 'text', isDirty: false, lastModified: new Date(), sourceViewportAnchor: 4, viewState: { sourceAnchor: 0, sourceHead: 3, sourceScroll: 1.5 } }
  expect(parseSession({ version: 1, documents: [document], activeId: 'view' }).documents[0]).toMatchObject(document)
  expect(() => parseSession({ version: 1, documents: [{ ...document, viewState: { sourceHead: -1 } }] })).toThrow(/view state/)
})

it('retains navigation for closed files and clean tabs omitted by session restore', async () => {
  const closed = { path: '/closed.md', mode: 'markdown', viewState: { sourceScroll: 250 } }
  const result = await restoreSnapshot({ ...snapshot, fileViews: [closed],
    documents: [{ ...doc, isDirty: false, mode: 'wysiwyg', viewState: { renderedScroll: 500 } }] },
    false, async () => { throw new Error('Should not read closed files') })
  expect(result.documents).toHaveLength(0)
  expect(result.fileViews).toEqual([
    { path: '/a.md', mode: 'wysiwyg', viewState: { renderedScroll: 500 } },
    closed,
  ])
})
