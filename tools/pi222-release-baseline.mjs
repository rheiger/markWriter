// Research-only release package probe. Run under xvfb-run with MW_BINARY
// pointing to the executable extracted from the verified v2.21.1 DEB.
// No acceptance bridge or product modification is used.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const binary = process.env.MW_BINARY
if (!binary?.startsWith('/')) throw new Error('MW_BINARY must be an absolute path')
const temp = await mkdtemp(join(tmpdir(), 'mw-pi222-release-'))
const profile = join(temp, 'profile'), fixture = join(temp, 'synthetic.md')
await mkdir(profile)
const source = '# PI 2.22 synthetic fixture\n\n```plantuml\n@startuml\nAlice -> Bob : synthetic request\n@enduml\n```\n'
await writeFile(fixture, source)
const wrapper = join(temp, 'launch.sh')
await writeFile(wrapper, '#!/bin/sh\nexec "$MW_BINARY" "$MW_FIXTURE"\n', { mode: 0o700 })
const driver = spawn(process.env.MW_DRIVER || 'tauri-driver', ['--port', '24444', '--native-port', '24445'], {
  env: { ...process.env, MARKWRITER_PROFILE_DIR: profile, MW_FIXTURE: fixture }, stdio: 'ignore', detached: true,
})
let session
async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:24444${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  const json = await response.json()
  if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json))
  return json.value
}
async function wait(fn, description) {
  let last
  for (let i = 0; i < 150; i++) { try { const result = await fn(); if (result) return result } catch (error) { last = error }; await delay(200) }
  throw new Error(`${description}: ${last || 'timed out'}`)
}
try {
  await wait(async () => (await request('GET', '/status')).ready, 'driver startup')
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: wrapper } } } })
  session = created.sessionId
  const run = (script, ...args) => request('POST', `/session/${session}/execute/sync`, { script, args })
  await wait(() => run(`return document.querySelector('[data-active=true] .tiptap')?.textContent.includes('synthetic request')`), 'synthetic fixture opened')
  await run(`document.querySelector('button[aria-label="Markdown mode"]').click()`)
  const actual = await wait(() => run(`return [...document.querySelectorAll('.markwriter-preview pre code')].map(e=>e.textContent).find(t=>t.includes('synthetic request'))`), 'synthetic source shown in packaged preview')
  assert.equal(actual, '@startuml\nAlice -> Bob : synthetic request\n@enduml\n')
  assert.equal(await run('return document.querySelectorAll(".markwriter-preview svg").length'), 0)
  assert.equal(await readFile(fixture, 'utf8'), source)
  console.log(JSON.stringify({ result: 'pass', executable: binary, context: 'v2.21.1 release DEB extracted, not installed; Linux Xvfb WebDriver', profile: 'temporary', observed: 'Preview retains synthetic PlantUML as ordinary code; no diagram SVG', fixtureUnchanged: true }))
} finally {
  if (session) await request('DELETE', `/session/${session}`).catch(() => {})
  try { process.kill(-driver.pid, 'SIGTERM') } catch { /* already gone */ }
  await rm(temp, { recursive: true, force: true })
}
