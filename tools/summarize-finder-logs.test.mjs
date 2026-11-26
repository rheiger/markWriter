import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeFinderLogs } from './summarize-finder-logs.mjs'
const path = '/test/MarkWriter.app/QuickLookPrototype'
const id = '01234567-89AB-CDEF-0123-456789ABCDEF'
const other = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
const event = (message, time, pid = 7, executable = path) => JSON.stringify({ processImagePath: executable, processID: pid, timestamp: time, eventMessage: message })
const start = event(`request=${id} start`, '2026-11-26T12:00:00Z')
const complete = event(`request=${id} completed elapsed_ms=2000`, '2026-11-26T12:00:02Z')
test('pairs exactly one request from the tested executable', () => {
  const result = summarizeFinderLogs([start, complete].join('\n'), path)
  assert.equal(result.elapsedMs, 2000)
  assert.equal(result.requestId, id)
  assert.equal(result.outcome, 'completed')
})
test('rejects interleaved requests even in the same process', () => {
  assert.throws(() => summarizeFinderLogs([start, event(`request=${other} start`, '2026-11-26T12:00:01Z'), complete].join('\n'), path))
})
test('rejects another provider, missing identity and mismatched PID', () => {
  assert.throws(() => summarizeFinderLogs(event(`request=${id} start`, '2026-11-26T12:00:00Z', 7, '/other'), path))
  assert.throws(() => summarizeFinderLogs(JSON.stringify({ processImagePath: path, timestamp: '2026-11-26T12:00:02Z', eventMessage: `request=${id} start` }), path))
  assert.throws(() => summarizeFinderLogs([start, event(`request=${id} completed elapsed_ms=2`, '2026-11-26T12:00:02Z', 8)].join('\n'), path))
})
test('distinguishes fallback from completed output', () => {
  const fallback = event(`request=${id} fallback elapsed_ms=8000`, '2026-11-26T12:00:08Z')
  assert.equal(summarizeFinderLogs([start, fallback].join('\n'), path).outcome, 'fallback')
})
