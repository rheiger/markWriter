import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('only the authorized 2.7.1 regular release can be staged', () => {
  assert.equal(releasePolicy.version, '2.7.1')
  assert.equal(releasePolicy.makeLatest, true)
  assert.deepEqual(draftReleaseArgs('2.7.1', ['SHA256SUMS']), [
    'release', 'create', 'v2.7.1', 'release-assets/SHA256SUMS',
    '--verify-tag', '--draft', '--prerelease=false', '--latest=true',
    '--title', 'MarkWriter v2.7.1', '--notes-file', 'docs/releases/2.7.1.md',
  ])
  assert.throws(() => draftReleaseArgs('2.6.3', ['SHA256SUMS']), /Only the reviewed release version/)
})
