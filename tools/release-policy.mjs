import assert from 'node:assert/strict'

// Explicit reviewed release target. A regular release does not imply trusted OS signing.
export const releasePolicy = Object.freeze({ version: '2.7.2', publicationAuthorized: false, prerelease: false, makeLatest: true, installationGuide: 'docs/install-2.7.2.md' })

export function draftReleaseArgs(version, names) {
  assert.equal(releasePolicy.publicationAuthorized, true, 'Candidate publication requires a separate reviewed release instruction')
  assert.equal(version, releasePolicy.version, 'Only the reviewed release version can be staged')
  assert.ok(names.length && names.every(name => /^[\w.-]+$/.test(name)), 'Flat release asset names required')
  return ['release', 'create', 'v' + version, ...names.map(name => 'release-assets/' + name),
    '--verify-tag', '--draft', '--prerelease=' + releasePolicy.prerelease,
    '--latest=' + releasePolicy.makeLatest, '--title', 'MarkWriter v' + version,
    '--notes-file', 'docs/releases/' + version + '.md']
}
