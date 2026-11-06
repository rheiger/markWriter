import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'

test('2.5.1 is explicitly regular, draft-staged and never latest', () => {
  assert.deepEqual(releasePolicy, { version: '2.5.1', prerelease: false, makeLatest: false, installationGuide: 'docs/install-2.5.1.md' })
  const args = draftReleaseArgs('2.5.1', ['SHA256SUMS', 'MarkWriter-2.5.1-macos-arm64.dmg'])
  for (const flag of ['--draft', '--verify-tag', '--prerelease=false', '--latest=false']) assert.ok(args.includes(flag))
  assert.equal(args[2], 'v2.5.1')
  assert.equal(args.at(-1), 'docs/releases/2.5.1.md')
})
test('draft staging rejects an unreviewed version or non-flat asset names', () => {
  assert.throws(() => draftReleaseArgs('2.5.0-alpha1', ['SHA256SUMS']))
  for (const name of ['../private.json', '/tmp/secret']) {
    assert.throws(() => draftReleaseArgs('2.5.1', [name]))
  }
  assert.throws(() => draftReleaseArgs('2.5.1', []))
})
