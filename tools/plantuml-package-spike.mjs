// Probe the real executable extracted from a synthetic candidate DEB. No
// acceptance bridge is present; profile and fixture are temporary.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyNativeWorkerResponse } from './worker-response-acceptance.mjs'
import { samplePlantUmlProcessMemory } from './plantuml-memory-sample.mjs'

const binary = resolve(process.env.MARKWRITER_BINARY ?? '')
if (!process.env.MARKWRITER_BINARY) throw new Error('Set MARKWRITER_BINARY to the extracted candidate executable')
const temp = await mkdtemp(join(tmpdir(), 'mw-plantuml-package-'))
const profile = join(temp, 'profile'), fixture = join(temp, 'fixture.md')
await mkdir(profile)
const sequence = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
const klass = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
const bad = '@startuml\n!theme missing\n@enduml'
const source = '# Synthetic package fixture\n\n' + [sequence, klass, bad].map(s => '```plantuml\n' + s + '\n```\n').join('\n')
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
async function wait(fn, description) {
  let last
  for (const end=Date.now()+60000; Date.now()<end;) { try { const result=await fn(); if (result) return result } catch (error) { last=error }; await delay(100) }
  throw new Error(`${description}: ${last || 'timed out'}`)
}
try {
  await wait(async () => (await request('GET','/status')).ready, 'driver startup')
  const start=Date.now()
  session=(await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:wrapper}}}})).sessionId
  const run=(script,...args)=>request('POST',`/session/${session}/execute/sync`,{script,args})
  const policy=await verifyNativeWorkerResponse(request, session, resolve('frontend/dist/assets'), 'plantUml')
  await wait(()=>run(`return document.querySelectorAll('[data-active=true] .tiptap [data-type=plantuml] svg').length===2`),'WYSIWYG diagrams')
  const coldMs=Date.now()-start
  const w=await run(`return [...document.querySelectorAll('[data-active=true] .tiptap [data-type=plantuml]')].map(e=>({svg:!!e.querySelector('svg'),text:e.querySelector('svg')?.textContent??'',source:e.querySelector('pre')?.textContent??null}))`)
  assert.deepEqual(w.map(x=>x.svg),[true,true,false]); assert.equal(w[2].source.trim(),bad)
  for (const label of ['Alice','Bob','Request']) assert.ok(w[0].text.includes(label), `Missing sequence label ${label}`)
  for (const label of ['User','Order','id: int','owns']) assert.ok(w[1].text.includes(label), `Missing class label ${label}`)
  const warmStart=Date.now()
  await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  await wait(()=>run(`return document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml] svg').length===2`),'Preview diagrams')
  const warmMs=Date.now()-warmStart
  const p=await run(`return [...document.querySelectorAll('[data-active=true] .markwriter-preview [data-type=plantuml]')].map(e=>({svg:!!e.querySelector('svg'),text:e.querySelector('svg')?.textContent??'',source:e.querySelector('pre')?.textContent??null}))`)
  assert.deepEqual(p.map(x=>x.svg),[true,true,false]); assert.equal(p[2].source.trim(),bad)
  for (const label of ['Alice','Bob','Request']) assert.ok(p[0].text.includes(label), `Missing sequence label ${label}`)
  for (const label of ['User','Order','id: int','owns']) assert.ok(p[1].text.includes(label), `Missing class label ${label}`)
  assert.equal(await readFile(fixture,'utf8'),source)
  console.log(JSON.stringify({result:'pass', target:'Linux candidate DEB executable extracted, not installed', binary, coldMs, warmMs, memory:await memory.stop(), fixtureUnchanged:true, worker:policy},null,2))
} finally {
  await memory.stop()
  if (session) await request('DELETE',`/session/${session}`).catch(()=>{})
  try { process.kill(-driver.pid,'SIGTERM') } catch { /* already gone */ }
  await rm(temp,{recursive:true,force:true})
}
