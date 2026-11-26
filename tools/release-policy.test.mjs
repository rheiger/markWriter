import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('the authorized 2.21.1 release stages only its exact reviewed version and flat assets', () => {
  assert.equal(releasePolicy.version, '2.21.1')
  assert.equal(releasePolicy.publicationAuthorized, true)
  assert.deepEqual(draftReleaseArgs('2.21.1', ['SHA256SUMS']).slice(0, 4), ['release', 'create', 'v2.21.1', 'release-assets/SHA256SUMS'])
  assert.throws(() => draftReleaseArgs('2.21.0', ['SHA256SUMS']), /reviewed release version/)
  assert.throws(() => draftReleaseArgs('2.21.1', ['../SHA256SUMS']), /Flat release asset names/)
})
