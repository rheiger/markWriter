import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('only the authorized 2.7.0 regular release can be staged', () => {
  assert.equal(releasePolicy.version, '2.7.0')
  assert.equal(releasePolicy.makeLatest, false)
  assert.deepEqual(draftReleaseArgs('2.7.0', ['SHA256SUMS']), [
    'release', 'create', 'v2.7.0', 'release-assets/SHA256SUMS',
    '--verify-tag', '--draft', '--prerelease=false', '--latest=false',
    '--title', 'MarkWriter v2.7.0', '--notes-file', 'docs/releases/2.7.0.md',
  ])
  assert.throws(() => draftReleaseArgs('2.6.3', ['SHA256SUMS']), /Only the reviewed release version/)
})
