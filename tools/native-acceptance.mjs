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
  const response = await fetch(`http://127.0.0.1:4444${path}`, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
  })
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
  await click(`//button[normalize-space(.)='${name}']`)
  await waitFor(() => run('const e=document.querySelector(arguments[0]); return !!e && e.getBoundingClientRect().height > 0', name === 'Markdown' ? '.cm-content' : '.tiptap'), `${name} editor`)
}
async function preview() {
  await waitFor(() => run('return document.querySelectorAll(".markwriter-preview [data-type=mermaid] svg").length === 3'), 'three rendered preview diagrams')
}

try {
  await waitFor(() => request('GET', '/status'), 'driver startup')
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: binaryPath } } } })
  session = created.sessionId
  await request('POST', `/session/${session}/timeouts`, { script: 30000 })
  await waitFor(() => run('return !!window.__MARKWRITER_ACCEPTANCE__?.snapshot().document'), 'application startup')
  assert.equal((await action('open', sourcePath)).document.content, source)
  for (let cycle = 0; cycle < 5; cycle++) {
    await mode('Markdown'); await preview(); await mode('WYSIWYG')
    assert.equal((await snapshot()).document.content, source)
    assert.equal((await snapshot()).document.isDirty, false)
  }
  await action('saveAs', savedPath)
  assert.equal(await readFile(savedPath, 'utf8'), source)

  // Edit through the actual contenteditable DOM; store and conversion run normally.
  assert.equal(await run('const p=[...document.querySelectorAll(".tiptap p")].find(e=>e.textContent==="A paragraph."); const range=document.createRange(); range.setStart(p,0); range.collapse(true); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); p.parentElement.focus(); return document.execCommand("insertText", false, "Edited ");'), true)
  await waitFor(async () => (await snapshot()).document.content.includes('Edited A paragraph.'), 'WYSIWYG edit serialization')
  const edited = (await snapshot()).document.content
  assert.ok(edited.includes('a \\| b'))
  assert.ok(edited.includes('- [x] Done'))
  for (let cycle = 0; cycle < 3; cycle++) { await mode('Markdown'); await preview(); await mode('WYSIWYG') }
  assert.equal((await snapshot()).document.content, edited)
  await action('save')
  assert.equal(await readFile(savedPath, 'utf8'), edited)
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
  await waitFor(() => run('return document.querySelectorAll(".tiptap table tr").length === 3'), 'inserted table rows')
  assert.equal(await run('return document.querySelectorAll(".tiptap th,.tiptap td").length'), 6)
  await action('saveAs', join(fixtureDir, 'inserted-table.md'))
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ platform: process.platform, passed: true, cases: ['unchanged mode cycles', 'byte-identical Save As', 'WYSIWYG edit', 'edited mode cycles', 'Save and reopen', 'three-diagram HTML export', 'Markdown table insertion'] }, null, 2))
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
