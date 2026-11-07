import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'
test('the 2.7 candidate cannot stage a release', () => {
  assert.equal(releasePolicy.version, '2.7.0')
  assert.equal(releasePolicy.makeLatest, false)
  for (const version of ['2.7.0', '2.6.3']) {
    assert.throws(() => draftReleaseArgs(version, ['SHA256SUMS']), /requires a separate reviewed release instruction/)
  }
})
