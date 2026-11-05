// Real desktop WebView + production store/IPC acceptance. Node 24; no npm packages.
// Protocol: https://www.w3.org/TR/webdriver2/#executing-script
// Driver: https://v2.tauri.app/develop/tests/webdriver/manual-setup/
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(import.meta.dirname, '..')
const artifacts = join(root, 'native-acceptance-results')
const marker = '__MARKWRITER_ACCEPTANCE__'
for (const directory of ['dist', 'dist-acceptance']) {
  const assets = join(root, 'frontend', directory, 'assets')
  const javascript = (await Promise.all((await readdir(assets)).filter(name => name.endsWith('.js'))
    .map(name => readFile(join(assets, name), 'utf8')))).join('\n')
  assert.equal(javascript.includes(marker), directory === 'dist-acceptance', `${directory} bridge isolation`)
}
if (process.argv.includes('--check-builds-only')) {
  console.log('Acceptance bridge is present only in acceptance assets')
  process.exit(0)
}
if (!['linux', 'win32'].includes(process.platform)) {
  throw new Error('External tauri-driver supports Windows/Linux. Use native UI acceptance on macOS.')
}

await mkdir(artifacts, { recursive: true })
const fixtureDir = await mkdtemp(join(tmpdir(), 'markwriter-native-'))
const sourcePath = join(fixtureDir, 'source.md')
const savedPath = join(fixtureDir, 'saved.md')
const htmlPath = join(fixtureDir, 'export.html')
const source = '# Native acceptance\n\nA paragraph.\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n```\n\n```mermaid\nstateDiagram-v2\n [*] --> Ready\n```\n\n| Left | Center | Right |\n| :--- | :---: | ---: |\n| **Bold** | a \\| b | 3 |\n\n- [x] Done\n- [ ] Pending\n'
await writeFile(sourcePath, source)

