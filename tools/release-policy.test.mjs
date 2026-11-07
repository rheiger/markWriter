import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'
test('2.6 candidate has no publication authority and never changes latest', () => {
  assert.equal(releasePolicy.version, '2.6.0')
  assert.equal(releasePolicy.makeLatest, false)
  assert.equal(releasePolicy.publicationAuthorized, false)
  assert.throws(() => draftReleaseArgs('2.6.0', ['SHA256SUMS']), /separate reviewed release instruction/)
  assert.throws(() => draftReleaseArgs('2.5.1', ['SHA256SUMS']))
})
