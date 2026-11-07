import { verifyRegex } from './regex-acceptance.mjs'
// Real desktop WebView + production store/IPC acceptance. Node 24; no npm packages.
// Protocol: https://www.w3.org/TR/webdriver2/#executing-script
// Driver: https://v2.tauri.app/develop/tests/webdriver/manual-setup/
import { verifyTechnicalWriting } from './technical-writing-acceptance.mjs'
import { verifyLongCode } from './long-code-acceptance.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { codeFixtureCases } from './code-fixtures.mjs'
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
const profileDir = join(fixtureDir, 'profile')
await mkdir(profileDir)
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
const driver = spawn(driverPath, driverArgs, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: { ...process.env, MARKWRITER_PROFILE_DIR: profileDir } })
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
  // Tab mounting and its shared toolbar mode notification settle in separate commits.
  await waitFor(() => run(`const s=document.querySelector('button[role="switch"]'),a=document.querySelector('[data-active=true]');if(!s||!a)return false;const m=s.getAttribute('aria-checked')==='true',e=a.querySelector(m?'.cm-content':'.tiptap');return !!e&&e.getBoundingClientRect().height>0`), 'active editor and toolbar mode agree')
  const markdown = await run(`return document.querySelector('button[role="switch"]').getAttribute('aria-checked') === 'true'`)
  if (markdown !== (name === 'Markdown')) await click('//button[@role="switch" and @aria-label="Markdown mode"]')
  await waitFor(() => run(`const e=document.querySelector(arguments[0]); const checked=document.querySelector('button[role="switch"]').getAttribute('aria-checked')==='true'; return !!e && e.getBoundingClientRect().height>0 && checked===arguments[1]`, name === 'Markdown' ? '[data-active=true] .cm-content' : '[data-active=true] .tiptap', name === 'Markdown'), `${name} editor`)
}
async function preview() {
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=mermaid] svg").length === 3'), 'three rendered preview diagrams')
  await waitFor(() => run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=dot] svg").length === 2'), 'two offline DOT preview diagrams')
}
async function menu(name, option) {
  await click(`//button[normalize-space(.)="${name}"]`)
  await click(`//button[normalize-space(.)="${option}" or .//span[normalize-space(.)="${option}"]]`)
}
async function dismissMenu() {
  // Exercise normal outside-click dismissal with real pointer input, away
  // from every dropdown. Do not use a synthetic DOM click.
  const point = await waitFor(() => run(`const overlay=document.querySelector('.menu-overlay'),x=innerWidth-8,y=innerHeight-8;return overlay&&document.elementFromPoint(x,y)===overlay?{x,y}:null`), 'menu outside-click target')
  await request('POST', `/session/${session}/actions`, { actions: [{ type: 'pointer', id: 'menu-dismiss', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', origin: 'viewport', duration: 0, x: point.x, y: point.y },
    { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
  ] }] })
  await waitFor(() => run('return !document.querySelector(".menu-overlay")'), 'menu dismissed by outside click')
}
async function syntax(enabled, control = 'toolbar') {
  const current = (await snapshot()).config.syntaxHighlighting
  await waitFor(() => run(`return document.querySelector('button[aria-label="Syntax highlighting"]')?.getAttribute('aria-pressed')===String(arguments[0])`, current), 'syntax toolbar reflects config')
  if (current !== enabled) {
    if (control === 'toolbar') await click('//button[@aria-label="Syntax highlighting"]')
    else await menu('View', 'Syntax highlighting')
  }
  await waitFor(async () => (await snapshot()).config.syntaxHighlighting === enabled, 'syntax preference update')
  assert.equal(await run(`return document.querySelector('button[aria-label="Syntax highlighting"]').getAttribute('aria-pressed')`), String(enabled))
  await click('//button[normalize-space(.)="View"]')
  assert.equal(await run('return document.querySelector("button[role=menuitemcheckbox]").getAttribute("aria-checked")'), String(enabled))
  await dismissMenu()
}
async function theme(name) {
  await menu('View', name)
  const expected = name === 'Auto' ? 'system' : name.toLowerCase()
  await waitFor(async () => (await snapshot()).config.theme === expected, `${name} theme preference`)
  await waitFor(() => run('return document.documentElement.getAttribute("data-theme")===arguments[0]', expected === 'system' ? null : expected), `${name} applied theme`)
  await click('//button[normalize-space(.)="View"]')
  assert.equal(await run('return [...document.querySelectorAll("button[role=menuitemradio]")].find(b=>b.getAttribute("aria-checked")==="true").querySelector("span").textContent'), name)
  await dismissMenu()
}
const renderedModel = () => run(`return document.querySelector('[data-active=true] .tiptap').editor.getJSON()`)
async function editRenderedProbe() {
  await run(`const p=[...document.querySelectorAll('[data-active=true] .tiptap p')].find(e=>e.textContent==='Before paragraph.');p.parentElement.focus();const r=document.createRange();r.setStart(p.firstChild,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);document.execCommand('insertText',false,'Edited ');`)
  await waitFor(async () => (await snapshot()).document.content.includes('Edited Before paragraph.'), 'rendered history edit')
}
const alpha3Cases = [], alpha3Evidence = { languages: [], viewports: [] }

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
  for(const editorMode of ['Markdown','WYSIWYG']){
    await action('create');await mode(editorMode)
    await click('//button[normalize-space(.)="Insert"]');await click('//button[normalize-space(.)="DOT"]')
    await waitFor(()=>run('return document.querySelectorAll(arguments[0]).length===1',editorMode==='Markdown'?'[data-active=true] .markwriter-preview [data-type=dot] svg':'[data-active=true] .tiptap [data-type=dot] svg'),'DOT starter in '+editorMode)
    const inserted=(await snapshot()).document.content;assert.ok(inserted.includes('start -> finish;'))
    const path=join(fixtureDir,'dot-starter-'+editorMode+'.md');await action('saveAs',path);assert.equal(await readFile(path,'utf8'),inserted)
    await mode(editorMode==='Markdown'?'WYSIWYG':'Markdown');await mode(editorMode)
    assert.equal((await snapshot()).document.content,inserted,'Starter source preserved through both editor views')
    await click('//button[normalize-space(.)="Edit"]');await click('//button[.//span[normalize-space(.)="Undo"]]')
    await action('save');assert.equal(await readFile(path,'utf8'),'','One DOT starter Undo restores the empty native file')
  }
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
  for(const [name,text,paragraph] of [['unmatched','Before\n\n~~~~graphviz\ndigraph {a -> b}\n','Before'],['cr-only','```dot\rdigraph {a -> b}\r```\r\rAfter','After']]){
    const path=join(fixtureDir,`dot-codec-${name}.md`);await writeFile(path,text);await action('open',path);await mode('WYSIWYG')
    await waitFor(()=>run('return document.querySelectorAll("[data-active=true] .tiptap [data-type=dot] svg").length===1'),'native codec fixture '+name)
    await mode('Markdown');await mode('WYSIWYG');assert.equal((await snapshot()).document.content,text,'Codec edge fixture stays canonical and clean across views');assert.equal((await snapshot()).document.isDirty,false)
    await run(`const e=document.querySelector('[data-active=true] .tiptap').editor;e.commands.insertContentAt(e.state.doc.content.size,'<p>New rendered paragraph.</p>')`)
    const saved=join(fixtureDir,`dot-codec-${name}-saved.md`);await action('saveAs',saved)
    const reopened=join(fixtureDir,`dot-codec-${name}-reopened.md`);await writeFile(reopened,await readFile(saved));await action('open',reopened);await mode('WYSIWYG')
    const result=await run(`const e=document.querySelector('[data-active=true] .tiptap').editor,d=new DOMParser().parseFromString(e.getHTML(),'text/html');return {charts:[...d.querySelectorAll('[data-type=dot]')].map(n=>n.getAttribute('data-chart')),paragraphs:[...d.querySelectorAll('p')].map(n=>n.textContent).filter(Boolean)}`)
    assert.deepEqual(result,{charts:['digraph {a -> b}\n'],paragraphs:[paragraph,'New rendered paragraph.']},'Native rendered edit/save/reopen must preserve distinct graph and prose')
  }
  const backtickSource='```dot\n'+'`a'.repeat(150000),backtickPath=join(fixtureDir,'dot-many-backticks.md')
  await writeFile(backtickPath,backtickSource);await action('open',backtickPath);await mode('Markdown')
  await waitFor(()=>run('return document.querySelector("[data-active=true] .markwriter-preview [data-type=dot]")?.textContent.includes("64 KiB")'),'oversized unmatched DOT is a recoverable error, not a codec stack crash')
  await action('saveAs',join(fixtureDir,'dot-many-backticks-copy.md'));assert.equal(await readFile(join(fixtureDir,'dot-many-backticks-copy.md'),'utf8'),backtickSource)
  const stressDot='digraph {'+Array.from({length:400},(_,i)=>`a${i} -> {${Array.from({length:20},(_,j)=>'a'+((i+j*17+1)%400)).join(' ')}}`).join('\n')+'}'
  for(const [name,chart,error] of [['malformed','digraph {a ->}', 'syntax'],['empty','','empty'],['resource','digraph {a [URL="javascript:alert(1)"]}', 'attribute'],['oversize','x'.repeat(65537),'64 KiB'],['output-limit','digraph {node[label="'+'x'.repeat(5000)+'"];'+Array.from({length:500},(_,i)=>'a'+i+';').join('')+'}','2 MiB'],['timeout',stressDot,'timed out']]) {
    const path=join(fixtureDir,`dot-${name}.md`),text='```dot\n'+chart+'\n```\n';await writeFile(path,text)
    await action('open',path);await mode('Markdown')
    await waitFor(()=>run('return document.querySelector("[data-active=true] .markwriter-preview [data-type=dot]")?.textContent.includes(arguments[0])',error),'recoverable DOT '+name)
    assert.equal((await snapshot()).document.content,text);assert.equal((await snapshot()).document.isDirty,false)
    await action('saveAs',join(fixtureDir,`dot-${name}-copy.md`));assert.equal(await readFile(join(fixtureDir,`dot-${name}-copy.md`),'utf8'),text)
  }
  await action('open',dotPath);await mode('Markdown');await waitFor(()=>run('return document.querySelectorAll("[data-active=true] .markwriter-preview [data-type=dot] svg").length===2'),'native DOT recovery after timeout')
  // Alpha3: small per-block documents keep every token visible in CodeMirror's
  // virtualized DOM. Both real engines and native I/O run without lexer mocks.
  const syntaxFixture = await readFile(join(root, 'tools', 'fixtures', 'code-highlighting-alpha3.md'), 'utf8')
  const codeCases = codeFixtureCases(syntaxFixture)
  assert.equal(codeCases.length, 26)
  await syntax(true)
  for (const [index, match] of codeCases.entries()) {
    const [, info, code] = match, text = `# Native code ${index + 1}\n\n${match[0]}\n`
    const highlighted = !['plaintext', 'unknown'].includes(info) && code !== 'x = 1'
    const path = join(fixtureDir, `code-${index + 1}.md`)
    await writeFile(path, text)
    const id = (await action('open', path)).document.id
    await mode('Markdown')
    await waitFor(() => run(`const cm=document.querySelector('[data-active=true] .cm-content'),pv=document.querySelector('[data-active=true] .markwriter-preview pre code');return !!cm&&!!pv&&pv.textContent.replace(/\\n$/,'')===arguments[0]&&!!cm.querySelector('[class*=hljs-]')===arguments[1]&&!!pv.querySelector('[class*=hljs-]')===arguments[1]`, code, highlighted), `source and Preview code ${index + 1}: ${info || 'auto'}`)
    await mode('WYSIWYG')
    await waitFor(() => run(`const code=document.querySelector('[data-active=true] .tiptap pre code');return !!code&&code.textContent.replace(/\\n$/,'')===arguments[0]&&!!code.querySelector('[class*=hljs-]')===arguments[1]`, code, highlighted), `rendered code ${index + 1}: ${info || 'auto'}`)
    assert.equal((await snapshot()).document.content, text, 'code language detection is view-only')
    assert.equal((await snapshot()).document.isDirty, false)
    assert.equal(await run('return typeof window.__codeExecuted'), 'undefined', 'code markup never executes')
    const copy = join(fixtureDir, `code-${index + 1}-copy.md`)
    await action('saveAs', copy)
    assert.equal(await readFile(copy, 'utf8'), text, 'both-engine native code Save As preserves bytes')
    alpha3Evidence.languages.push({ info: info || '(unlabeled)', highlighted, code, sourcePreserved: true })
    await action('close', id)
  }
  alpha3Cases.push('all19 supported language variants in real CodeMirror, Preview and Tiptap with byte-identical native saves', 'native alias/plain/unknown/convincing-auto/ambiguous-auto and escaped Unicode code')

  const controlsSource = '# Alpha3 view controls\n\nBefore paragraph.\n\n```js\nconst value = "😀<script>window.__codeExecuted = true</script>";\n```\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n```dot\ndigraph { a -> b }\n```\n'
  const controlsPath = join(fixtureDir, 'alpha3-controls.md')
  await writeFile(controlsPath, controlsSource)
  const controlsId = (await action('open', controlsPath)).document.id
  await mode('Markdown')
  await waitFor(() => run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()?.folds===2'), 'controls diagram folds')
  await run('window.__MARKWRITER_ACCEPTANCE__.selectSource(arguments[0],arguments[1])', controlsSource.indexOf('const') + 2, controlsSource.indexOf('😀') + 2)
  await waitFor(() => run('return !!document.querySelector("[data-active=true] .preview-correspondence .correspondence-range")&&!document.querySelector("[data-active=true] .markwriter-preview .correspondence-block")'), 'exact highlighted source-to-Preview range')
  await run(`const root=document.querySelector('[data-active=true] .markwriter-preview'),span=root.querySelector('pre [data-mw-text]'),walker=document.createTreeWalker(span,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){if(!text.textContent.includes('😀'))continue;const start=text.textContent.indexOf('😀'),range=document.createRange();range.setStart(text,start);range.setEnd(text,start+2);root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));break}`)
  await waitFor(() => run('const s=window.__MARKWRITER_ACCEPTANCE__.sourceInfo()?.selection;return s?.anchor===arguments[0]&&s.head===arguments[0]+2', controlsSource.indexOf('😀')), 'highlighted Preview emoji selection maps to exact UTF-16 source')
  assert.equal((await snapshot()).document.content, controlsSource)
  assert.equal((await snapshot()).document.isDirty, false)
  alpha3Cases.push('exact native highlighted source/Preview correspondence through nested token spans and UTF-16 emoji')
  await run(`window.__MARKWRITER_ACCEPTANCE__.selectSource(arguments[0]);document.querySelector('[data-active=true] .cm-content').focus();`, controlsSource.length)
  await waitFor(() => run(`const e=document.querySelector('[data-active=true] .cm-content');return document.activeElement===e&&e.contains(getSelection()?.focusNode)`), 'source native selection is focused before editing')
  await run(`document.execCommand('insertText',false,'Source history probe.');`)
  await waitFor(async () => (await snapshot()).document.content === controlsSource + 'Source history probe.', 'source history edit')
  await run('window.__MARKWRITER_ACCEPTANCE__.selectSource(arguments[0],arguments[0]+5)', controlsSource.indexOf('value ='))
  const sourceSelection = await run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()')
  const editedSource = (await snapshot()).document
  await syntax(false, 'toolbar')
  await waitFor(() => run('return !document.querySelector("[data-active=true] .cm-content [class*=hljs-],[data-active=true] .markwriter-preview [class*=hljs-]")'), 'source and Preview highlighting disabled')
  const disabledSource = await run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()')
  assert.deepEqual(disabledSource.selection, sourceSelection.selection)
  assert.equal(disabledSource.folds, sourceSelection.folds)
  assert.equal((await snapshot()).document.revision, editedSource.revision)
  await mode('WYSIWYG')
  await waitFor(() => run('return !document.querySelector("[data-active=true] .tiptap [class*=hljs-]")'), 'rendered highlighting disabled')
  await syntax(true, 'menu')
  await waitFor(() => run('return !!document.querySelector("[data-active=true] .tiptap [class*=hljs-]")'), 'View menu enables rendered highlighting')
  await mode('Markdown')
  assert.equal((await snapshot()).document.content, editedSource.content)
  assert.deepEqual((await run('return window.__MARKWRITER_ACCEPTANCE__.sourceInfo()')).selection, sourceSelection.selection)
  await menu('Edit', 'Undo')
  await waitFor(async () => (await snapshot()).document.content === controlsSource, 'syntax toggle leaves source Undo history intact')
  assert.equal((await snapshot()).document.isDirty, false)
  await action('save')
  assert.equal(await readFile(controlsPath, 'utf8'), controlsSource)
  // Real rendered edits use the established Markdown serializer, which may
  // normalize whitespace. Compare Undo with an independently edited/Undone
  // control copy, retaining exact model + native-byte equivalence. Every
  // view-only operation above still has to preserve the original source bytes.
  const referencePath = join(fixtureDir, 'alpha3-rendered-undo-control.md')
  await writeFile(referencePath, controlsSource)
  const referenceId = (await action('open', referencePath)).document.id
  await mode('WYSIWYG')
  const referenceModel = await renderedModel()
  await editRenderedProbe()
  await menu('Edit', 'Undo')
  await waitFor(async () => JSON.stringify(await renderedModel()) === JSON.stringify(referenceModel), 'untoggled rendered Undo restores exact document model')
  const controlsAfterEdit = (await snapshot()).document.content
  const referenceUndoDirty = (await snapshot()).document.isDirty
  await action('save')
  assert.equal(await readFile(referencePath, 'utf8'), controlsAfterEdit)
  await action('close', referenceId)
  await action('activate', controlsId)
  await mode('WYSIWYG')
  await waitFor(async () => JSON.stringify(await renderedModel()) === JSON.stringify(referenceModel), 'toggled and untoggled copies start with the same rendered model')
  const beforeRenderedEdit = await renderedModel()
  await editRenderedProbe()
  const renderedSelection = await run(`const e=document.querySelector('[data-active=true] .tiptap').editor;return {from:e.state.selection.from,to:e.state.selection.to}`)
  const renderedRevision = (await snapshot()).document.revision
  await syntax(false, 'menu'); await syntax(true, 'toolbar')
  assert.deepEqual(await run(`const e=document.querySelector('[data-active=true] .tiptap').editor;return {from:e.state.selection.from,to:e.state.selection.to}`), renderedSelection)
  assert.equal((await snapshot()).document.revision, renderedRevision)
  await menu('Edit', 'Undo')
  await waitFor(async () => JSON.stringify(await renderedModel()) === JSON.stringify(beforeRenderedEdit), 'syntax toggle leaves exact rendered Undo model intact')
  assert.equal((await snapshot()).document.content, controlsAfterEdit, 'toggled and untoggled rendered Undo produce identical Markdown')
  assert.equal((await snapshot()).document.isDirty, referenceUndoDirty, 'toggled and untoggled rendered Undo have identical dirty state')
  await action('save')
  assert.equal(await readFile(controlsPath, 'utf8'), await readFile(referencePath, 'utf8'), 'toggled and untoggled rendered Undo save byte-identically')
  const originalBytes = Buffer.from(controlsSource), serializedBytes = Buffer.from(controlsAfterEdit)
  const firstDifference = originalBytes.findIndex((byte, index) => serializedBytes[index] !== byte)
  const sha256 = value => createHash('sha256').update(value).digest('hex')
  alpha3Evidence.renderedUndo = {
    originalViewOnlySource: controlsSource, referenceSource: controlsAfterEdit, toggledSource: (await snapshot()).document.content,
    originalSHA256: sha256(originalBytes), referenceSHA256: sha256(serializedBytes), toggledSHA256: sha256(await readFile(controlsPath)),
    originalBytes: originalBytes.length, serializedBytes: serializedBytes.length,
    firstDifferentByte: originalBytes.equals(serializedBytes) ? null : firstDifference < 0 ? originalBytes.length : firstDifference,
    modelRestored: true, dirtyBeforeSave: referenceUndoDirty,
  }
  assert.equal((await snapshot()).document.isDirty, false)
  alpha3Cases.push('toolbar and View syntax controls synchronized across both engines without selection/fold/revision/history changes')

  const fontSettings = (await snapshot()).config
  // Measure chrome against a settled window before resizing. Sampling innerWidth
  // immediately after setWindowRect can observe the previous WebView draw.
  const originalBounds = await request('GET', `/session/${session}/window/rect`)
  const chromeWidth = originalBounds.width - await run('return window.innerWidth')
  for (const width of [800, 1024, 1440]) {
    const windowBounds = await request('POST', `/session/${session}/window/rect`, { width: width + chromeWidth, height: 900 })
    await waitFor(() => run('return window.innerWidth===arguments[0]', width), `actual native ${width}px viewport`)
    for (const name of ['Light', 'Dark', 'Auto']) {
      await theme(name)
      for (const editorMode of ['Markdown', 'WYSIWYG']) {
        await mode(editorMode)
        const style = await run(`const t=document.querySelector('.toolbar'),s=getComputedStyle(t),dark=arguments[0]==='Dark'||arguments[0]==='Auto'&&matchMedia('(prefers-color-scheme: dark)').matches,primary=dark?'rgb(26, 26, 26)':'rgb(255, 255, 255)',secondary=dark?'rgb(45, 45, 45)':'rgb(248, 249, 250)',text=dark?'rgb(255, 255, 255)':'rgb(33, 37, 41)',buttons=[...t.querySelectorAll('button,select')].filter(e=>e.getBoundingClientRect().width>0);return {width:innerWidth,mode:arguments[1],theme:arguments[0],dark,background:s.backgroundColor,expectedBackground:secondary,text:s.color,expectedText:text,primary,withinViewport:buttons.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),fontBackground:getComputedStyle(t.querySelector('select')).backgroundColor,colorScheme:s.colorScheme}`, name, editorMode)
        style.windowBounds = windowBounds
        assert.equal(style.background, style.expectedBackground)
        assert.equal(style.text, style.expectedText)
        assert.equal(style.fontBackground, style.primary)
        assert.equal(style.colorScheme, style.dark ? 'dark' : 'light')
        assert.ok(style.withinViewport, JSON.stringify(style))
        assert.equal(await run(`return document.querySelector('select[aria-label="Text size"]').value`), String(editorMode === 'Markdown' ? fontSettings.fontSize : fontSettings.renderedFontSize))
        await click('//button[@title="Headings"]')
        assert.equal(await run('return getComputedStyle(document.querySelector(".toolbar-dropdown-menu")).backgroundColor'), style.primary)
        await click('//button[@title="Headings"]')
        await click('//button[@aria-label="Insert Table"]')
        const table = await run('const e=document.querySelector(".table-picker"),r=e.getBoundingClientRect();return {background:getComputedStyle(e).backgroundColor,within:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}')
        assert.equal(table.background, style.primary); assert.ok(table.within, JSON.stringify(table))
        await click('//div[@role="dialog" and @aria-label="Insert table"]//button[normalize-space(.)="Cancel"]')
        assert.equal((await snapshot()).document.content, controlsAfterEdit)
        assert.equal((await snapshot()).document.isDirty, false)
        alpha3Evidence.viewports.push(style)
      }
    }
  }
  assert.equal((await snapshot()).config.fontSize, fontSettings.fontSize)
  assert.equal((await snapshot()).config.renderedFontSize, fontSettings.renderedFontSize)
  // Settings and the new View menu read/write the same theme preference.
  await menu('File', 'Settings…')
  assert.equal(await run('return [...document.querySelectorAll("dialog label")].find(e=>e.textContent.startsWith("Theme")).querySelector("select").value'), 'system')
  await click('//dialog//button[normalize-space(.)="Cancel"]')
  alpha3Cases.push('native toolbar/menu/table/font themes in both modes at actual800/1024/1440px viewports with independent fonts preserved')
  const syntaxExportOn = join(fixtureDir, 'syntax-on.html'), syntaxExportOff = join(fixtureDir, 'syntax-off.html')
  await action('exportHtml', syntaxExportOn)
  const highlightedExport = await readFile(syntaxExportOn, 'utf8')
  assert.match(highlightedExport, /<span class="hljs-/)
  assert.match(highlightedExport, /\.hljs-keyword/)
  assert.ok(!/<script\b|data-mw-/.test(highlightedExport))
  await syntax(false, 'toolbar')
  await action('exportHtml', syntaxExportOff)
  assert.ok(!/<span class="hljs-/.test(await readFile(syntaxExportOff, 'utf8')))
  assert.equal((await snapshot()).document.content, controlsAfterEdit)
  await theme('Dark')
  alpha3Cases.push('native HTML export captures syntax preference and embeds escaped static token CSS')
  // Keep previous recovery fixture active for restart coverage.
  await action('activate', (await snapshot()).documents.find(doc=>doc.content.includes('CUSTOMER') && !doc.path).id)
  await mode('Markdown')
  const recoveryExpected=(await snapshot()).document.content+'\n\n```math\n\\frac{1}{2}+x^2\n```\n\nInline `a  b` and `   `.\n'
  await run(`const e=document.querySelector('[data-active=true] .cm-content');e.focus();document.execCommand('selectAll');document.execCommand('insertText',false,arguments[0]);`,recoveryExpected)
  await waitFor(async()=>(await snapshot()).document.content===recoveryExpected,'exact math/code draft updated before recovery snapshot')
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
  assert.equal(restored.config.syntaxHighlighting,false)
  assert.equal(restored.config.theme,'dark')
  await action('activate', controlsId)
  assert.equal(await run(`return document.querySelector('button[aria-label="Syntax highlighting"]').getAttribute('aria-pressed')`), 'false')
  assert.equal(await run('return document.documentElement.getAttribute("data-theme")'), 'dark')
  for (const editorMode of ['Markdown', 'WYSIWYG']) {
    await mode(editorMode)
    await waitFor(() => run('return !document.querySelector("[data-active=true] [class*=hljs-]")'), `disabled syntax restored in ${editorMode}`)
    assert.equal((await snapshot()).document.content, controlsAfterEdit)
    assert.equal((await snapshot()).document.isDirty, false)
  }
  alpha3Cases.push('syntax and theme preferences persist through actual process restart and both-engine UI restoration')
  await writeFile(join(artifacts,'alpha3-evidence.json'), JSON.stringify({ platform: process.platform, profile: profileDir, ...alpha3Evidence },null,2))
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
  const regex = await verifyRegex({dir:fixtureDir,run,click,menu,
    mode: markdown => mode(markdown ? 'Markdown' : 'WYSIWYG'),open: path => action('open',path),
    saveAs: path => action('saveAs',path),save: () => action('save'),wait:waitFor,request,session})
  alpha3Cases.push(...regex.cases)
  const regexWorkerPolicy=await verifyNativeWorkerResponse(request,session,join(root,'frontend/dist-acceptance/assets'),'regex')
  alpha3Cases.push('regex worker exact native bytes, MIME and network-denying CSP')
  await writeFile(join(artifacts,'regex-worker-evidence.json'),JSON.stringify(regexWorkerPolicy,null,2))
  const technical = await verifyTechnicalWriting({root,artifacts,dir:fixtureDir,run,click,menu,
    mode: markdown => mode(markdown ? 'Markdown' : 'WYSIWYG'),
    open: path => action('open',path),
    close: async () => { const id=(await snapshot()).document.id; await action('close',id) },
    saveAs: path => action('saveAs',path),save: () => action('save'),
    exportHtml: path => action('exportHtml',path),wait:waitFor,request,session,assets:join(root,'frontend/dist-acceptance/assets')})
  alpha3Cases.push(...technical.cases)
  const longCode = await verifyLongCode({dir:fixtureDir,artifacts,run,click,menu,
    mode: markdown => mode(markdown ? 'Markdown' : 'WYSIWYG'),open: path => action('open',path),
    close: async () => { const id=(await snapshot()).document.id; await action('close',id) },
    saveAs: path => action('saveAs',path),exportHtml: path => action('exportHtml',path),
    wait:waitFor,syntax,request,session})
  alpha3Cases.push(...longCode.cases)
  await writeFile(join(artifacts,'long-code-evidence.json'),JSON.stringify(longCode,null,2))
  await writeFile(join(artifacts,'technical-writing-evidence.json'),JSON.stringify(technical,null,2))
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ platform: process.platform, passed: true, cases: ['About version', 'unchanged mode cycles', 'byte-identical Save As', 'WYSIWYG edit', 'edited mode cycles', 'Save and reopen', 'three-diagram HTML export', 'Markdown table insertion', 'tab duplicate activation', 'contextual table commands', 'Save All', 'persistent Settings', 'fold byte preservation', 'Mermaid ERD preview/export', 'process restart draft recovery', 'dirty Close Cancel/Discard', 'fresh caret at start', 'content-aware navigation', 'sync-off independence', 'source/rendered search scope', 'Replace All undo and exact native Save', 'mapping-free HTML export', 'DOT unmatched fence rendered edit native save/reopen', 'DOT CR-only fence rendered edit native save/reopen', 'DOT oversized unmatched source recovers without codec stack failure', 'DOT starter in both editors, native Save As and single Undo', 'DOT prior-selection block correspondence', 'DOT aliases offline Preview/rendered nodes', 'DOT source-preserving tab/mode cycles', 'DOT static export', 'DOT actual worker response bytes, MIME and exact policy','DOT malformed/empty/resource/oversize/output-limit source-preserving failures','DOT actual worker timeout and recovery', ...alpha3Cases] }, null, 2))
  console.log(`Native application acceptance passed on ${process.platform}`)
} catch (error) {
  if (session) {
    const state = await snapshot().catch(() => null)
    if (state) await writeFile(join(artifacts, 'failure-state.json'), JSON.stringify({ document: state.document, config: state.config, error: state.error }, null, 2)).catch(() => {})
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
