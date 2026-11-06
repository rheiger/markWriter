// Shared semantic journeys for actual WebViews and ordinary installed packages.
// Callers supply their existing real UI/dialog adapters; no product bridge here.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { verifyNativeWorkerResponse } from './worker-response-acceptance.mjs'

export async function verifyTechnicalWriting({root,dir,artifacts,run,click,menu,mode,open,close,saveAs,save,exportHtml,wait,request,session,assets}) {
  const cases=[]
  const source=await readFile(join(root,'tools/fixtures/technical-writing-2.5.md'),'utf8')
  const original=join(dir,'technical-original.md'),saved=join(dir,'technical-saved.md')
  await writeFile(original,source);await open(original,'technical-original.md')
  const codes=['a  b','a\tb','   ','`tick`  text']
  const mathCount=5
  await request('POST',`/session/${session}/window/rect`,{width:800,height:600})
  for(const markdown of [false,true]) {
    await mode(markdown)
    await wait(()=>run(`const a=document.querySelector('[data-active=true]');return a.querySelectorAll(arguments[0]+' [data-type=math] .katex').length===arguments[1]`,markdown?'.markwriter-preview':'.tiptap',mathCount),'offline five representative math blocks')
    const actual=await run(`return [...document.querySelectorAll(arguments[0]+' p code')].map(e=>e.textContent)`,markdown?'[data-active=true] .markwriter-preview':'[data-active=true] .tiptap')
    assert.deepEqual(actual,codes,'Real parsed inline code whitespace')
    for(const theme of ['Light','Dark']) {
      await menu('View',theme)
      await menu('Help','User Guide')
      await wait(()=>run('return !!document.querySelector("dialog[open] input[type=search]")'),'bundled Help search')
      await run(`const e=document.querySelector('dialog[open] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'math');e.dispatchEvent(new Event('input',{bubbles:true}))`)
      await wait(()=>run(`const d=document.querySelector('dialog[open]');return d.querySelector('input[type=search]').value==='math' && d.querySelector('article h3')?.textContent==='Mathematics' && ![...d.querySelectorAll('nav button')].some(e=>e.textContent==='Getting started')`),'Help search filters to actual Mathematics content')
      const bounds=await run(`const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,scroll:d.scrollWidth,client:d.clientWidth}`)
      assert.ok(bounds.left>=0 && bounds.top>=0 && bounds.right<=bounds.w+1 && bounds.bottom<=bounds.h+1 && bounds.scroll<=bounds.client+1,'Help fits minimum viewport '+theme)
      await run(`const e=document.querySelector('dialog[open] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}))`)
      await click('//dialog//nav//button[normalize-space(.)="Code and diagrams"]')
      const article=await request('POST',`/session/${session}/element`,{using:'css selector',value:'dialog[open] article'})
      const articleId=article['element-6066-11e4-a52e-4f735466cecf']
      assert.equal(await run(`return document.querySelector('dialog[open] article').tabIndex`),0)
      await request('POST',`/session/${session}/element/${articleId}/value`,{text:'\uE00F',value:['\uE00F']})
      await wait(()=>run(`return document.querySelector('dialog[open] article').scrollTop>0`),'keyboard PageDown scrolls Help article')
      const shot=await request('GET',`/session/${session}/screenshot`)
      await writeFile(join(artifacts,`technical-help-${markdown}-${theme}.png`),Buffer.from(shot,'base64'))
      await request('POST',`/session/${session}/element/${articleId}/value`,{text:'\uE00C',value:['\uE00C']})
      await wait(()=>run(`return !document.querySelector('dialog[open]')`),'keyboard Escape closes Help')
      assert.equal(await run(`return document.activeElement?.textContent`),'Help','Help returns keyboard focus')
    }
  }
  await saveAs(saved);await wait(async()=>await readFile(saved,'utf8').catch(()=>null)===source,'byte-identical math/code/help view-only Save As')
  cases.push('five offline math cases and literal inline-code whitespace in both editors with Help view-only exact Save As')
  const fonts=await request('POST',`/session/${session}/execute/async`,{script:`const done=arguments[arguments.length-1];Promise.all([...document.fonts].filter(f=>f.family.includes('KaTeX')).map(async f=>{await f.load();return {family:f.family,style:f.style,weight:f.weight,status:f.status}})).then(done).catch(e=>done({error:String(e)}));`,args:[]})
  assert.ok(Array.isArray(fonts) && fonts.length===20 && fonts.every(f=>f.status==='loaded'),'Every bundled KaTeX font loads offline under production CSP')
  cases.push('all20 KaTeX font faces load offline under the actual native document CSP')
  const policy=await verifyNativeWorkerResponse(request,session,assets,'math')
  cases.push('math worker exact installed bytes, JavaScript MIME and network-denying CSP without WASM')
  await mode(false)
  await run(`const p=document.querySelector('[data-active=true] .tiptap p');p.parentElement.focus();const r=document.createRange();r.setStart(p,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);document.execCommand('insertText',false,'Edited ');`)
  await save();await wait(async()=>(await readFile(saved,'utf8')).includes('Edited '),'rendered edit native Save')
  await menu('Edit','Undo');await save()
  await wait(async()=>!(await readFile(saved,'utf8')).includes('Edited '),'rendered edit single Undo saved restoration')
  await menu('Edit','Redo');await save()
  await wait(async()=>(await readFile(saved,'utf8')).includes('Edited '),'rendered edit Redo saved')
  await close();await open(saved,'technical-saved.md');await mode(false)
  assert.deepEqual(await run(`return [...document.querySelectorAll('[data-active=true] .tiptap p code')].map(e=>e.textContent)`),codes,'Edited native reopen retains meaningful inline-code whitespace')
  cases.push('actual rendered edit, native Save/reopen and single Undo preserve code spaces/tabs/backticks')
  // Source editing is a real edit immediately, so ordinary Save/recovery owns it.
  await click('(//*[@data-active="true"]//*[@data-type="math"]//button[normalize-space(.)="Edit math source"])[1]')
  const changed='\\frac{3}{4}'
  await run(`const e=document.querySelector('[data-active=true] textarea[aria-label="Math source"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,arguments[0]);e.dispatchEvent(new Event('input',{bubbles:true}))`,changed)
  await wait(()=>run(`return document.querySelector('[data-active=true] [data-type=math]').getAttribute('data-chart')===arguments[0]`,changed),'live math source owns document transaction')
  await mode(true);await mode(false)
  assert.equal(await run(`return document.querySelector('[data-active=true] [data-type=math]').getAttribute('data-chart').trim()`),changed)
  await menu('Edit','Undo');await save()
  await wait(async()=>!(await readFile(saved,'utf8')).includes(changed),'single math source Undo saved original expression')
  cases.push('live math source survives mode changes and one native Undo restores its original expression')
  const exported=join(dir,'technical-export.html')
  await exportHtml(exported)
  const html=await wait(()=>readFile(exported,'utf8').catch(()=>null),'self-contained native math HTML export')
  assert.equal((html.match(/class="katex"/g)??[]).length,mathCount)
  assert.ok(html.includes('data:font/woff2;base64,'),'Embedded export fonts')
  assert.ok(!/<script|data-mw-|data-chart|data-source-fence|javascript:/.test(html),'Static export no executable/navigation/source metadata')
  assert.ok(!/url\(["']?(?:https?:|\/assets\/|fonts\/)/.test(html),'No remote or sibling font dependencies')
  cases.push('native self-contained math HTML export with embedded fonts and inert static markup')
  await writeFile(join(artifacts,'technical-writing.png'),Buffer.from(await request('GET',`/session/${session}/screenshot`),'base64'))
  const badBlocks=['', String.raw`\frac{`, String.raw`\href{https://example.invalid}{x}`, String.raw`\def\foo{\foo}\foo`, 'x'.repeat(17000)].map(text=>'```math\n'+text+'\n```').join('\n\n')
  const badSource='# Safety before\n\n'+badBlocks+'\n\nSafety after\n'
  const badPath=join(dir,'math-safety.md');await writeFile(badPath,badSource);await open(badPath,'math-safety.md')
  for(const markdown of [false,true]) {
    await mode(markdown)
    await wait(()=>run(`const a=document.querySelector('[data-active=true]');return a.querySelectorAll(arguments[0]+' [data-type=math][role=status],'+arguments[0]+' [data-type=math] [role=status]').length===5`,markdown?'.markwriter-preview':'.tiptap'),'five malformed/adversarial/oversized math source fallbacks')
    assert.equal(await run(`return document.querySelectorAll('[data-active=true] [data-type=math] img,[data-active=true] [data-type=math] script').length`),0)
    const path=join(dir,'math-safety-'+markdown+'.md');await saveAs(path);await wait(async()=>await readFile(path,'utf8').catch(()=>null)===badSource,'invalid math exact native Save As')
  }
  const badExport=join(dir,'math-safety.html');await exportHtml(badExport)
  const badHtml=await wait(()=>readFile(badExport,'utf8').catch(()=>null),'invalid math static source export')
  assert.equal((badHtml.match(/class="math-source"/g)??[]).length,5)
  assert.ok(badHtml.includes('Safety before') && badHtml.includes('Safety after'))
  cases.push('both-editor malformed/empty/trust-denied/macro-loop/16KiB math fallbacks preserve exact saved source and exported surrounding document')
  const many=Array.from({length:65},()=> '```math\nx^2\n```').join('\n\n')+'\n'
  const manyPath=join(dir,'math-budget.md');await writeFile(manyPath,many);await open(manyPath,'math-budget.md')
  for(const markdown of [false,true]) {
    await mode(markdown)
    await wait(()=>run(`const a=document.querySelector('[data-active=true]'),base=arguments[0];return a.querySelectorAll(base+' [data-type=math] .katex').length===64 && a.querySelectorAll(base+' [data-type=math][role=status],'+base+' [data-type=math] [role=status]').length===1`,markdown?'.markwriter-preview':'.tiptap'),'64 supported math blocks with explicit 65th-block fallback')
  }
  const manySaved=join(dir,'math-budget-saved.md');await saveAs(manySaved);await wait(async()=>await readFile(manySaved,'utf8').catch(()=>null)===many,'document-budget errors remain view-only in exact native Save As')
  cases.push('both-editor 64-block math document budget and explicit 65th-block fallback with byte-identical native Save As')
  return {cases,policy,fonts,source,exported}
}
