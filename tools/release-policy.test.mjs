import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('only the approved 2.7.2 version can be staged as the regular Latest release', () => {
  assert.equal(releasePolicy.version, '2.7.2')
  assert.deepEqual(draftReleaseArgs('2.7.2', ['SHA256SUMS']), [
    'release', 'create', 'v2.7.2', 'release-assets/SHA256SUMS',
    '--verify-tag', '--draft', '--prerelease=false', '--latest=true',
    '--title', 'MarkWriter v2.7.2', '--notes-file', 'docs/releases/2.7.2.md',
  ])
  assert.throws(() => draftReleaseArgs('2.7.1', ['SHA256SUMS']), /reviewed release version/)
  assert.throws(() => draftReleaseArgs('2.7.2', ['../SHA256SUMS']), /Flat release asset names/)
})
