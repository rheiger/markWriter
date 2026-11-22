import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('2.8.2 is a packaging candidate with publication disabled', () => {
  assert.equal(releasePolicy.version, '2.8.2')
  assert.equal(releasePolicy.publicationAuthorized, false)
  assert.equal(releasePolicy.makeLatest, false)
  assert.throws(() => draftReleaseArgs('2.8.2', ['SHA256SUMS']), /separate reviewed release instruction/)
})
