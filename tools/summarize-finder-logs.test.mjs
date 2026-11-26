import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeFinderLogs } from './summarize-finder-logs.mjs'
const path = '/test/MarkWriter.app/QuickLookPrototype'
const event = (message, time, pid = 7, executable = path) => JSON.stringify({ processImagePath: executable, processID: pid, timestamp: time, eventMessage: message })
const start = event('Starting local renderer', '2026-11-26T12:00:00Z')
const complete = event('Local renderer completed', '2026-11-26T12:00:02Z')
test('returns process events without inventing a request duration or pairing', () => {
  const result = summarizeFinderLogs([start, start, complete, complete].join('\n'), path)
  assert.equal(result.events.length, 4)
  assert.match(result.scope, /Uncorrelated/)
  assert.equal(result.rendererElapsedMs, undefined)
})
test('rejects observations from another provider and missing process identities', () => {
  assert.throws(() => summarizeFinderLogs(event('Local renderer completed', '2026-11-26T12:00:02Z', 7, '/other'), path))
  assert.throws(() => summarizeFinderLogs(JSON.stringify({ processImagePath: path, timestamp: '2026-11-26T12:00:02Z', eventMessage: 'Local renderer completed' }), path))
})
test('preserves fallback messages without claiming they belong to a selected preview', () => {
  const fallback = event('Fallback: renderer timed out', '2026-11-26T12:00:08Z')
  assert.equal(summarizeFinderLogs([start, fallback].join('\n'), path).events[1].message, 'Fallback: renderer timed out')
})
