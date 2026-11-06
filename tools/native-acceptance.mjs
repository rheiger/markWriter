// Real desktop WebView + production store/IPC acceptance. Node 24; no npm packages.
// Protocol: https://www.w3.org/TR/webdriver2/#executing-script
// Driver: https://v2.tauri.app/develop/tests/webdriver/manual-setup/
import assert from 'node:assert/strict'
import { verifyNativeWorkerResponse } from './worker-response-acceptance.mjs'
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
const baselineSource = '# Native acceptance\n\nA paragraph.\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: Hello\n```\n\n```mermaid\nstateDiagram-v2\n [*] --> Ready\n```\n\n| Left | Center | Right |\n| :--- | :---: | ---: |\n| **Bold** | a \\| b | 3 |\n\n- [x] Done\n- [ ] Pending\n'
const source = baselineSource + '\n' + '```dot\ndigraph { rankdir=LR; a [label=" a   b ", shape=box]; a -> b }\n```\n\n~~~~graphviz\ndigraph { cluster_1 [label="Grüße 漢"]; cluster_1 -> end }\n~~~~\n'
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
  if (state.document) await waitFor(() => run('return document.querySelector("[data-active=true]")?.getAttribute("data-document-id")===arguments[0]', state.document.id), 'active document UI ownership')
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
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=dot] svg").length === 2'), 'two offline DOT preview diagrams')
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
  assert.equal((html.match(/<svg\b/g) ?? []).length, 5)
  assert.equal((html.match(/<table\b/g) ?? []).length, 1)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2)
  assert.ok(!/<script\b/i.test(html))

  await action('create')
  await mode('Markdown')
  await click('//button[@title="Insert Table"]')
  await click('//*[@role="gridcell" and @aria-label="2 columns, 3 rows"]')
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
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .source-fold").length===5'), 'default diagram folds')
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
  // 2.1 editing/search/navigation operate on real engines with native file writes.
  const navigationPath = join(fixtureDir, 'navigation.md')
  const navigation = '# Navigation\n\n' + Array.from({length: 35}, (_, i) => `## Anchor ${i}\n\nParagraph ${i} with **same** &amp; 😀 repeated prose.\n\n`).join('') + '```mermaid\nflowchart TD\n A[same] --> B[end]\n```\n'
  await writeFile(navigationPath, navigation)
  await action('open', navigationPath)
  await mode('Markdown')
  await waitFor(() => run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()?.selection.head===0'), 'fresh source caret at start')
  await run('window.__MARKWRITER_ACCEPTANCE__.scrollSourceTo("Paragraph 10")')
  await waitFor(() => run('const i=window.__MARKWRITER_ACCEPTANCE__.sourceInfo(); return i && i.previewScroll>100 && i.sourceTop.includes("Paragraph 10") && i.previewTop.includes("Paragraph 10")'), 'content-aware source scroll')
  const scrolled = await run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()')
  assert.deepEqual(scrolled.selection, {anchor:0,head:0})
  const sourceNumber = /(?:Paragraph|Anchor) (\d+)/.exec(scrolled.sourceTop)?.[1]
  const previewNumber = /(?:Paragraph|Anchor) (\d+)/.exec(scrolled.previewTop)?.[1]
  assert.ok(sourceNumber && previewNumber, JSON.stringify(scrolled))
  assert.equal(sourceNumber, previewNumber, JSON.stringify(scrolled))
  await action('configure', {syncPreview:false})
  const independent = await run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo().previewScroll')
  await run('window.__MARKWRITER_ACCEPTANCE__.scrollSource(1200)')
  await delay(200)
  assert.equal((await run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()')).previewScroll, independent)
  await action('configure', {syncPreview:true})
  await click('//button[normalize-space(.)="Edit"]')
  await click('//button[.//span[normalize-space(.)="Replace..."]]')
  await run('const input=document.querySelector("[role=search] textarea"); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set; set.call(input,"same"); input.dispatchEvent(new Event("input",{bubbles:true}));')
  await waitFor(() => run('return document.querySelector("[role=search] output")?.textContent.includes("36 matches")'), 'source search includes folded diagram')
  await run('const input=document.querySelectorAll("[role=search] textarea")[1]; const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set; set.call(input,"changed"); input.dispatchEvent(new Event("input",{bubbles:true}));')
  await click('//button[normalize-space(.)="Replace All"]')
  await waitFor(async () => !(await snapshot()).document.content.includes('same'), 'source Replace All')
  await click('//button[normalize-space(.)="Close Find"]')
  await click('//button[normalize-space(.)="Edit"]'); await click('//button[.//span[normalize-space(.)="Undo"]]')
  await waitFor(async () => (await snapshot()).document.content===navigation, 'one-step Replace All undo')
  assert.equal((await snapshot()).document.isDirty,false)
  await action('save')
  assert.equal(await readFile(navigationPath,'utf8'), navigation)
  await mode('WYSIWYG')
  await click('//button[normalize-space(.)="Edit"]'); await click('//button[.//span[normalize-space(.)="Find..."]]')
  await waitFor(() => run('return document.querySelector("[role=search] output")?.textContent.includes("35 matches")'), 'rendered search excludes atom source')
  await click('//button[normalize-space(.)="Close Find"]')
  const previewExport = join(fixtureDir,'navigation.html')
  await action('exportHtml',previewExport)
  assert.ok(!(await readFile(previewExport,'utf8')).includes('data-mw-'), 'view-only mappings excluded from export')
  // DOT jobs use production bundled worker responses, not the test bridge policy.
  const workerPolicy=await verifyNativeWorkerResponse(request,session,join(root,'frontend','dist-acceptance','assets'))
  const dotPath = join(fixtureDir, 'dot-draft.md')
  await writeFile(dotPath, '# DOT recovery\n\n' + source.slice(source.indexOf('```dot')))
  const dotOwnerId=(await action('open', dotPath)).document.id; await mode('Markdown'); await waitFor(() => run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=dot] svg").length===2'), 'DOT aliases after open')
  const dotBefore = (await snapshot()).document.content
  await run(`const text=document.querySelector('[data-active=true] .markwriter-preview [data-mw-text]').firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,3);getSelection().removeAllRanges();getSelection().addRange(range)`)
  await click('(//*[@data-active="true"]//*[@data-type="dot"]/*[local-name()="svg"])[1]')
  await waitFor(()=>run(`return document.querySelector('[data-active=true] .markwriter-preview [data-type=dot]')?.closest('[data-mw-block]')?.classList.contains('correspondence-block')`),'DOT source block after prior Preview text selection')
  await action('create'); await action('activate', dotOwnerId)
  await mode('WYSIWYG'); await waitFor(() => run('return document.querySelectorAll("[data-active=true] .tiptap [data-type=dot] svg").length===2'), 'DOT rendered nodes after tab switch')
  assert.equal((await snapshot()).document.content,dotBefore);assert.equal((await snapshot()).document.isDirty,false)
  const dotExport = join(fixtureDir,'dot-export.html'); await action('exportHtml',dotExport)
  const dotHtml = await readFile(dotExport,'utf8');assert.equal((dotHtml.match(/<svg\b/g)??[]).length,2);assert.ok(!/data-(?:mw-|chart|source-fence)|<script|javascript:/.test(dotHtml))
  await writeFile(join(artifacts,'dot-worker-policy.json'),JSON.stringify(workerPolicy,null,2))
  const stressDot='digraph {'+Array.from({length:400},(_,i)=>`a${i} -> {${Array.from({length:20},(_,j)=>'a'+((i+j*17+1)%400)).join(' ')}}`).join('\n')+'}'
  for(const [name,chart,error] of [['malformed','digraph {a ->}', 'syntax'],['empty','','empty'],['resource','digraph {a [URL="javascript:alert(1)"]}', 'attribute'],['oversize','x'.repeat(65537),'64 KiB'],['output-limit','digraph {node[label="'+'x'.repeat(5000)+'"];'+Array.from({length:500},(_,i)=>'a'+i+';').join('')+'}','2 MiB'],['timeout',stressDot,'timed out']]) {
    const path=join(fixtureDir,`dot-${name}.md`),text='```dot\n'+chart+'\n```\n';await writeFile(path,text)
    await action('open',path);await mode('Markdown')
    await waitFor(()=>run('return document.querySelector("[data-active=true] .markwriter-preview [data-type=dot]")?.textContent.includes(arguments[0])',error),'recoverable DOT '+name)
    assert.equal((await snapshot()).document.content,text);assert.equal((await snapshot()).document.isDirty,false)
    await action('saveAs',join(fixtureDir,`dot-${name}-copy.md`));assert.equal(await readFile(join(fixtureDir,`dot-${name}-copy.md`),'utf8'),text)
  }
  await action('open',dotPath);await mode('Markdown');await waitFor(()=>run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=dot] svg").length===2'),'native DOT recovery after timeout')
  // Keep previous recovery fixture active for restart coverage.
  await action('activate', (await snapshot()).documents.find(doc=>doc.content.includes('CUSTOMER') && !doc.path).id)
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
  assert.equal(restored.config.syncPreview,true)
  assert.equal(restored.config.wrapContinuation,true)
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
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ platform: process.platform, passed: true, cases: ['About version', 'unchanged mode cycles', 'byte-identical Save As', 'WYSIWYG edit', 'edited mode cycles', 'Save and reopen', 'three-diagram HTML export', 'Markdown table insertion', 'tab duplicate activation', 'contextual table commands', 'Save All', 'persistent Settings', 'fold byte preservation', 'Mermaid ERD preview/export', 'process restart draft recovery', 'dirty Close Cancel/Discard', 'fresh caret at start', 'content-aware navigation', 'sync-off independence', 'source/rendered search scope', 'Replace All undo and exact native Save', 'mapping-free HTML export', 'DOT aliases offline Preview/rendered nodes', 'DOT source-preserving tab/mode cycles', 'DOT static export', 'DOT actual worker response policy','DOT malformed/empty/resource/oversize/output-limit source-preserving failures','DOT actual worker timeout and recovery'] }, null, 2))
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
