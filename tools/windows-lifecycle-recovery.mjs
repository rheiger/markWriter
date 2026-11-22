import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { stopOwnedApplication } from './owned-process.mjs'

const [phase, version] = process.argv.slice(2)
const documentPath = process.env.MARKWRITER_LIFECYCLE_DOCUMENT
const resultPath = process.env.MARKWRITER_LIFECYCLE_RECOVERY_RESULT
const binary = process.env.MARKWRITER_BINARY
const profile = process.env.MARKWRITER_PROFILE_DIR
const nativeDriver = process.env.MARKWRITER_NATIVE_DRIVER
assert.ok(process.platform === 'win32' && process.env.GITHUB_ACTIONS, 'Disposable hosted Windows required')
assert.ok(['seed', 'recover'].includes(phase) && binary && profile && nativeDriver && version && documentPath && resultPath)
const saved = '# MarkWriter lifecycle saved — Grüße'
const draft = '# MarkWriter lifecycle recovery — café'
const driver = spawn(join(homedir(), '.cargo', 'bin', 'tauri-driver.exe'), [
  '--port', '4444', '--native-port', '4445', '--native-driver', nativeDriver,
], { stdio: ['ignore', 'pipe', 'pipe'] })
let driverLog = '', driverError, session
for (const stream of [driver.stdout, driver.stderr]) stream.on('data', chunk => { driverLog = (driverLog + chunk).slice(-20_000) })
driver.on('error', error => { driverError = error })

async function request(method, url, body) {
  const response = await fetch('http://127.0.0.1:4444' + url, {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  })
  const result = await response.json()
  if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result))
  return result.value
}
async function wait(check, label) {
  const deadline = Date.now() + 30_000
  let lastError
  while (Date.now() < deadline) {
    if (driverError) throw driverError
    try { if (await check()) return } catch (error) { lastError = error }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`, { cause: lastError })
}
const run = (script, ...args) => request('POST', `/session/${session}/execute/sync`, { script, args })
async function click(xpath) {
  const element = await request('POST', `/session/${session}/element`, { using: 'xpath', value: xpath })
  await request('POST', `/session/${session}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {})
}
async function menu(group, item) {
  await click(`//button[normalize-space(.)="${group}"]`)
  await click(`//button[normalize-space(.)="${item}" or .//span[normalize-space(.)="${item}"]]`)
}
async function sourceMode() {
  if (await run(`return document.querySelector('button[role=switch]').getAttribute('aria-checked')`) !== 'true') {
    await click('//button[@role="switch"]')
  }
  await wait(() => run(`return !!document.querySelector('[data-active=true] .cm-content')`), 'active source editor')
}
const source = () => run(`return document.querySelector('[data-active=true] .cm-content')?.textContent`)
async function newSource(text) {
  const previous = await run(`return document.querySelector('[data-active=true]')?.dataset.documentId`)
  await menu('File', 'New')
  await wait(() => run(`const id = document.querySelector('[data-active=true]')?.dataset.documentId;
    return id && id !== arguments[0]`, previous), 'new document')
  await sourceMode()
  await run(`document.querySelector('[data-active=true] .cm-content').focus();
    document.execCommand('insertText', false, arguments[0])`, text)
  await wait(async () => await source() === text, 'exact source text')
}
try {
  await wait(async () => !!(await request('GET', '/status')), 'driver')
  session = (await request('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: binary } } },
  })).sessionId
  await wait(() => run(`return !!document.querySelector('button[role=switch]')`), 'installed app')
  assert.equal(await run('return typeof window.__MARKWRITER_ACCEPTANCE__'), 'undefined')
  await menu('Help', 'About MarkWriter')
  await wait(() => run(`return document.querySelector('dialog[open] .about-version')?.textContent === 'Version ' + arguments[0]`, version), 'exact installed version')
  await click('//dialog//button[normalize-space(.)="Close"]')

  if (phase === 'seed') {
    await newSource(saved)
    await menu('File', 'Save As...')
    await promisify(execFile)('pwsh', ['-NoProfile', '-File', join(import.meta.dirname, 'package-dialog-windows.ps1'), '-Path', documentPath])
    // A native rename can complete before the editor adopts the saved path.
    await wait(async () => [saved, `${saved}\n`].includes(await readFile(documentPath, 'utf8')), 'native saved document')
    await wait(() => run(`const tab = document.querySelector('[role=tab][aria-selected=true]');
      return tab?.textContent.includes('Lifecycle saved.md') && !tab.querySelector('[aria-label=Unsaved]')`), 'saved tab ownership')
    await newSource(draft)
  }
  await sourceMode()
  await wait(() => run(`return !!document.querySelector('[role=tab][aria-selected=true] [aria-label=Unsaved]')`), 'active unsaved draft')
  assert.equal(await source(), draft)
  await wait(async () => {
    const state = JSON.parse(await readFile(join(profile, 'workspace.json'), 'utf8'))
    return state.documents.some(doc => doc.id === state.activeId && doc.isDirty && doc.content === draft)
  }, 'exact active draft in isolated workspace')
  // Leave the disk snapshot available for the next installation. Scope the
  // interruption to the installed executable descended from this driver.
  await stopOwnedApplication(driver.pid, binary)
  await writeFile(resultPath, JSON.stringify({ phase, version, draft, passed: true }, null, 2))
} finally {
  if (session) await request('DELETE', `/session/${session}`).catch(() => {})
  driver.kill()
  driver.stdout.destroy()
  driver.stderr.destroy()
  await writeFile(`${resultPath}.driver.log`, driverLog)
}
