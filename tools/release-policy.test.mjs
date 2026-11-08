import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('the 2.7.2 candidate cannot stage a release before approval', () => {
  assert.equal(releasePolicy.version, '2.7.2')
  assert.equal(releasePolicy.makeLatest, true)
  assert.throws(() => draftReleaseArgs('2.7.2', ['SHA256SUMS']), /separate reviewed release instruction/)
})
