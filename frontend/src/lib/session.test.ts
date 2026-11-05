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
