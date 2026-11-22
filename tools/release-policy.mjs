import assert from 'node:assert/strict'

// Candidate packages can be built before the release is authorized.
export const releasePolicy = Object.freeze({ version: '2.8.2', publicationAuthorized: false, prerelease: true, makeLatest: false, installationGuide: 'docs/install-2.8.2.md' })

export function draftReleaseArgs(version, names) {
  assert.equal(releasePolicy.publicationAuthorized, true, 'Candidate publication requires a separate reviewed release instruction')
  assert.equal(version, releasePolicy.version, 'Only the reviewed release version can be staged')
  assert.ok(names.length && names.every(name => /^[\w.-]+$/.test(name)), 'Flat release asset names required')
  return ['release', 'create', 'v' + version, ...names.map(name => 'release-assets/' + name),
    '--verify-tag', '--draft', '--prerelease=' + releasePolicy.prerelease,
    '--latest=' + releasePolicy.makeLatest, '--title', 'MarkWriter v' + version,
    '--notes-file', 'docs/releases/' + version + '.md']
}
