import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { recordShellPreviewAsset, verifyShellPreviewAssets } from './shell-preview-assets.mjs'

const source = 'a'.repeat(40)
const version = '2.6.3'
const sha = data => createHash('sha256').update(data).digest('hex')
const targets = [
  ['explorer', 'windows-x64-explorer-preview.zip', 'Windows Server 2025 x64'],
  ['sushi', 'ubuntu-26.04-x64-sushi-preview.zip', 'Ubuntu 26.04 x64 / GNOME Sushi'],
  ['dolphin', 'ubuntu-26.04-x64-dolphin-preview.deb', 'Ubuntu 26.04 x64 / KDE Dolphin'],
]

async function staged(t) {
  const directory = await mkdtemp(join(tmpdir(), 'markwriter-preview-assets-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const [component, suffix, baseline] of targets) {
    await writeFile(join(directory, `MarkWriter-${version}-${suffix}`), `test ${component}`)
    await recordShellPreviewAsset(directory, { version, source, component, acceptance: {
      passed: true, baseline, cases: ['installed shell preview', 'scoped cleanup'],
      assetSha256: sha(`test ${component}`), installedSha256: sha('installed fixture'),
    } })
  }
  return directory
}

test('shell preview release requires three tested artifacts from the release source', async t => {
  const directory = await staged(t)
  const results = await verifyShellPreviewAssets(directory, { version, source })
  assert.deepEqual(results.map(item => item.component), targets.map(([id]) => id))
  await assert.rejects(verifyShellPreviewAssets(directory, { version, source: 'b'.repeat(40) }), /source/)
  await rm(join(directory, 'sushi.preview.json'))
  await assert.rejects(verifyShellPreviewAssets(directory, { version, source }), /sushi\.preview\.json/)
})

test('shell preview release detects changed package bytes and rejects failed acceptance', async t => {
  const directory = await staged(t)
  await writeFile(join(directory, `MarkWriter-${version}-${targets[0][1]}`), 'test CHANGED!')
  await assert.rejects(verifyShellPreviewAssets(directory, { version, source }), /checksum/)
  await assert.rejects(recordShellPreviewAsset(directory, { version, source, component: 'explorer',
    acceptance: { passed: false, baseline: 'test', cases: ['shell launch'] },
  }), /acceptance/)
})

test('the receipt must identify the exact archive present during installed acceptance', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'markwriter-preview-assets-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, `MarkWriter-${version}-${targets[0][1]}`), 'explorer package')
  await assert.rejects(recordShellPreviewAsset(directory, { version, source, component: 'explorer',
    acceptance: { passed: true, baseline: 'test', cases: ['shell launch'],
      assetSha256: sha('different package'), installedSha256: sha('installed fixture') },
  }), /tested shell preview asset/i)
})
