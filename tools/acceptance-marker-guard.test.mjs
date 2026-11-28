import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCEPTANCE_MARKERS, verifyNoAcceptanceMarkers } from './acceptance-marker-guard.mjs'

test('rejects every acceptance-only marker in production output', () => {
  verifyNoAcceptanceMarkers('production worker')
  for (const marker of ACCEPTANCE_MARKERS) assert.throws(() => verifyNoAcceptanceMarkers(`prefix ${marker} suffix`), /acceptance-only/)
  assert.throws(() => verifyNoAcceptanceMarkers(Buffer.from('MWTimeoutProbe')), /acceptance-only/)
})
