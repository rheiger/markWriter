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
  const snapshot = () => run(`const a=document.querySelector('[data-active=true]');return {id:a.getAttribute('data-document-id'),text:a.querySelector('.cm-content').textContent,unsaved:!!document.querySelector('[role=tab][aria-selected=true] [aria-label=Unsaved]')}`)
  const before = await snapshot()
  assert.equal(before.unsaved, false)
  const edit = ' Unsaved update-check edit.'
  await run(`const editor=document.querySelector('[data-active=true] .cm-content');editor.focus();document.execCommand('insertText',false,arguments[0])`, edit)
  const dirty = await wait(async () => {
    const state = await snapshot()
    return state.unsaved && state.text.includes(edit) ? state : false
  }, 'live unsaved update fixture')
  assert.equal(dirty.id, before.id)
  assert.equal(await readFile(saved, 'utf8'), source)
  await menu('Help', 'Check for Updates…')
  const status = await wait(() => run(`const d=document.querySelector('dialog[open][aria-label="Check for Updates"]');const s=d?.querySelector('[role=status]')?.textContent?.trim();return s && !s.includes('Checking for updates') ? s : false`), 'installed update check completes', 30000)
  if (platform === 'linux') {
    assert.match(status, /^Could not reach the release service\./, 'Linux runs with network namespace isolated from external routes')
  } else if (platform === 'win32') {
    assert.match(status, /^(?:Version .+ is up to date\.|Version .+ is available \(installed: .+\)\.|Could not reach the release service\.|Could not check for updates\.)/, 'Windows accepts a completed discovery outcome; Rust networking is not blocked by the WebView firewall')
  } else {
    throw new Error(`Installed update acceptance has no qualified expectation for ${platform}`)
  }
  const action = await run(`return [...document.querySelectorAll('dialog[open][aria-label="Check for Updates"] button')].find(button => button.textContent.trim().startsWith('Open '))?.textContent.trim() ?? null`)
  if (/^Version .+ is available /.test(status)) {
    assert.ok(['Open installer download', 'Open release page'].includes(action), 'A discovery result offers one browser action')
  } else {
    assert.equal(action, null, 'Unavailable or current checks offer no download action')
  }
  const shot = await request('GET', `/session/${session}/screenshot`)
  await writeFile(join(artifacts, 'update-check.png'), Buffer.from(shot, 'base64'))
  await click('//dialog[@aria-label="Check for Updates"]//button[normalize-space(.)="Close"]')
  await wait(() => run('return !document.querySelector(\'dialog[open][aria-label="Check for Updates"]\')'), 'update dialog closes')
  assert.deepEqual(await snapshot(), dirty, 'Update check leaves the unsaved document and dirty state unchanged')
  assert.equal(await readFile(saved, 'utf8'), source)
  await menu('Edit', 'Undo')
  await wait(async () => {
    const state = await snapshot()
    return state.id === before.id && state.text === before.text && !state.unsaved
  }, 'one Undo still restores the clean editor after update discovery')
  await save()
  await wait(async () => await readFile(saved, 'utf8').catch(() => null) === source, 'update check preserves exact saved file bytes')
  const afterCheckCopy = join(dir, 'update-check-after.md')
  await saveAs(afterCheckCopy)
  await wait(async () => await readFile(afterCheckCopy, 'utf8').catch(() => null) === source, 'fresh Save As after update check preserves exact document bytes')
  const sha256 = createHash('sha256').update(await readFile(afterCheckCopy)).digest('hex')
  const evidence = { platform, status, action, fixtureBytesUnchanged: true, activeDocumentUnchanged: true, undoPreserved: true, sha256, cases: ['installed Help update discovery preserves the unsaved editor, Undo and saved bytes'] }
  await writeFile(join(artifacts, 'update-check-evidence.json'), JSON.stringify(evidence, null, 2))
  return evidence
}
