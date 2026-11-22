import assert from 'node:assert/strict'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyExternalFiles({ dir, run, click, wait, mode, action, snapshot }) {
  const filename = 'External Grüße.md'
  const path = join(dir, filename)
  const replacement = join(dir, 'replacement.tmp')
  const copy = join(dir, 'External copy.md')
  const initial = '# External Grüße\n\nDisk version A.\n'
  const changed = initial.replace('version A', 'version B')
  const newest = initial.replace('version A', 'version C')
  const detectedAt = {}
  const atomicReplace = async content => { await writeFile(replacement, content); await rename(replacement, path) }
  const notice = () => run("return document.querySelector('.external-change [role=status]')?.textContent")
  const waitNotice = message => wait(async () => (await notice())?.includes(message), message)
  const reload = () => click('//button[normalize-space(.)="Reload from Disk"]')
  const activeOwner = () => run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document')
  const waitContent = content => wait(async () => (await activeOwner()).content === content, 'updated external fixture buffer')
  const waitClosed = () => wait(() => run('return !document.querySelector("dialog[open]")'), 'reload dialog closed')

  await writeFile(path, initial)
  const first = (await action('open', path)).document
  await mode('WYSIWYG')
  await action('create')
  const background = (await snapshot()).document.id
  const changedAt = performance.now()
  await atomicReplace(changed)
  await wait(() => run(`return [...document.querySelectorAll('[role=tab]')].some(tab =>
    tab.textContent.includes(arguments[0]) && tab.querySelector('[aria-label="External file change"]'))`, filename), 'external change badge on inactive tab')
  detectedAt.backgroundReplacementMs = Math.round(performance.now() - changedAt)
  assert.equal((await snapshot()).document.id, background)
  assert.equal((await snapshot()).documents.find(doc => doc.id === first.id).content, initial)
  await click(`//button[@role="tab" and contains(., "${filename}")]`)
  await waitNotice('The file changed on disk.')
  await reload()
  await waitContent(changed)
  await waitClosed()
  await wait(() => run("return document.querySelector('[data-active=true] .tiptap')?.textContent.includes('Disk version B.')"), 'WYSIWYG reload')
  assert.deepEqual(await readFile(path), Buffer.from(changed))

  await writeFile(path, Buffer.from([0xff]))
  await waitNotice('The file could not be read.')
  assert.equal(await run("return document.querySelector('.external-change button').disabled"), true)
  await unlink(path)
  await waitNotice('The file is missing or was renamed.')
  await writeFile(path, changed)
  await wait(async () => !(await notice()), 'recreated file clears warning after exact match')
  await mode('Markdown')
  const editSource = async value => {
    await run(`const editor=document.querySelector('[data-active=true] .cm-content');editor.focus();
      document.execCommand('selectAll');document.execCommand('insertText',false,arguments[0]);`, value)
    await waitContent(value)
  }
  const local = '# Local document draft\n\nDo not discard.\n'
  await editSource(local)
  const externalWriteAt = performance.now()
  await writeFile(path, newest)
  await click('//button[@aria-label="Save" and @title="Save"]')
  await wait(() => run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().error?.startsWith("Save stopped.")'), 'immediate Save refuses outside edit')
  detectedAt.externalWriteToSaveRejectionMs = Math.round(performance.now() - externalWriteAt)
  const blocked = await activeOwner()
  assert.equal(blocked.isDirty, true)
  assert.equal(blocked.content, local)
  assert.deepEqual(await readFile(path), Buffer.from(newest))

  await reload()
  await wait(() => run("return document.querySelector('dialog[open]')?.getAttribute('aria-label') === 'Discard unsaved edits?'"), 'dirty reload confirms discard')
  await click('//dialog//button[normalize-space(.)="Cancel"]')
  await waitClosed()
  assert.equal((await activeOwner()).content, local)
  assert.deepEqual(await readFile(path), Buffer.from(newest))
  await action('saveCopy', copy)
  assert.equal((await snapshot()).document.path, first.path)
  assert.equal((await snapshot()).document.isDirty, true)
  assert.deepEqual(await readFile(copy), Buffer.from(local))

  const latest = newest.replace('version C', 'version D')
  await reload()
  await atomicReplace(latest)
  await click('//dialog//button[normalize-space(.)="Discard and Reload"]')
  await waitContent(latest)
  await waitClosed()
  await wait(() => run("return document.querySelector('[data-active=true] .cm-content')?.textContent.includes('Disk version D.')"), 'Markdown reload uses fresh disk bytes')
  const reloaded = (await snapshot()).document
  assert.equal(reloaded.id, first.id)
  assert.equal(reloaded.path, first.path)
  assert.equal(reloaded.isDirty, false)
  assert.deepEqual(await readFile(path), Buffer.from(latest))

  const recovery = '# Recover my external draft\n'
  const external = latest.replace('version D', 'version E')
  await editSource(recovery)
  await atomicReplace(external)
  await waitNotice('The file changed on disk.')
  return {
    cases: ['background tab change and clean WYSIWYG reload', 'invalid UTF-8 and missing/recreated file warnings',
      'native Save conflict, Markdown discard cancellation, and non-clobbering copy', 'explicit Markdown reload reads latest file'],
    detection: detectedAt,
    restart: { id: first.id, path, recovery, external },
  }
}
