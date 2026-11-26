import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeFinderLogs } from './summarize-finder-logs.mjs'
const path = '/test/MarkWriter.app/QuickLookPrototype'
const event = (message, time, pid = 7, executable = path) => JSON.stringify({ processImagePath: executable, processID: pid, timestamp: time, eventMessage: message })
const start = event('Starting local renderer', '2026-11-26T12:00:00Z')
const complete = event('Local renderer completed', '2026-11-26T12:00:02Z')
test('attributes a completed render to the exact extension and computes elapsed time', () => {
  assert.equal(summarizeFinderLogs([start, complete].join('\n'), path).rendererElapsedMs, 2000)
})
test('rejects a different provider or a mismatched process', () => {
  assert.throws(() => summarizeFinderLogs([start, event('Local renderer completed', '2026-11-26T12:00:02Z', 7, '/other')].join('\n'), path))
  assert.throws(() => summarizeFinderLogs([start, event('Local renderer completed', '2026-11-26T12:00:02Z', 8)].join('\n'), path))
})
test('reports a renderer fallback instead of treating it as completion', () => {
  const fallback = event('Fallback: renderer timed out', '2026-11-26T12:00:08Z')
  assert.equal(summarizeFinderLogs([start, fallback].join('\n'), path).outcome, 'Fallback: renderer timed out')
})
