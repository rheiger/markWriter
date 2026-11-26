import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyDirectLogs } from './verify-quicklook-direct-logs.mjs'
const path = '/tmp/quicklook-probe'
const ids = Array.from({ length: 5 }, (_, index) => `${index}1234567-89AB-CDEF-0123-456789ABCDEF`)
const event = message => JSON.stringify({ processImagePath: path, processID: 42, eventMessage: message })
const make = (reasonIndex = 3) => ids.flatMap((id, index) => [
  event(`request=${id} start`),
  ...(index === reasonIndex ? [event('Fallback: renderer timed out')] : []),
  event(`request=${id} ${index === 2 || index === 3 ? 'fallback' : 'completed'} elapsed_ms=8000`),
])
test('confirms the timeout reason belongs to the CPU-bound request', () => {
  assert.equal(verifyDirectLogs(make().join('\n'), path).requests[3].reasons[0], 'Fallback: renderer timed out')
  assert.throws(() => verifyDirectLogs(make(2).join('\n'), path))
})
test('rejects overlapping request IDs and wrong executable', () => {
  const lines = make()
  lines.splice(1, 0, event(`request=${ids[1]} start`))
  assert.throws(() => verifyDirectLogs(lines.join('\n'), path))
  assert.throws(() => verifyDirectLogs(make().join('\n'), '/wrong'))
})
