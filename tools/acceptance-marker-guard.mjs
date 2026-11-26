import assert from 'node:assert/strict'

export const ACCEPTANCE_MARKERS = ['__MARKWRITER_ACCEPTANCE__', '__MW_PLANTUML_SECURITY_PROBE__', 'MWTimeoutProbe']
export function verifyNoAcceptanceMarkers(source, path = 'production asset') {
  for (const marker of ACCEPTANCE_MARKERS) assert.ok(!source.includes(marker), `${path} contains acceptance-only marker ${marker}`)
}
