import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('the offline Windows qualification build cannot be published', () => {
  assert.equal(releasePolicy.version, '2.9.2')
  assert.throws(() => draftReleaseArgs('2.9.2', ['SHA256SUMS']), /separate reviewed release instruction/)
})
