// Runs the installed, ordinary release executable. No acceptance bridge/imports.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { stopOwnedApplication, processInventory, ownedDescendants } from './owned-process.mjs'
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
const root=resolve(import.meta.dirname,'..'), artifacts=join(root,'package-acceptance-results')
const fixture=await mkdtemp(join(tmpdir(),'markwriter-installed-'))
const profile=process.env.MARKWRITER_PROFILE_DIR
assert.ok(profile && resolve(profile)===profile,'Explicit isolated production profile required')
await mkdir(artifacts,{recursive:true}); await mkdir(profile,{recursive:true})
const binary=process.env.MARKWRITER_BINARY; assert.ok(binary,'Installed binary path required')
const source='# Installed package\n\nA paragraph with **same** and a [link](https://example.invalid).\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n```dot\ndigraph {rankdir=LR; a [label=" a ",shape=box]; a -> b}\n```\n\n~~~~graphviz\ndigraph { offline -> ready }\n~~~~\n\n| Key | Value |\n| --- | --- |\n| one | two |\n'
const original=join(fixture,'original.md'), saved=join(fixture,'saved.md'), exported=join(fixture,'export.html')
await writeFile(original,source)
const driver=spawn(join(homedir(),'.cargo','bin',`tauri-driver${process.platform==='win32'?'.exe':''}`),['--port','4444','--native-port','4445',...(process.env.MARKWRITER_NATIVE_DRIVER?['--native-driver',process.env.MARKWRITER_NATIVE_DRIVER]:[])],{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'})
let log='',session,launchError;driver.on('error',e=>launchError=e)
for(const stream of [driver.stdout,driver.stderr])stream.on('data',c=>log=(log+c).slice(-30000))
async function request(method,path,body){const r=await fetch('http://127.0.0.1:4444'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const v=await r.json();if(!r.ok||v.value?.error)throw new Error(JSON.stringify(v));return v.value}
const run=(script,...args)=>request('POST',`/session/${session}/execute/sync`,{script,args})
async function wait(check,name,timeout=30000){const end=Date.now()+timeout;let error;while(Date.now()<end){if(launchError)throw launchError;try{const v=await check();if(v)return v}catch(e){error=e}await delay(100)}throw new Error('Timed out: '+name+(error?': '+error:''))}
async function click(xpath){const e=await request('POST',`/session/${session}/element`,{using:'xpath',value:xpath});await request('POST',`/session/${session}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/click`,{})}
async function menu(name,option){await click(`//button[normalize-space(.)="${name}"]`);await click(`//button[normalize-space(.)="${option}" or .//span[normalize-space(.)="${option}"]]`)}
async function dialog(path){await new Promise((res,rej)=>{const p=spawn(process.platform==='win32'?'pwsh':'bash',process.platform==='win32'?['-NoProfile','-File',join(root,'tools/package-dialog-windows.ps1'),'-Path',path]:[join(root,'tools/package-dialog-linux.sh'),path],{stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',c=>text+=c);p.stderr.on('data',c=>text+=c);p.on('error',rej);p.on('exit',code=>code===0?res():rej(new Error('OS dialog automation failed: '+text)))})}
async function mode(markdown){const current=await run(`return document.querySelector('button[role=switch]').getAttribute('aria-checked')==='true'`);if(current!==markdown)await click('//button[@role="switch"]');await wait(()=>run(`const e=document.querySelector(arguments[0]);return !!e&&e.getBoundingClientRect().height>0`,markdown?'[data-active=true] .cm-content':'[data-active=true] .tiptap'),'editor mode')}
async function diagrams(){await wait(()=>run('return document.querySelectorAll("[data-active=true] .markwriter-preview svg").length===3'),'offline Mermaid and DOT Preview')}
async function launch(){session=(await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:binary}}}})).sessionId;await request('POST',`/session/${session}/timeouts`,{script:30000});await wait(()=>run('return !!document.querySelector("button[role=switch]")'),'production startup');assert.equal(await run('return typeof window.__MARKWRITER_ACCEPTANCE__'),'undefined','No bridge in installed package')}
const cases=[]
let actualWebviewPaths=[],workerPolicy
try{
 await wait(async()=>(await request('GET','/status')).ready,'driver');await launch()
 if(process.platform==='win32'){
   const rows=ownedDescendants(await processInventory(),driver.pid)
   actualWebviewPaths=[...new Set(rows.filter(p=>p.path?.toLowerCase().endsWith('msedgewebview2.exe')).map(p=>p.path))]
   assert.ok(actualWebviewPaths.length,'Actual launched WebView process must be observed')
   assert.ok(actualWebviewPaths.every(p=>p.toLowerCase()===process.env.MARKWRITER_WEBVIEW_RUNTIME?.toLowerCase()),'Actual WebView must match driver baseline and firewall restriction')
 }
 await menu('Help','About MarkWriter');const version=JSON.parse(await readFile(join(root,'frontend/package.json'),'utf8')).version
 assert.ok(await run('return document.querySelector("dialog[open]").textContent.includes(arguments[0])','Version '+version));assert.ok(await run(`return document.querySelector('dialog[open]').textContent.includes("This program was completely built using vibe coding under the direction of 'Richie'.")`));await click('//dialog//button[normalize-space(.)="Close"]');cases.push('installed native/bundled About and credit')
 await menu('File','Open...');await dialog(original);await wait(()=>run('return document.querySelector("[role=tab][aria-selected=true]")?.textContent.includes("original.md")'),'native document after OS Open');await mode(true);await diagrams();cases.push('ordinary OS Open dialog and offline diagrams')
 const workerName=(await readdir(join(root,'frontend/dist/assets'))).find(name=>/^dotWorker-.*\.js$/.test(name));assert.ok(workerName)
 workerPolicy=await request('POST',`/session/${session}/execute/async`,{script:`const done=arguments[arguments.length-1];fetch(arguments[0]).then(r=>done({status:r.status,url:r.url,policy:r.headers.get('content-security-policy')})).catch(e=>done({error:String(e)}))`,args:['/assets/'+workerName]})
 assert.ok(workerPolicy.policy?.includes("script-src 'self' 'wasm-unsafe-eval'") && workerPolicy.policy.includes("connect-src 'none'"),JSON.stringify(workerPolicy));cases.push('installed production worker response CSP')
 for(let i=0;i<3;i++){await mode(false);await wait(()=>run('return document.querySelectorAll("[data-active=true] .tiptap [data-type=dot] svg").length===2'),'opaque DOT nodes');await mode(true);await diagrams()}
 await menu('File','Save As...');await dialog(saved);await wait(async()=>await readFile(saved,'utf8').catch(()=>null)===source,'byte-identical ordinary Save As');cases.push('mode cycles and exact native Save As')
 await menu('Edit','Replace...');await wait(()=>run('return !!document.querySelector("[role=search]")'),'source Find')
 // Exercise actual controlled inputs; replace source once, then undo as one operation.
 await run(`for(const [index,text] of [[0,'same'],[1,'changed']]){const e=document.querySelectorAll('[role=search] textarea')[index];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}))}`)
 await wait(()=>run('return document.querySelector("[role=search] output").textContent.includes("1 match")'),'source search result');await click('//button[normalize-space(.)="Replace All"]');await click('//button[normalize-space(.)="Close Find"]');await menu('File','Save');await wait(async()=>await readFile(saved,'utf8')===source.replace('same','changed'),'native changed revision save');await menu('Edit','Undo');await menu('File','Save');await wait(async()=>await readFile(saved,'utf8')===source,'native Undo save');cases.push('source Find Replace All saved change then one Undo saved restoration')
 await mode(false);await menu('Edit','Find...');await wait(()=>run('return document.querySelector("[role=search] output").textContent.includes("1 match")'),'rendered Find');await click('//button[normalize-space(.)="Close Find"]');cases.push('rendered Find')
 await menu('File','Export as HTML...');await dialog(exported);await wait(async()=>!!(await readFile(exported,'utf8').catch(()=>null)),'ordinary Export dialog');const html=await readFile(exported,'utf8');assert.equal((html.match(/<svg\b/g)??[]).length,3);assert.ok(!/<script|data-mw-|data-chart|data-source-fence|javascript:/.test(html));cases.push('ordinary OS Export dialog and static sanitized SVG')
 await menu('File','Settings…');await run(`for(const [name,value] of [['Source text size','18'],['Rendered text size','24']]){const label=[...document.querySelectorAll('dialog label')].find(e=>e.textContent.startsWith(name));const select=label.querySelector('select');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))}`);await click('//dialog//button[normalize-space(.)="Apply"]');await wait(async()=>JSON.parse(await readFile(join(profile,'preferences.json'),'utf8')).config.renderedFontSize===24,'native preferences file');cases.push('independent font Settings persistence')
 const draftSource='# Interrupted DOT draft\n\n```dot\ndigraph { recovered -> ready }\n```\n'
 await menu('File','New');await mode(true);await run(`const e=document.querySelector('[data-active=true] .cm-content');e.focus();document.execCommand('insertText',false,arguments[0])`,draftSource)
 const recovery=await wait(async()=>{const data=JSON.parse(await readFile(join(profile,'workspace.json'),'utf8'));return data.documents.find(d=>d.content.includes('Interrupted DOT draft'))},'flushed draft recovery');assert.equal(recovery.content,draftSource,'Real multiline DOT draft persisted exactly')
 const shot=await request('GET',`/session/${session}/screenshot`).catch(()=>null);if(shot)await writeFile(join(artifacts,'installed.png'),Buffer.from(shot,'base64'))
 // Abruptly end only the installed test process after its real recovery snapshot exists.
 await stopOwnedApplication(driver.pid,binary)
 await request('DELETE',`/session/${session}`).catch(()=>{});session=undefined;await launch();await wait(()=>run('return document.body.textContent.includes("Interrupted DOT draft")'),'draft restored in ordinary UI');await mode(true);await wait(()=>run('return !!document.querySelector("[data-active=true] .markwriter-preview [data-type=dot] svg")'),'recovered offline DOT');assert.equal(JSON.parse(await readFile(join(profile,'preferences.json'),'utf8')).config.renderedFontSize,24);cases.push('tabs, abrupt restart, actual draft/Settings recovery')
 await writeFile(join(artifacts,'result.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,binary,version,source:process.env.GITHUB_SHA??null,profile,cases,actualWebviewPaths,workerPolicy,recoverySource:recovery.content,os:process.env.ImageOS??null,imageVersion:process.env.ImageVersion??null},null,2))
 console.log('Installed package accepted:',cases.length,'cases')
}catch(error){if(session){const alert=await request('GET',`/session/${session}/alert/text`).catch(()=>null);if(alert)await writeFile(join(artifacts,'native-alert.json'),JSON.stringify({alert},null,2));const html=await request('GET',`/session/${session}/source`).catch(()=>null);if(html)await writeFile(join(artifacts,'failure.html'),html);const shot=await request('GET',`/session/${session}/screenshot`).catch(()=>null);if(shot)await writeFile(join(artifacts,'failure.png'),Buffer.from(shot,'base64'))}throw error}
finally{if(session)await request('DELETE',`/session/${session}`).catch(()=>{});if(driver.pid){try{if(process.platform==='win32')driver.kill();else process.kill(-driver.pid,'SIGTERM')}catch{}}driver.stdout.destroy();driver.stderr.destroy();await writeFile(join(artifacts,'driver.log'),log)}
