// Research harness for an isolated Linux native acceptance build. This uses
// the acceptance-only bridge and is not an installed-package or release test.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyNativeWorkerResponse } from './worker-response-acceptance.mjs'
import { samplePlantUmlProcessMemory } from './plantuml-memory-sample.mjs'
import { stopOwnedApplication } from './owned-process.mjs'

const binary = resolve(process.env.MARKWRITER_BINARY ?? 'src-tauri/target/debug/markwriter')
const temp = await mkdtemp(join(tmpdir(), 'mw-plantuml-native-'))
const profile = join(temp, 'profile'), fixture = join(temp, 'fixture.md'), exported = join(temp, 'export.html')
await mkdir(profile)
let hits = 0
const server = createServer((_req, res) => { hits++; res.setHeader('Access-Control-Allow-Origin', '*'); res.end('synthetic-canary') })
// The unchanged app CSP explicitly permits this loopback origin for Vite.
// Refuse to run if it is already in use; never stop an unrelated listener.
await new Promise((resolve, reject) => server.once('error', reject).listen(5173, '::1', resolve))
const port = server.address().port
const canaryBase = `http://localhost:${port}`
const sequence = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
const klass = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
const invalid = '@startuml\nclass {\n@enduml'
const remote = `@startuml\n!include ${canaryBase}/canary\n@enduml`
const local = `@startuml\n!include ${temp}/canary.puml\n@enduml`
const source = '# Synthetic PlantUML\n\n' + [sequence, klass, invalid, remote, local].map(s => '```plantuml\n' + s + '\n```\n').join('\n') + '\n[ordinary link](https://example.com/)\n'
await writeFile(fixture, source)
await writeFile(join(temp, 'canary.puml'), 'synthetic-private-canary')
const driver = spawn(process.env.MARKWRITER_TAURI_DRIVER ?? 'tauri-driver', ['--port', '24446', '--native-port', '24447'], { env: { ...process.env, MARKWRITER_PROFILE_DIR: profile }, stdio: 'ignore', detached: true })
const memory = samplePlantUmlProcessMemory(binary)
let session
async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:24446${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) })
  const json = await response.json()
  if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json))
  return json.value
}
async function wait(fn, description, timeout = 60000) {
  let last
  for (const end = Date.now() + timeout; Date.now() < end;) { try { const result = await fn(); if (result) return result } catch (error) { last = error }; await delay(100) }
  throw new Error(`${description}: ${last || 'timed out'}`)
}
try {
  await wait(async () => (await request('GET', '/status')).ready, 'driver startup')
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: binary } } } })
  session = created.sessionId
  const run = (script, ...args) => request('POST', `/session/${session}/execute/sync`, { script, args })
  const action = (name, ...args) => request('POST', `/session/${session}/execute/async`, {
    script: 'const done=arguments[arguments.length-1], [name,args]=arguments; Promise.resolve().then(()=>window.__MARKWRITER_ACCEPTANCE__[name](...args)).then(()=>done({ok:true}),e=>done({error:String(e)}))', args: [name, args],
  }).then(result => { assert.equal(result.ok, true, JSON.stringify(result)) })
  await wait(async () => (await run(`return window.__MARKWRITER_ACCEPTANCE__?.editorWindows() ?? []`)).some(w => w.label === 'main' && w.ready), 'native app ready')
  console.error('native app ready')
  const policy = await verifyNativeWorkerResponse(request, session, resolve('frontend/dist-acceptance/assets'), 'plantUml')
  console.error('worker response policy verified')
  const probe = await request('POST', `/session/${session}/execute/async`, {
    script: `const done=arguments[arguments.length-1], [url,network,local]=arguments;
      const worker=new Worker(url,{type:'module'}), timer=setTimeout(()=>{worker.terminate();done({error:'probe timed out'})},8000);
      worker.onerror=e=>{clearTimeout(timer);worker.terminate();done({error:String(e.message)})};
      worker.onmessage=e=>{if(e.data.ready)worker.postMessage({__MW_PLANTUML_SECURITY_PROBE__:{network,local,sameOrigin:url}});
        else if(e.data.__MW_PLANTUML_SECURITY_PROBE__){clearTimeout(timer);worker.terminate();done({results:e.data.__MW_PLANTUML_SECURITY_PROBE__})}};`,
    args: [policy.url, `${canaryBase}/blocked`, `file://${temp}/canary.puml`],
  })
  assert.deepEqual(probe.results, ['rejected', 'rejected', 'rejected'], JSON.stringify(probe))
  console.error('worker resource probes rejected')
  assert.equal(hits, 0, 'Worker CSP probe must not reach local HTTP server')
  const pageControl = await request('POST', `/session/${session}/execute/async`, {
    script: `const done=arguments[arguments.length-1], violations=[];
      addEventListener('securitypolicyviolation',e=>violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
      Promise.allSettled([fetch(arguments[0]),fetch(arguments[0],{mode:'no-cors'})]).then(results=>setTimeout(()=>done({
        origin:location.origin,protocol:location.protocol,secure:isSecureContext,violations,
        requests:results.map(r=>r.status==='fulfilled'?{status:r.status,type:r.value.type,httpStatus:r.value.status}:{status:r.status,failure:String(r.reason)})
      }),100))`,
    args: [`${canaryBase}/page-positive`],
  })
  pageControl.serverReceipts = hits
  hits = 0
  const start = Date.now()
  await action('open', fixture)
  console.error('synthetic fixture opened')
  await wait(() => run(`return document.querySelector('[data-active=true] .tiptap [data-type=plantuml]')`), 'WYSIWYG opens synthetic input')
  await wait(() => run(`return document.querySelectorAll('[data-active=true] .tiptap [data-type=plantuml] svg').length===2`), 'WYSIWYG renders sequence and class')
  const wysiwygMs = Date.now() - start
  console.error('WYSIWYG diagrams rendered')
  const w = await run(`return [...document.querySelectorAll('[data-active=true] .tiptap [data-type=plantuml]')].map(e=>({svg:!!e.querySelector('svg'),source:e.querySelector('pre')?.textContent??null}))`)
  assert.deepEqual(w.map(x => x.svg), [true, true, false, false, false])
  for (const [index, expected] of [[2, invalid], [3, remote], [4, local]]) assert.equal(w[index].source?.trim(), expected)
  await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  const previewStart = Date.now()
  await wait(() => run(`return document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml] svg').length===2`), 'Preview renders sequence and class')
  const previewMs = Date.now() - previewStart
  console.error('Preview diagrams rendered')
  const p = await run(`return [...document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml]')].map(e=>({svg:!!e.querySelector('svg'),source:e.querySelector('pre')?.textContent??null}))`)
  assert.deepEqual(p.map(x => x.svg), [true, true, false, false, false])
  for (const [index, expected] of [[2, invalid], [3, remote], [4, local]]) assert.equal(p[index].source?.trim(), expected)
  const state = await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document')
  assert.equal(state.content, source); assert.equal(state.isDirty, false)
  const exportStart = Date.now()
  await action('exportHtml', exported)
  const exportMs = Date.now() - exportStart
  const html = await readFile(exported, 'utf8')
  console.error('self-contained HTML exported')
  const output = await run(`const d=new DOMParser().parseFromString(arguments[0],'text/html');return {svgs:d.querySelectorAll('[data-type=plantuml] svg').length,source:[...d.querySelectorAll('[data-type=plantuml] pre')].map(e=>e.textContent),link:d.querySelector('a')?.getAttribute('href'),active:d.querySelectorAll('script,img,link[rel=stylesheet]').length}`, html)
  assert.equal(output.svgs, 2); assert.equal(output.active, 0); assert.equal(output.link, 'https://example.com/')
  assert.deepEqual(output.source.map(s => s.trim()), [invalid, remote, local])
  assert.equal(await readFile(fixture, 'utf8'), source)
  assert.equal(hits, 0, 'Unsupported document URL did not reach the canary server')
  const positive = await fetch(`${canaryBase}/positive`)
  assert.equal(await positive.text(), 'synthetic-canary'); assert.equal(hits, 1)
  const timeoutChart = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: MWTimeoutProbe\n@enduml'
  const timeoutFixture = join(temp, 'timeout.md'), nextFixture = join(temp, 'next.md')
  await writeFile(timeoutFixture, '```plantuml\n' + timeoutChart + '\n```\n')
  await writeFile(nextFixture, '```plantuml\n' + sequence + '\n```\n')
  const timeoutStart = Date.now()
  await action('open', timeoutFixture)
  console.error('controlled timeout fixture opened')
  await wait(async () => (await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document'))?.path === timeoutFixture, 'controlled timeout document selected')
  if (await run(`return document.querySelector('button[aria-label="Markdown mode"]').getAttribute('aria-checked')==='false'`)) await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  await wait(() => run(`const e=document.querySelector('[data-active=true] .markwriter-preview [data-type=plantuml]');return e?.textContent.includes('timed out') && e.querySelector('pre')?.textContent.includes('MWTimeoutProbe')`), 'controlled timeout shows source fallback', 15000)
  const timeoutMs = Date.now() - timeoutStart
  console.error('controlled timeout fallback displayed')
  assert.ok(timeoutMs >= 4000 && timeoutMs < 15000, `Controlled timeout took ${timeoutMs} ms`)
  await action('open', nextFixture)
  await wait(async () => (await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document'))?.path === nextFixture, 'post-timeout document selected')
  if (await run(`return document.querySelector('button[aria-label="Markdown mode"]').getAttribute('aria-checked')==='false'`)) await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  await wait(() => run(`return !!document.querySelector('[data-active=true] .markwriter-preview [data-type=plantuml] svg')`), 'post-timeout preview succeeds')
  console.error('post-timeout preview rendered')
  const hostile = [
    '@startuml\n!theme missing\n@enduml',
    `@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: <img:${canaryBase}/image>\n@enduml`,
    '@startuml\n' + 'a'.repeat(8193) + '\n@enduml',
  ]
  const hostileFixture = join(temp, 'hostile.md')
  await writeFile(hostileFixture, hostile.map(item => '```plantuml\n' + item + '\n```\n').join('\n'))
  await action('open', hostileFixture)
  await wait(async () => (await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document'))?.path === hostileFixture, 'hostile synthetic document selected')
  if (await run(`return document.querySelector('button[aria-label="Markdown mode"]').getAttribute('aria-checked')==='false'`)) await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  const hostileSource = await wait(() => run(`const e=[...document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml]')];return e.length===3&&e.every(n=>n.querySelector('pre'))?e.map(n=>n.querySelector('pre').textContent):null`), 'missing theme, external image and oversized source fallback')
  assert.deepEqual(hostileSource.map(text => text.trim()), hostile)
  assert.equal(hits, 1, 'Document image and resource directives must not reach the server')
  console.error('hostile and oversized source preserved')
  await action('activate', state.id)
  await wait(async () => (await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document'))?.id === state.id, 'original synthetic document activated')
  if (await run(`return document.querySelector('button[aria-label="Markdown mode"]').getAttribute('aria-checked')==='false'`)) await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  await wait(() => run(`const e=document.querySelector('[data-active=true] .cm-content');return !!e && e.getBoundingClientRect().height>0`), 'original source editor visible')
  // Dirty only the isolated synthetic fixture's editor buffer, verify Undo,
  // checkpoint it, and kill/restart only the app owned by this test driver.
  const edit = async () => {
    const element = await request('POST', `/session/${session}/element`, { using:'css selector', value:'[data-active=true] .cm-content' })
    await request('POST', `/session/${session}/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {})
    await action('selectSource', source.length)
    await request('POST', `/session/${session}/actions`, { actions:[{ type:'key', id:'synthetic-keyboard', actions:[... 'RecoveryMarker'].flatMap(value => [{type:'keyDown',value},{type:'keyUp',value}]) }] })
    try {
      await wait(async () => (await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document'))?.content === source + 'RecoveryMarker', 'dirty synthetic edit', 12000)
    } catch (error) {
      const actual = await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document')
      throw new Error(`${error}; path=${actual?.path}; length=${actual?.content?.length}; suffix=${JSON.stringify(actual?.content?.slice(-80))}`)
    }
  }
  await edit()
  console.error('synthetic recovery edit made')
  await run(`Array.from(document.querySelectorAll('.menu-trigger')).find(b=>b.textContent.trim()==='Edit').click()`)
  await run(`Array.from(document.querySelectorAll('.menu-option')).find(b=>b.textContent.trim().startsWith('Undo')).click()`)
  await wait(async () => (await run('return window.__MARKWRITER_ACCEPTANCE__.snapshot().document'))?.content === source, 'Undo restores canonical source')
  await edit()
  await action('checkpointForRestart')
  console.error('synthetic recovery checkpoint captured')
  assert.equal(await readFile(fixture, 'utf8'), source)
  await stopOwnedApplication(driver.pid, binary)
  await request('DELETE', `/session/${session}`).catch(() => {})
  session = (await request('POST', '/session', { capabilities:{ alwaysMatch:{ 'tauri:options':{ application:binary } } } })).sessionId
  const recovered = await wait(async () => {
    const docs = await run('return window.__MARKWRITER_ACCEPTANCE__?.snapshot().documents ?? []')
    return docs.find(doc => doc.path === fixture && doc.isDirty && doc.content === source + 'RecoveryMarker')
  }, 'synthetic draft recovered')
  assert.ok(recovered)
  console.log(JSON.stringify({ result:'pass', target:'Linux WebKitGTK native acceptance build, not installed package', binary, timingsMs:{wysiwygMs,previewMs,exportMs,timeoutMs}, memory:await memory.stop(), exportBytes:Buffer.byteLength(html), worker:policy, fixtureUnchanged:true, undoAndRecovery:'isolated synthetic buffer', controlledTimeout:'one acceptance-only synchronous worker delay; fallback displayed, next preview succeeded', pageControl, resourceCanary:'acceptance-instrumented worker HTTP, file and same-origin asset fetch rejected; same-origin application page and OS-level HTTP positive controls passed; document includes rejected by validation. A failed app page HTTP control limits attribution of HTTP denial to worker CSP.' }, null, 2))
} finally {
  await memory.stop()
  if (session) await request('DELETE', `/session/${session}`).catch(() => {})
  try { process.kill(-driver.pid, 'SIGTERM') } catch { /* already gone */ }
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive:true, force:true })
}
