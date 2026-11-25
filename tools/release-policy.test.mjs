import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('the 2.14.3 candidate cannot stage a release without publication authorization', () => {
  assert.equal(releasePolicy.version, '2.14.3')
  assert.throws(() => draftReleaseArgs('2.14.3', ['SHA256SUMS']), /requires a separate reviewed release instruction/)
})
