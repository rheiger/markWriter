// Probe the real executable extracted from a synthetic candidate DEB. No
// acceptance bridge is present; profile and fixture are temporary.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyReleaseAssets } from '../research/pi-2.22-release/runtime-assets.mjs'
import { samplePlantUmlProcessMemory } from './plantuml-memory-sample.mjs'

const binary = resolve(process.env.MARKWRITER_BINARY ?? '')
if (!process.env.MARKWRITER_BINARY) throw new Error('Set MARKWRITER_BINARY to the extracted candidate executable')
const temp = await mkdtemp(join(tmpdir(), 'mw-plantuml-package-'))
const profile = join(temp, 'profile'), fixture = join(temp, 'fixture.md')
const exported = join(tmpdir(), `mw-plantuml-export-${process.pid}.html`)
await mkdir(profile)
const sequence = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\nBob --> Alice: Response\n@enduml'
const klass = '@startuml\nclass User {\n -id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
const bad = '@startuml\n!theme missing\n@enduml'
const source = '# Synthetic package fixture\n\n' + [sequence, klass, bad].map(s => '```plantuml\n' + s + '\n```\n').join('\n') + '\n[ordinary link](https://example.com/)\n'
await writeFile(fixture, source)
const wrapper = join(temp, 'launch.sh')
await writeFile(wrapper, '#!/bin/sh\nexec "$MW_BINARY" "$MW_FIXTURE"\n', { mode:0o700 })
const driver = spawn(process.env.MARKWRITER_TAURI_DRIVER ?? 'tauri-driver', ['--port','24446','--native-port','24447'], { env:{ ...process.env, MARKWRITER_PROFILE_DIR:profile, MW_BINARY:binary, MW_FIXTURE:fixture }, stdio:'ignore', detached:true })
const memory = samplePlantUmlProcessMemory(binary)
let session
async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:24446${path}`, { method, headers:{'content-type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(60000) })
  const json = await response.json()
  if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json))
  return json.value
}
async function wait(fn, description, timeout=60000) {
  let last
  for (const end=Date.now()+timeout; Date.now()<end;) { try { const result=await fn(); if (result) return result } catch (error) { last=error }; await delay(100) }
  throw new Error(`${description}: ${last || 'timed out'}`)
}
try {
  await wait(async () => (await request('GET','/status')).ready, 'driver startup')
  const start=Date.now()
  session=(await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:wrapper}}}})).sessionId
  const run=(script,...args)=>request('POST',`/session/${session}/execute/sync`,{script,args})
  const manifest = JSON.parse(await readFile('candidate/ubuntu-26.04-x64.manifest.json', 'utf8'))
  const runtimeAssets = await verifyReleaseAssets(request, session, manifest)
  await wait(()=>run(`return document.querySelectorAll('[data-active=true] .tiptap [data-type=plantuml] svg').length===2`),'WYSIWYG diagrams')
  const coldMs=Date.now()-start
  const w=await run(`return [...document.querySelectorAll('[data-active=true] .tiptap [data-type=plantuml]')].map(e=>({svg:!!e.querySelector('svg'),text:e.querySelector('svg')?.textContent??'',source:e.querySelector('pre')?.textContent??null}))`)
  assert.deepEqual(w.map(x=>x.svg),[true,true,false]); assert.equal(w[2].source.trim(),bad)
  for (const label of ['Alice','Bob','Request','Response']) assert.ok(w[0].text.includes(label), `Missing sequence label ${label}`)
  for (const label of ['User','Order','id: int','owns']) assert.ok(w[1].text.includes(label), `Missing class label ${label}`)
  // Compare visible text and geometry across the two app views and the actual
  // saved HTML. Ignore editor decorations on the surrounding block.
  const describeDiagrams = `
    [...root.querySelectorAll('[data-type=plantuml] svg')].map(svg => ({
      viewBox: svg.getAttribute('viewBox'),
      shapes: [...svg.querySelectorAll('line,rect,polygon,path,circle,ellipse,text')].map(el => ({
        type: el.localName,
        attributes: [...el.attributes].map(attr => [attr.name,attr.value]).sort((a,b) => a[0].localeCompare(b[0])),
        text: el.textContent
      }))
    }))`.trim()
  const wysiwyg = await run("const root=document.querySelector('[data-active=true] .tiptap');return " + describeDiagrams)
  assert.ok(wysiwyg[0].shapes.filter(el=>el.type==='polygon').length>=2, 'Both message arrowheads')
  for (const label of ['User','Order','1','*','owns']) assert.ok(wysiwyg[1].shapes.some(el=>el.text===label), label)
  const warmStart=Date.now()
  await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  await wait(()=>run(`return document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml] svg').length===2`),'Preview diagrams')
  const warmMs=Date.now()-warmStart
  const preview = await run("const root=document.querySelector('[data-active=true] .markwriter-preview');return " + describeDiagrams)
  assert.deepEqual(preview, wysiwyg)
  const p=await run(`return [...document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml]')].map(e=>({svg:!!e.querySelector('svg'),text:e.querySelector('svg')?.textContent??'',source:e.querySelector('pre')?.textContent??null}))`)
  assert.deepEqual(p.map(x=>x.svg),[true,true,false]); assert.equal(p[2].source.trim(),bad)
  for (const label of ['Alice','Bob','Request','Response']) assert.ok(p[0].text.includes(label), `Missing sequence label ${label}`)
  for (const label of ['User','Order','id: int','owns']) assert.ok(p[1].text.includes(label), `Missing class label ${label}`)
  assert.equal(await readFile(fixture,'utf8'),source)
  await run(`Array.from(document.querySelectorAll('.menu-trigger')).find(b=>b.textContent.trim()==='File').click()`)
  await run(`Array.from(document.querySelectorAll('.menu-option')).find(b=>b.textContent.includes('Export as HTML')).click()`)
  execFileSync('python3', ['tools/plantuml-x11-export.py'], { env:{...process.env, MW_EXPORT_PATH:exported}, timeout:15000 })
  const html=await wait(async()=>readFile(exported,'utf8'),'native exported file',20000)
  const result=await run(`const d=new DOMParser().parseFromString(arguments[0],'text/html');return {svgs:d.querySelectorAll('[data-type=plantuml] svg').length,source:d.querySelector('[data-type=plantuml] pre')?.textContent??null,link:d.querySelector('a')?.getAttribute('href'),active:d.querySelectorAll('script,img,link[rel=stylesheet]').length}`,html)
  const saved = await run("const root=new DOMParser().parseFromString(arguments[0],'text/html');return " + describeDiagrams, html)
  assert.deepEqual(saved, wysiwyg)
  if (process.env.MARKWRITER_EXPORT_EVIDENCE) {
    await writeFile(process.env.MARKWRITER_EXPORT_EVIDENCE, html, {flag:'wx',mode:0o600})
  }
  assert.equal(result.svgs,2); assert.equal(result.source?.trim(),bad); assert.equal(result.link,'https://example.com/'); assert.equal(result.active,0)
  assert.equal(await readFile(fixture,'utf8'),source)
  console.log(JSON.stringify({result:'pass', target:'Ubuntu candidate installed from exact DEB', binary, coldMs, warmMs, memory:await memory.stop(), fixtureUnchanged:true, exportBytes:Buffer.byteLength(html), exportSha256:createHash('sha256').update(html).digest('hex'), renderedShapeCounts:saved.map(d=>d.shapes.length), shapeAndTextParity:true, export:'native application File → Export as HTML and GTK Save File dialog; two static SVGs, readable failure source, active ordinary link', ...runtimeAssets},null,2))
} finally {
  await memory.stop()
  if (session) await request('DELETE',`/session/${session}`).catch(()=>{})
  try { process.kill(-driver.pid,'SIGTERM') } catch { /* already gone */ }
  await rm(exported,{force:true})
  await rm(temp,{recursive:true,force:true})
}
