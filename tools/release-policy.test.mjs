import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releasePolicy, draftReleaseArgs } from './release-policy.mjs'
test('2.6.3 stages a reviewed prerelease without changing latest', () => {
  assert.equal(releasePolicy.version, '2.6.3')
  assert.equal(releasePolicy.makeLatest, false)
  const args = draftReleaseArgs('2.6.3', ['SHA256SUMS'])
  for (const arg of ['v2.6.3', '--draft', '--verify-tag', '--prerelease=true', '--latest=false']) assert.ok(args.includes(arg))
  assert.throws(() => draftReleaseArgs('2.5.1', ['SHA256SUMS']))
  assert.throws(() => draftReleaseArgs('2.6.3', ['../other']))
})
