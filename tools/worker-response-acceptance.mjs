import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const WORKER_POLICY="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'"

// A missing Tauri asset can fall back to index.html. Bind the response policy to
// the exact emitted JavaScript bytes, rather than trusting its requested URL.
export const MATH_WORKER_POLICY=WORKER_POLICY.replace(" 'wasm-unsafe-eval'", "")
export async function verifyNativeWorkerResponse(request,session,assets,kind='dot'){
  const names=(await readdir(assets)).filter(name=>new RegExp(kind==='regex'?'^regexSearch\\.worker-.*\\.js$':'^'+kind+'Worker-.*\\.js$').test(name))
  assert.equal(names.length,1,'Exactly one emitted worker required')
  const expected=createHash('sha256').update(await readFile(join(assets,names[0]))).digest('hex')
  const response=await request('POST',`/session/${session}/execute/async`,{
    script:`const done=arguments[arguments.length-1];fetch(arguments[0]).then(async r=>{
      const bytes=await r.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
      done({status:r.status,url:r.url,type:r.headers.get('content-type'),policy:r.headers.get('content-security-policy'),sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});
    }).catch(e=>done({error:String(e)}))`,args:['/assets/'+names[0]],
  })
  assert.equal(response.status,200,JSON.stringify(response))
  assert.match(response.type??'',/^(?:text|application)\/(?:java|ecma)script(?:;|$)/i)
  assert.equal(response.sha256,expected,'Native worker response must match packaged build bytes')
  assert.equal(response.policy,kind==='math'||kind==='regex'?MATH_WORKER_POLICY:WORKER_POLICY,'Exact narrowly scoped worker response policy required')
  return response
}