const extension = process.platform === 'win32' ? '.exe' : ''
const driverPath = process.env.MARKWRITER_TAURI_DRIVER ?? join(homedir(), '.cargo', 'bin', `tauri-driver${extension}`)
const binaryPath = resolve(process.env.MARKWRITER_BINARY ?? join(root, 'src-tauri', 'target', 'debug', `markwriter${extension}`))
const driverArgs = ['--port', '4444', '--native-port', '4445']
if (process.env.MARKWRITER_NATIVE_DRIVER) driverArgs.push('--native-driver', process.env.MARKWRITER_NATIVE_DRIVER)
const driver = spawn(driverPath, driverArgs, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
let driverLog = ''
let launchError
driver.on('error', error => { launchError = error })
for (const stream of [driver.stdout, driver.stderr]) stream.on('data', chunk => { driverLog = (driverLog + chunk).slice(-16000) })
let session

async function request(method, path, body) {
  let response
  try {
    response = await fetch(`http://127.0.0.1:4444${path}`, {
      method, headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
    })
  } catch (error) { throw new Error(`${method} ${path}: ${error}`, { cause: error }) }
  const result = await response.json()
  if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result))
  return result.value
}
async function waitFor(check, description, timeout = 30000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    if (launchError) throw launchError
    try { const result = await check(); if (result) return result } catch (error) { last = error }
    await delay(100)
  }
  throw new Error(`Timed out: ${description}${last ? `: ${last}` : ''}`)
}
const run = (script, ...args) => request('POST', `/session/${session}/execute/sync`, { script, args })
async function action(name, ...args) {
  const result = await request('POST', `/session/${session}/execute/async`, {
    script: 'const done = arguments[arguments.length - 1]; const [name, args] = arguments; Promise.resolve().then(() => window.__MARKWRITER_ACCEPTANCE__[name](...args)).then(() => done({ok:true}), e => done({error:String(e)}));',
    args: [name, args],
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  const state = await snapshot()
  assert.equal(state.error, null)
  return state
}
const snapshot = () => run('return window.__MARKWRITER_ACCEPTANCE__.snapshot()')
async function click(xpath) {
  const element = await request('POST', `/session/${session}/element`, { using: 'xpath', value: xpath })
  await request('POST', `/session/${session}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {})
}
async function mode(name) {
  const markdown = await run(`return document.querySelector('button[role="switch"]').getAttribute('aria-checked') === 'true'`)
  if (markdown !== (name === 'Markdown')) await click('//button[@role="switch" and @aria-label="Markdown mode"]')
  await waitFor(() => run(`const e=document.querySelector(arguments[0]); const checked=document.querySelector('button[role="switch"]').getAttribute('aria-checked')==='true'; return !!e && e.getBoundingClientRect().height>0 && checked===arguments[1]`, name === 'Markdown' ? '[data-active=true] .cm-content' : '[data-active=true] .tiptap', name === 'Markdown'), `${name} editor`)
}
async function preview() {
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=mermaid] svg").length === 3'), 'three rendered preview diagrams')
}

try {
  await waitFor(async () => (await request('GET', '/status')).ready === true, 'driver startup')
  console.log('Native driver ready; creating desktop session')
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: binaryPath } } } })
  session = created.sessionId
  console.log('Desktop session created; waiting for application')
  await request('POST', `/session/${session}/timeouts`, { script: 30000 })
  await waitFor(() => run('return !!window.__MARKWRITER_ACCEPTANCE__?.snapshot().document'), 'application startup')
  assert.equal((await action('open', sourcePath)).document.content, source)
  const expectedVersion = JSON.parse(await readFile(join(root, 'frontend', 'package.json'), 'utf8')).version
  await click('//button[normalize-space(.)="Help"]')
  await click('//button[normalize-space(.)="About MarkWriter"]')
  await waitFor(() => run(`const dialog = document.querySelector('dialog[open]'); return !!dialog && dialog.textContent.includes(arguments[0])`, `Version ${expectedVersion}`), 'About version')
  await click('//dialog//button[normalize-space(.)="Close"]')
  await waitFor(() => run(`return !document.querySelector('dialog[open]')`), 'About closed')
  console.log('Native fixture and About version checked; checking unchanged mode cycles')
  for (let cycle = 0; cycle < 5; cycle++) {
    await mode('Markdown'); await preview(); await mode('WYSIWYG')
    assert.equal((await snapshot()).document.content, source)
    assert.equal((await snapshot()).document.isDirty, false)
  }
  await action('saveAs', savedPath)
  assert.equal(await readFile(savedPath, 'utf8'), source)
  console.log('Unchanged cycles and byte-identical Save As passed; editing WYSIWYG')

  // Edit through the actual contenteditable DOM; store and conversion run normally.
  assert.equal(await run('const p=[...document.querySelectorAll("[data-active=true] .tiptap p")].find(e=>e.textContent==="A paragraph."); p.parentElement.focus(); const range=document.createRange(); range.setStart(p,0); range.collapse(true); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return document.execCommand("insertText", false, "Edited ");'), true)
  await waitFor(async () => (await snapshot()).document.content.includes('Edited A paragraph.'), 'WYSIWYG edit serialization')
  const edited = (await snapshot()).document.content
  assert.ok(edited.includes('a \\| b'))
  assert.ok(edited.includes('- [x] Done'))
  for (let cycle = 0; cycle < 3; cycle++) { await mode('Markdown'); await preview(); await mode('WYSIWYG') }
  assert.equal((await snapshot()).document.content, edited)
  await action('save')
  assert.equal(await readFile(savedPath, 'utf8'), edited)
  await action('close', (await snapshot()).document.id)
  assert.equal((await action('open', savedPath)).document.content, edited)
  await action('exportHtml', htmlPath)
  const html = await readFile(htmlPath, 'utf8')
  assert.equal((html.match(/<svg\b/g) ?? []).length, 3)
  assert.equal((html.match(/<table\b/g) ?? []).length, 1)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2)
  assert.ok(!/<script\b/i.test(html))

  await action('create')
  await mode('Markdown')
  await click('//button[@title="Insert Table"]')
  await click('//button[@title="2 x 3 table"]')
  await mode('WYSIWYG')
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .tiptap table tr").length === 3'), 'inserted table rows')
  assert.equal(await run('return document.querySelectorAll("[data-active=true] .tiptap th,[data-active=true] .tiptap td").length'), 6)
  await action('saveAs', join(fixtureDir, 'inserted-table.md'))
  const tableId = (await snapshot()).document.id
  const countBefore = (await snapshot()).documents.length
  await action('open', savedPath)
  assert.equal((await snapshot()).documents.length, countBefore, 'duplicate-path activation')
  await action('activate', tableId)
  // Keyboard-accessible contextual UI operating the real Tiptap selection.
  await click('(//*[@data-active="true"]//*[contains(concat(" ",normalize-space(@class)," ")," tiptap ")]//td)[1]')
  await click('//button[normalize-space(.)="Add row below"]')
  assert.equal(await run('return document.querySelectorAll("[data-active=true] .tiptap tr").length'), 4)
  await click('//button[normalize-space(.)="Move column left"]')
  assert.equal(await run('return document.querySelectorAll("[data-active=true] .tiptap th").length'), 3)
  await action('saveAll')
  // Settings Apply uses actual production config IPC and is checked again after a process restart.
  await click('//button[normalize-space(.)="File"]')
  await click('//button[normalize-space(.)="Settings…"]')
  await run('const select=[...document.querySelectorAll("dialog label")].find(e=>e.textContent.startsWith("Source text size")).querySelector("select"); select.value="18"; select.dispatchEvent(new Event("change",{bubbles:true}));')
  await click('//dialog//button[normalize-space(.)="Apply"]')
  await waitFor(async () => (await snapshot()).config.fontSize === 18, 'Settings Apply')
  // Folds never change bytes or dirty state, and are operable through native controls.
  await action('open', savedPath)
  const beforeFold = (await snapshot()).document.content
  await mode('Markdown')
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .source-fold").length===3'), 'default Mermaid folds')
  await click('(//*[@data-active="true"]//button[contains(@class,"source-fold")])[1]')
  assert.equal((await snapshot()).document.content, beforeFold)
  assert.equal((await snapshot()).document.isDirty, false)
  await mode('WYSIWYG')
  await action('create')
  await click('//button[normalize-space(.)="Insert"]')
  await click('//button[normalize-space(.)="Mermaid ERD"]')
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] [data-type=mermaid] svg").length===1'), 'ERD WYSIWYG')
  await mode('Markdown')
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .markwriter-preview svg").length===1'), 'ERD Preview')
  const erdPath = join(fixtureDir, 'erd.html')
  await action('exportHtml', erdPath)
  const erd = await readFile(erdPath,'utf8')
  assert.ok(erd.includes('<svg') && erd.includes('CUSTOMER') && !/<script\b/i.test(erd))
  const recoveryText = (await snapshot()).document.content
  const recoveryId = (await snapshot()).document.id
  await action('flush')
  // Exit after flush models an interrupted run without responding to dirty Close dialogs.
  // Only the isolated acceptance bridge exposes this explicit production quit command.
  await run('setTimeout(() => { void window.__MARKWRITER_ACCEPTANCE__.interrupt() }, 100); return true;')
  await delay(300)
  await request('DELETE', `/session/${session}`).catch(() => {})
  const restarted = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: binaryPath } } } })
  session = restarted.sessionId
  await request('POST', `/session/${session}/timeouts`, { script: 30000 })
  await waitFor(() => run('return !!window.__MARKWRITER_ACCEPTANCE__?.snapshot().document'), 'restarted application')
  const restored = await snapshot()
  assert.equal(restored.config.fontSize,18)
  assert.ok(restored.documents.some(doc=>doc.id===recoveryId && doc.content===recoveryText && doc.isDirty),'unnamed draft recovery')
  await action('activate', recoveryId)
  // Close Cancel retains the draft; deliberate Discard removes it from the next recovery snapshot.
  await run('void window.__MARKWRITER_ACCEPTANCE__.close(arguments[0]);', recoveryId)
  await waitFor(() => run('return !!document.querySelector("dialog[open]")'), 'dirty close prompt')
  await click('//dialog//button[normalize-space(.)="Cancel"]')
  await waitFor(() => run('return !document.querySelector("dialog[open]")'), 'close cancelled')
  assert.ok((await snapshot()).documents.some(doc=>doc.id===recoveryId))
  await run('void window.__MARKWRITER_ACCEPTANCE__.close(arguments[0]);', recoveryId)
  await waitFor(() => run('return !!document.querySelector("dialog[open]")'), 'discard prompt')
  await click('//dialog//button[normalize-space(.)="Discard"]')
  await waitFor(async () => !(await snapshot()).documents.some(doc=>doc.id===recoveryId), 'draft discarded')
  assert.ok(!(await snapshot()).documents.some(doc=>doc.id===recoveryId))
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ platform: process.platform, passed: true, cases: ['About version', 'unchanged mode cycles', 'byte-identical Save As', 'WYSIWYG edit', 'edited mode cycles', 'Save and reopen', 'three-diagram HTML export', 'Markdown table insertion', 'tab duplicate activation', 'contextual table commands', 'Save All', 'persistent Settings', 'fold byte preservation', 'Mermaid ERD preview/export', 'process restart draft recovery', 'dirty Close Cancel/Discard'] }, null, 2))
  console.log(`Native application acceptance passed on ${process.platform}`)
} catch (error) {
  if (session) {
    await writeFile(join(artifacts, 'page.html'), await request('GET', `/session/${session}/source`).catch(() => '')).catch(() => {})
    const screenshot = await request('GET', `/session/${session}/screenshot`).catch(() => null)
    if (screenshot) await writeFile(join(artifacts, 'failure.png'), Buffer.from(screenshot, 'base64'))
  }
  throw error
} finally {
  if (session) await request('DELETE', `/session/${session}`).catch(() => {})
  if (driver.pid) {
    try {
      if (process.platform === 'win32') driver.kill()
      else process.kill(-driver.pid, 'SIGTERM')
    } catch { /* The driver may already have exited. */ }
  }
  driver.stdout.destroy()
  driver.stderr.destroy()
  await writeFile(join(artifacts, 'driver.log'), driverLog)
}
