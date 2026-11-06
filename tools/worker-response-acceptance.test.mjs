import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyNativeWorkerResponse, WORKER_POLICY, MATH_WORKER_POLICY } from './worker-response-acceptance.mjs'

test('native worker evidence rejects HTML fallback, stale bytes, wrong status and weakened policy', async () => {
  const assets=await mkdtemp(join(tmpdir(),'markwriter-worker-response-'))
  const body='self.postMessage({ready:true})',name='dotWorker-fixture.js'
  await writeFile(join(assets,name),body)
  const response={status:200,url:'tauri://localhost/assets/'+name,type:'text/javascript',policy:WORKER_POLICY,sha256:createHash('sha256').update(body).digest('hex')}
  assert.deepEqual(await verifyNativeWorkerResponse(async()=>response,'session',assets),response)
  for(const change of [{type:'text/html'},{sha256:'0'.repeat(64)},{status:404},{policy:WORKER_POLICY.replace("connect-src 'none'","connect-src *")}]){
    await assert.rejects(verifyNativeWorkerResponse(async()=>({...response,...change}),'session',assets))
  }
})

test('math worker evidence requires its exact bytes and policy without WASM', async () => {
  const assets=await mkdtemp(join(tmpdir(),'markwriter-math-response-'))
  const body='self.postMessage({ready:true})',name='mathWorker-fixture.js'
  await writeFile(join(assets,name),body)
  const response={status:200,type:'text/javascript',policy:MATH_WORKER_POLICY,sha256:createHash('sha256').update(body).digest('hex')}
  assert.deepEqual(await verifyNativeWorkerResponse(async()=>response,'session',assets,'math'),response)
  await assert.rejects(verifyNativeWorkerResponse(async()=>({...response,policy:WORKER_POLICY}),'session',assets,'math'))
})
