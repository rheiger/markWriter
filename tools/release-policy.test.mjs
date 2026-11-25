import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('the 2.18.5 candidate cannot stage a release without publication authorization', () => {
  assert.equal(releasePolicy.version, '2.18.5')
  assert.throws(() => draftReleaseArgs('2.18.5', ['SHA256SUMS']), /requires a separate reviewed release instruction/)
})
