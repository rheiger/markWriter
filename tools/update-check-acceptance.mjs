// Runs against the installed application through the ordinary menu and native file dialogs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyUpdateCheck({ dir, artifacts, run, click, menu, mode, open, saveAs, save, wait, request, session, platform = process.platform }) {
  const source = '# Update check acceptance\n\nGrüße 中文 — existing document.\n'
  const original = join(dir, 'update-check-original.md')
  const saved = join(dir, 'update-check-saved.md')
  await writeFile(original, source)
  await open(original, 'update-check-original.md')
  await mode(true)
  await saveAs(saved)
  await wait(async () => await readFile(saved, 'utf8').catch(() => null) === source, 'update fixture exact Save As')
  await wait(() => run(`const t=document.querySelector('[role=tab][aria-selected=true]');return t?.textContent.includes('update-check-saved.md')&&!t.querySelector('[aria-label=Unsaved]')&&!document.querySelector('.status-item.loading')`), 'update fixture save completed')
  const before = await run(`const a=document.querySelector('[data-active=true]');return {id:a.getAttribute('data-document-id'),text:a.querySelector('.cm-content').textContent,unsaved:!!document.querySelector('[role=tab][aria-selected=true] [aria-label=Unsaved]')}`)
  assert.equal(before.unsaved, false)
  await menu('Help', 'Check for Updates…')
  const status = await wait(() => run(`const d=document.querySelector('dialog[open][aria-label="Check for Updates"]');const s=d?.querySelector('[role=status]')?.textContent?.trim();return s && !s.includes('Checking for updates') ? s : false`), 'installed update check completes', 30000)
  if (platform === 'linux') {
    assert.match(status, /^Could not reach the release service\./, 'Linux runs with network namespace isolated from external routes')
  } else if (platform === 'win32') {
    assert.match(status, /^(?:Version .+ is up to date\.|Version .+ is available \(installed: .+\)\. Installation is not yet available\.|Could not reach the release service\.|Could not check for updates\.)/, 'Windows accepts a completed discovery outcome; Rust networking is not blocked by the WebView firewall')
  } else {
    throw new Error(`Installed update acceptance has no qualified expectation for ${platform}`)
  }
  const shot = await request('GET', `/session/${session}/screenshot`)
  await writeFile(join(artifacts, 'update-check.png'), Buffer.from(shot, 'base64'))
  await click('//dialog[@aria-label="Check for Updates"]//button[normalize-space(.)="Close"]')
  await wait(() => run('return !document.querySelector(\'dialog[open][aria-label="Check for Updates"]\')'), 'update dialog closes')
  const after = await run(`const a=document.querySelector('[data-active=true]');return {id:a.getAttribute('data-document-id'),text:a.querySelector('.cm-content').textContent,unsaved:!!document.querySelector('[role=tab][aria-selected=true] [aria-label=Unsaved]')}`)
  assert.deepEqual(after, before, 'Update check leaves active document and dirty state unchanged')
  await save()
  await wait(async () => await readFile(saved, 'utf8').catch(() => null) === source, 'update check preserves exact saved file bytes')
  const afterCheckCopy = join(dir, 'update-check-after.md')
  await saveAs(afterCheckCopy)
  await wait(async () => await readFile(afterCheckCopy, 'utf8').catch(() => null) === source, 'fresh Save As after update check preserves exact document bytes')
  const sha256 = createHash('sha256').update(await readFile(afterCheckCopy)).digest('hex')
  const evidence = { platform, status, fixtureBytesUnchanged: true, activeDocumentUnchanged: true, sha256, cases: ['installed Help update discovery completes and preserves active document and saved bytes'] }
  await writeFile(join(artifacts, 'update-check-evidence.json'), JSON.stringify(evidence, null, 2))
  return evidence
}
