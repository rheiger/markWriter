import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { releasePolicy } from './release-policy.mjs'

const suffixes = new Map([
  ['explorer', 'windows-x64.exe'],
  ['sushi', 'ubuntu-26.04-x64-sushi-preview.zip'],
  ['dolphin', 'ubuntu-26.04-x64-dolphin-preview.deb'],
])

function assetName(version, component) {
  assert.match(version, /^\d+\.\d+\.\d+$/, 'Release version required')
  assert.ok(suffixes.has(component), 'Known preview component required')
  return `MarkWriter-${version}-${suffixes.get(component)}`
}

function checkAcceptance(acceptance) {
  assert.equal(acceptance?.passed, true, 'Installed shell acceptance required')
  assert.ok(typeof acceptance.baseline === 'string' && acceptance.baseline.trim(), 'Named shell acceptance baseline required')
  assert.ok(Array.isArray(acceptance.cases) && acceptance.cases.length && acceptance.cases.every(item =>
    typeof item === 'string' && item.trim()), 'Shell acceptance cases required')
}

function checkTestedBytes(acceptance, asset) {
  assert.equal(acceptance.assetSha256, asset.sha256, 'Tested shell preview asset differs from staged bytes')
  assert.match(acceptance.installedSha256, /^[0-9a-f]{64}$/, 'Installed component SHA-256 required')
}

async function inspectAsset(directory, name) {
  const data = await readFile(join(directory, name))
  assert.ok(data.length, 'Shell preview asset must not be empty')
  return { name, size: data.length, sha256: createHash('sha256').update(data).digest('hex') }
}

export async function recordShellPreviewAsset(directory, { version, source, component, acceptance }) {
  assert.match(source, /^[0-9a-f]{40}$/, 'Full source SHA required')
  checkAcceptance(acceptance)
  const asset = await inspectAsset(directory, assetName(version, component))
  checkTestedBytes(acceptance, asset)
  const record = { schemaVersion: 1, version, source, component, asset, acceptance }
  await writeFile(join(directory, `${component}.preview.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
}

export async function verifyShellPreviewAssets(directory, { version, source }) {
  assert.match(source, /^[0-9a-f]{40}$/, 'Full source SHA required')
  const records = []
  for (const component of suffixes.keys()) {
    const record = JSON.parse(await readFile(join(directory, `${component}.preview.json`), 'utf8'))
    assert.equal(record.schemaVersion, 1)
    assert.equal(record.version, version, 'Shell preview version mismatch')
    assert.equal(record.source, source, 'Shell preview source mismatch')
    assert.equal(record.component, component)
    checkAcceptance(record.acceptance)
    const asset = await inspectAsset(directory, assetName(version, component))
    assert.deepEqual(record.asset, asset, 'Shell preview checksum or size mismatch')
    checkTestedBytes(record.acceptance, asset)
    records.push(record)
  }
  return records
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [component, directory, result] = process.argv.slice(2)
  assert.ok(component && directory && result, 'Expected component, asset directory and acceptance JSON')
  await recordShellPreviewAsset(directory, {
    component, version: releasePolicy.version, source: process.env.GITHUB_SHA,
    acceptance: JSON.parse(await readFile(result, 'utf8')),
  })
}
