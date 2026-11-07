import { verifyUpdateCheck } from './update-check-acceptance.mjs'
import { verifyRegex } from './regex-acceptance.mjs'
// Runs the installed, ordinary release executable. No acceptance bridge/imports.
import { verifyTechnicalWriting } from './technical-writing-acceptance.mjs'
import { verifyLongCode } from './long-code-acceptance.mjs'
import assert from 'node:assert/strict'
import { codeFixtureCases } from './code-fixtures.mjs'
import { spawn } from 'node:child_process'
import { stopOwnedApplication, processInventory, ownedDescendants } from './owned-process.mjs'
import { verifyNativeWorkerResponse } from './worker-response-acceptance.mjs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
async function closeMenu(){
 // Exercise outside-click dismissal using real pointer input at a viewport
 // edge; the overlay center can overlap the dropdown at 800px.
 const point=await run('return {x:innerWidth-8,y:innerHeight-8}')
 await request('POST',`/session/${session}/actions`,{actions:[{type:'pointer',id:'menu-dismiss',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:point.x,y:point.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]})
 await wait(()=>run('return !document.querySelector(".menu-overlay,.menu-dropdown")'),'ordinary menu dismissed by outside click')
}
async function menu(name,option){await click(`//button[normalize-space(.)="${name}"]`);await click(`//button[normalize-space(.)="${option}" or .//span[normalize-space(.)="${option}"]]`)}
async function newDocument(){
 const previous=await run('return document.querySelector("[data-active=true]")?.getAttribute("data-document-id")')
 await menu('File','New')
 await wait(()=>run('const id=document.querySelector("[data-active=true]")?.getAttribute("data-document-id");return !!id&&id!==arguments[0]',previous),'new native document visible before editor interaction')
}
async function dialog(path){await new Promise((res,rej)=>{const p=spawn(process.platform==='win32'?'pwsh':'bash',process.platform==='win32'?['-NoProfile','-File',join(root,'tools/package-dialog-windows.ps1'),'-Path',path]:[join(root,'tools/package-dialog-linux.sh'),path],{stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',c=>text+=c);p.stderr.on('data',c=>text+=c);p.on('error',rej);p.on('exit',code=>code===0?res():rej(new Error('OS dialog automation failed: '+text)))})}
async function mode(markdown){
 // A new tab's editor commits before its passive mode notification updates the
 // shared toolbar. Observe both surfaces settled before deciding to toggle.
 await wait(()=>run(`const s=document.querySelector('button[role=switch]'),a=document.querySelector('[data-active=true]');if(!s||!a)return false;const m=s.getAttribute('aria-checked')==='true',e=a.querySelector(m?'.cm-content':'.tiptap');return !!e&&e.getBoundingClientRect().height>0`),'active editor and toolbar mode agree')
 const current=await run(`return document.querySelector('button[role=switch]').getAttribute('aria-checked')==='true'`)
 if(current!==markdown)await click('//button[@role="switch"]')
 await wait(()=>run(`const s=document.querySelector('button[role=switch]'),e=document.querySelector(arguments[0]);return s.getAttribute('aria-checked')===String(arguments[1])&&!!e&&e.getBoundingClientRect().height>0`,markdown?'[data-active=true] .cm-content':'[data-active=true] .tiptap',markdown),'editor mode')
}
async function diagrams(){await wait(()=>run('return document.querySelectorAll("[data-active=true] .markwriter-preview svg").length===3'),'offline Mermaid and DOT Preview')}
async function openDocument(path,title){
 await menu('File','Open...');await dialog(path)
 await wait(()=>run('return document.querySelector("[role=tab][aria-selected=true]")?.textContent.includes(arguments[0])',title),'ordinary OS Open '+title)
}
async function closeCurrentDocument(){
 const id=await run('return document.querySelector("[data-active=true]")?.getAttribute("data-document-id")')
 await menu('File','Close Tab')
 await wait(()=>run('return document.querySelector("[data-active=true]")?.getAttribute("data-document-id")!==arguments[0]',id),'view-only code tab closes cleanly')
}
async function codePresentation(code,highlighted,markdown,label){
 await mode(markdown)
 await wait(()=>run(`const active=document.querySelector('[data-active=true]'),text=active?.querySelector(arguments[2]?' .markwriter-preview pre code':' .tiptap pre code'),editor=active?.querySelector(arguments[2]?'.cm-content':'.tiptap pre code');return !!text&&!!editor&&text.textContent.replace(/\\n$/,'')===arguments[0]&&!!text.querySelector('[class*=hljs-]')===arguments[1]&&!!editor.querySelector('[class*=hljs-]')===arguments[1]`,code,highlighted,markdown),label)
 assert.equal(await run('return typeof window.__codeExecuted'),'undefined','Highlighted escaped code must remain inert')
}
async function syntaxHighlighting(enabled,surface){
 const current=await run('return document.querySelector("button[aria-label=\\"Syntax highlighting\\"]").getAttribute("aria-pressed")==="true"')
 if(current!==enabled){if(surface==='menu')await menu('View','Syntax highlighting');else await click('//button[@aria-label="Syntax highlighting"]')}
 await wait(()=>run('return document.querySelector("button[aria-label=\\"Syntax highlighting\\"]").getAttribute("aria-pressed")===String(arguments[0])',enabled),'ordinary syntax toolbar preference')
 await click('//button[normalize-space(.)="View"]')
 assert.equal(await run('return document.querySelector("button[role=menuitemcheckbox]").getAttribute("aria-checked")'),String(enabled),'View and toolbar syntax controls agree')
 await closeMenu()
}
async function themeChoice(name){
 await menu('View',name)
 await wait(()=>run('return (document.documentElement.getAttribute("data-theme")||"system")===arguments[0]',name==='Auto'?'system':name.toLowerCase()),'ordinary '+name+' theme')
 await click('//button[normalize-space(.)="View"]')
 assert.deepEqual(await run('return [...document.querySelectorAll("button[role=menuitemradio][aria-checked=true]")].map(e=>e.querySelector("span").textContent)'),[name],'Exclusive theme menu selection')
 await closeMenu()
 const style=await run(`const toolbar=document.querySelector('.toolbar'),s=getComputedStyle(toolbar),dark=arguments[0]==='Dark'||arguments[0]==='Auto'&&matchMedia('(prefers-color-scheme: dark)').matches;return {theme:arguments[0],dark,background:s.backgroundColor,expectedBackground:dark?'rgb(45, 45, 45)':'rgb(248, 249, 250)',text:s.color,expectedText:dark?'rgb(255, 255, 255)':'rgb(33, 37, 41)',fontBackground:getComputedStyle(toolbar.querySelector('select')).backgroundColor,expectedFontBackground:dark?'rgb(26, 26, 26)':'rgb(255, 255, 255)'}`,name)
 assert.equal(style.background,style.expectedBackground,'Toolbar follows '+name+' theme')
 assert.equal(style.text,style.expectedText,'Toolbar text follows '+name+' theme')
 assert.equal(style.fontBackground,style.expectedFontBackground,'Toolbar font picker follows '+name+' theme')
 return style
}
async function launch(){session=(await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:binary}}}})).sessionId;await request('POST',`/session/${session}/timeouts`,{script:30000});await wait(()=>run('return !!document.querySelector("button[role=switch]")'),'production startup');assert.equal(await run('return typeof window.__MARKWRITER_ACCEPTANCE__'),'undefined','No bridge in installed package')}
const cases=[]
const alpha3CodeCases=[],alpha3Themes=[]
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
 workerPolicy=await verifyNativeWorkerResponse(request,session,join(root,'frontend/dist/assets'));cases.push('installed production worker response bytes, MIME and exact CSP')
 await run(`const text=document.querySelector('[data-active=true] .markwriter-preview [data-mw-text]').firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,3);getSelection().removeAllRanges();getSelection().addRange(range)`)
 await click('(//*[@data-active="true"]//*[@data-type="dot"]/*[local-name()="svg"])[1]');await wait(()=>run(`return document.querySelector('[data-active=true] .markwriter-preview [data-type=dot]')?.closest('[data-mw-block]')?.classList.contains('correspondence-block')`),'DOT click selects source block after prior Preview text selection');cases.push('DOT Preview source correspondence after native text selection')
 for(let i=0;i<3;i++){await mode(false);await wait(()=>run('return document.querySelectorAll("[data-active=true] .tiptap [data-type=dot] svg").length===2'),'opaque DOT nodes');await mode(true);await diagrams()}
 await menu('File','Save As...');await dialog(saved);await wait(async()=>await readFile(saved,'utf8').catch(()=>null)===source,'byte-identical ordinary Save As');cases.push('mode cycles and exact native Save As')
 await menu('Edit','Replace...');await wait(()=>run('return !!document.querySelector("[role=search]")'),'source Find')
 // Exercise actual controlled inputs; replace source once, then undo as one operation.
 await run(`for(const [index,text] of [[0,'same'],[1,'changed']]){const e=document.querySelectorAll('[role=search] textarea')[index];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}))}`)
 await wait(()=>run('return document.querySelector("[role=search] output").textContent.includes("1 match")'),'source search result');await click('//button[normalize-space(.)="Replace All"]');await click('//button[normalize-space(.)="Close Find"]');await menu('File','Save');await wait(async()=>await readFile(saved,'utf8')===source.replace('same','changed'),'native changed revision save');await menu('Edit','Undo');await menu('File','Save');await wait(async()=>await readFile(saved,'utf8')===source,'native Undo save');cases.push('source Find Replace All saved change then one Undo saved restoration')
 await mode(false);await menu('Edit','Find...');await wait(()=>run('return document.querySelector("[role=search] output").textContent.includes("1 match")'),'rendered Find');await click('//button[normalize-space(.)="Close Find"]');cases.push('rendered Find')
 await menu('File','Export as HTML...');await dialog(exported);await wait(async()=>!!(await readFile(exported,'utf8').catch(()=>null)),'ordinary Export dialog');const html=await readFile(exported,'utf8');assert.equal((html.match(/<svg\b/g)??[]).length,3);assert.ok(!/<script|data-mw-|data-chart|data-source-fence|javascript:/.test(html));cases.push('ordinary OS Export dialog and static sanitized SVG')
 // Real OS Open on each small block avoids CodeMirror viewport virtualization
 // hiding later languages. No test bridge, editor commands or store calls.
 const syntaxSource=await readFile(join(root,'tools/fixtures/code-highlighting-alpha3.md'),'utf8')
 const syntaxBlocks=codeFixtureCases(syntaxSource)
 assert.equal(syntaxBlocks.length,26,'All requested language/alias/plain/detection fixture cases')
 await syntaxHighlighting(true,'toolbar')
 for(const [index,block] of syntaxBlocks.entries()){
  const info=block[1],code=block[2],highlighted=!['plaintext','unknown'].includes(info)&&!(info===''&&code==='x = 1')
  const title=`code-case-${String(index+1).padStart(2,'0')}.md`,path=join(fixture,title)
  await writeFile(path,block[0]+'\n');await openDocument(path,title)
  await codePresentation(code,highlighted,true,'installed source/Preview '+(info||'automatic')+' case '+(index+1))
  await codePresentation(code,highlighted,false,'installed rendered '+(info||'automatic')+' case '+(index+1))
  alpha3CodeCases.push({index:index+1,info,highlighted,source:true,preview:true,rendered:true})
  await closeCurrentDocument()
 }
 cases.push('ordinary OS Open of26 code fixtures,19 language variants, aliases/plain/unknown/detection, both editors and Preview')
 const syntaxOriginal=join(fixture,'syntax-original.md'),syntaxCycled=join(fixture,'syntax-view-cycles.md')
 await writeFile(syntaxOriginal,syntaxSource);await openDocument(syntaxOriginal,'syntax-original.md');await mode(true)
 await wait(()=>run('return !!document.querySelector("[data-active=true] .cm-content [class*=hljs-]")'),'highlighted installed source')
 await syntaxHighlighting(false,'toolbar')
 await wait(()=>run('return !document.querySelector("[data-active=true] .cm-content [class*=hljs-],[data-active=true] .markwriter-preview [class*=hljs-]")'),'toolbar disables source and Preview syntax')
 await mode(false);await wait(()=>run('return !document.querySelector("[data-active=true] .tiptap [class*=hljs-]")'),'toolbar disables rendered syntax')
 await syntaxHighlighting(true,'menu');await wait(()=>run('return !!document.querySelector("[data-active=true] .tiptap [class*=hljs-]")'),'View menu enables rendered syntax')
 for(const markdown of [true,false]){
  await mode(markdown)
  for(const name of ['Light','Dark','Auto'])alpha3Themes.push({mode:markdown?'markdown':'wysiwyg',...await themeChoice(name)})
 }
 const syntaxShot=await request('GET',`/session/${session}/screenshot`);await writeFile(join(artifacts,'alpha3-code-theme.png'),Buffer.from(syntaxShot,'base64'))
 await themeChoice('Dark');await syntaxHighlighting(false,'menu');await mode(true)
 await menu('File','Save As...');await dialog(syntaxCycled);await wait(async()=>await readFile(syntaxCycled,'utf8').catch(()=>null)===syntaxSource,'fresh Save As after syntax/theme/mode cycles preserves all fixture bytes')
 await wait(async()=>{const c=JSON.parse(await readFile(join(profile,'preferences.json'),'utf8')).config;return c.syntaxHighlighting===false&&c.theme==='dark'},'native syntax and theme preference persistence')
 await closeCurrentDocument()
 cases.push('toolbar/View syntax synchronization and Auto/Light/Dark toolbar themes in both modes with exact fresh Save As')
 await menu('File','Settings…');await run(`for(const [name,value] of [['Source text size','18'],['Rendered text size','24']]){const label=[...document.querySelectorAll('dialog label')].find(e=>e.textContent.startsWith(name));const select=label.querySelector('select');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))}`);await click('//dialog//button[normalize-space(.)="Apply"]');await wait(async()=>JSON.parse(await readFile(join(profile,'preferences.json'),'utf8')).config.renderedFontSize===24,'native preferences file');cases.push('independent font Settings persistence')
 const draftSource='# Interrupted DOT draft\n\n```dot\ndigraph { recovered -> ready }\n```\n\n```math\n\\frac{1}{2}+x^2\n```\n\nInline `a  b` and `   `.\n'
 await newDocument();await mode(true);await run(`const e=document.querySelector('[data-active=true] .cm-content');e.focus();document.execCommand('insertText',false,arguments[0])`,draftSource)
 const recovery=await wait(async()=>{const data=JSON.parse(await readFile(join(profile,'workspace.json'),'utf8'));return data.documents.find(d=>d.content.includes('Interrupted DOT draft'))},'flushed draft recovery');assert.equal(recovery.content,draftSource,'Real multiline DOT draft persisted exactly')
 const shot=await request('GET',`/session/${session}/screenshot`).catch(()=>null);if(shot)await writeFile(join(artifacts,'installed.png'),Buffer.from(shot,'base64'))
 // Abruptly end only the installed test process after its real recovery snapshot exists.
 await stopOwnedApplication(driver.pid,binary)
 await request('DELETE',`/session/${session}`).catch(()=>{});session=undefined;await launch();await wait(()=>run('return document.body.textContent.includes("Interrupted DOT draft")'),'draft restored in ordinary UI');await mode(true);await wait(()=>run('return !!document.querySelector("[data-active=true] .markwriter-preview [data-type=dot] svg")'),'recovered offline DOT');await wait(()=>run('return !!document.querySelector("[data-active=true] .markwriter-preview [data-type=math] .katex")'),'recovered offline math')
 assert.equal(await run(`return document.querySelector('select[aria-label="Text size"]').value`),'18','Restored source font is active in ordinary UI')
 const recovered=join(fixture,'recovered.md');await menu('File','Save As...');await dialog(recovered);await wait(async()=>await readFile(recovered,'utf8').catch(()=>null)===draftSource,'recovered draft saved through real OS dialog byte-identically')
 await mode(false);assert.equal(await run(`return document.querySelector('select[aria-label="Text size"]').value`),'24','Restored rendered font is active in ordinary UI')
 await click('//button[@role="tab" and contains(.,"saved.md")]');await mode(true);await diagrams();cases.push('tabs, abrupt restart, byte-identical recovered draft Save As and restored UI fonts')
 assert.equal(await run('return document.querySelector("button[aria-label=\\"Syntax highlighting\\"]").getAttribute("aria-pressed")'),'false','Syntax-off preference restored in ordinary toolbar')
 assert.equal(await run('return document.documentElement.getAttribute("data-theme")'),'dark','Dark preference restored in ordinary UI')
 assert.equal(await run('return getComputedStyle(document.querySelector(".toolbar")).backgroundColor'),'rgb(45, 45, 45)','Restored toolbar uses Dark background')
 await openDocument(syntaxOriginal,'syntax-original.md')
 for(const markdown of [true,false]){await mode(markdown);await wait(()=>run('return !document.querySelector("[data-active=true] [class*=hljs-]")'),'restored syntax-off in '+(markdown?'source/Preview':'rendered'))}
 const syntaxRestored=join(fixture,'syntax-restored.md');await menu('File','Save As...');await dialog(syntaxRestored);await wait(async()=>await readFile(syntaxRestored,'utf8').catch(()=>null)===syntaxSource,'restored syntax preference remains view-only through real Save As')
 await syntaxHighlighting(true,'toolbar');await themeChoice('Auto');await closeCurrentDocument()
 cases.push('abrupt restart retains syntax-off and Dark preferences in ordinary UI and both engines without changing saved bytes')
 for(const markdown of [true,false]){
   await newDocument();await mode(markdown);await menu('Insert','DOT')
   await wait(()=>run('return document.querySelectorAll(arguments[0]).length===1',markdown?'[data-active=true] .markwriter-preview [data-type=dot] svg':'[data-active=true] .tiptap [data-type=dot] svg'),'offline DOT starter in '+(markdown?'source':'rendered'))
   const starterPath=join(fixture,'starter-'+markdown+'.md');await menu('File','Save As...');await dialog(starterPath);const inserted=await wait(()=>readFile(starterPath,'utf8').catch(()=>null),'native starter Save As');assert.ok(inserted.includes('start -> finish;'))
   await mode(!markdown);await mode(markdown)
   const cyclePath=join(fixture,'starter-cycled-'+markdown+'.md');await menu('File','Save As...');await dialog(cyclePath);await wait(async()=>await readFile(cyclePath,'utf8').catch(()=>null)===inserted,'fresh Save As proves view-only starter byte preservation')
   // A file can appear before Save As finishes adopting its captured path.
   // Establish completion before beginning the next independent user action.
   await wait(()=>run(`const t=document.querySelector('[role=tab][aria-selected=true]');return t?.textContent.includes(arguments[0])&&!t.querySelector('[aria-label=Unsaved]')&&!document.querySelector('.status-item.loading')`,'starter-cycled-'+markdown+'.md'),'starter Save As completed in ordinary UI')
   await menu('Edit','Undo')
   await wait(()=>run(`return document.querySelector('.status-right')?.textContent.includes('Characters: 0')&&!!document.querySelector('[role=tab][aria-selected=true] [aria-label=Unsaved]')`),'single starter Undo completed in ordinary UI')
   await menu('File','Save');await wait(async()=>await readFile(cyclePath,'utf8')==='','one starter Undo saves empty original')
 }
 cases.push('both-editor DOT menu starter, native Save As, mode cycles and single Undo')
 const regex=await verifyRegex({dir:fixture,run,click,menu,mode,open:openDocument,
   saveAs:async path=>{await menu('File','Save As...');await dialog(path)},save:()=>menu('File','Save'),wait,request,session})
 cases.push(...regex.cases)
 const regexWorkerPolicy=await verifyNativeWorkerResponse(request,session,join(root,'frontend/dist/assets'),'regex');cases.push('regex worker exact installed bytes, MIME and network-denying CSP')
 await writeFile(join(artifacts,'regex-worker-evidence.json'),JSON.stringify(regexWorkerPolicy,null,2))
 const technical=await verifyTechnicalWriting({root,artifacts,dir:fixture,run,click,menu,mode,open:openDocument,close:closeCurrentDocument,
   saveAs:async path=>{await menu('File','Save As...');await dialog(path)},save:()=>menu('File','Save'),
   exportHtml:async path=>{await menu('File','Export as HTML...');await dialog(path)},wait,request,session,assets:join(root,'frontend/dist/assets')})
 cases.push(...technical.cases)
 const longCode=await verifyLongCode({dir:fixture,artifacts,run,click,menu,mode,open:openDocument,close:closeCurrentDocument,
   saveAs:async path=>{await menu('File','Save As...');await dialog(path)},
   exportHtml:async path=>{await menu('File','Export as HTML...');await dialog(path)},wait,syntax:syntaxHighlighting,request,session})
 cases.push(...longCode.cases)
 const updateCheck=await verifyUpdateCheck({dir:fixture,artifacts,run,click,menu,mode,open:openDocument,
   saveAs:async path=>{await menu('File','Save As...');await dialog(path)},save:()=>menu('File','Save'),wait,request,session})
 cases.push(...updateCheck.cases)
 await writeFile(join(artifacts,'long-code-evidence.json'),JSON.stringify(longCode,null,2))
 await writeFile(join(artifacts,'technical-writing-evidence.json'),JSON.stringify(technical,null,2))
 await writeFile(join(artifacts,'result.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,binary,version,source:process.env.GITHUB_SHA??null,profile,cases,alpha3CodeCases,alpha3Themes,actualWebviewPaths,workerPolicy,recoverySource:recovery.content,os:process.env.ImageOS??null,imageVersion:process.env.ImageVersion??null},null,2))
 console.log('Installed package accepted:',cases.length,'cases')
}catch(error){if(session){const alert=await request('GET',`/session/${session}/alert/text`).catch(()=>null);if(alert)await writeFile(join(artifacts,'native-alert.json'),JSON.stringify({alert},null,2));const html=await request('GET',`/session/${session}/source`).catch(()=>null);if(html)await writeFile(join(artifacts,'failure.html'),html);const shot=await request('GET',`/session/${session}/screenshot`).catch(()=>null);if(shot)await writeFile(join(artifacts,'failure.png'),Buffer.from(shot,'base64'))}throw error}
finally{if(session)await request('DELETE',`/session/${session}`).catch(()=>{});if(driver.pid){try{if(process.platform==='win32')driver.kill();else process.kill(-driver.pid,'SIGTERM')}catch{}}driver.stdout.destroy();driver.stderr.destroy();await writeFile(join(artifacts,'driver.log'),log)}
