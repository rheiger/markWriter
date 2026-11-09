// Shared real-WebView journeys; all edits and search controls use the product UI.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export async function verifyRegex({dir,run,click,menu,mode,open,saveAs,save,wait,request,session}) {
  const cases=[]
  const source='# Regex acceptance\n\n😀 same same\n'
  // A genuine rendered edit may normalize a final line ending. Undo must
  // recover the exact canonical source captured before that edit.
  const renderedEditedBase='# Regex acceptance\n\n😀 same same'
  const original=join(dir,'regex-original.md'),saved=join(dir,'regex-saved.md')
  await writeFile(original,source);await open(original,'regex-original.md')
  const setText=async (index,value)=>run(`const e=document.querySelectorAll('[role=search] textarea')[arguments[0]];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,arguments[1]);e.dispatchEvent(new Event('input',{bubbles:true}))`,index,value)
  const output=()=>run('return document.querySelector("[role=search] output")?.textContent')
  const enable=async()=>{
    const checked=await run(`return [...document.querySelectorAll('[role=search] label')].find(e=>e.textContent==='Regex')?.querySelector('input')?.checked`)
    if(!checked)await click('//label[normalize-space(.)="Regex"]/input')
  }
  for(const markdown of [true,false]){
    await mode(markdown);await menu('Edit','Replace...');await enable()
    await setText(0,'(?<outer>s(?<inner>a))me');await setText(1,'$<inner>-$1')
    await wait(async()=>/2 matches/.test(await output()),'regex nested named capture results in '+(markdown?'source':'rendered'))
    await wait(()=>run(`const a=document.querySelector('[data-active=true]'),l=document.querySelector('[aria-label="Capture group legend"]');const editor=a.querySelector(arguments[0]);return !!editor?.querySelector('.search-group-0')&&!!editor.querySelector('.search-group-1')&&l?.textContent.includes('Group 1 (outer)')&&l.textContent.includes('Group 2 (inner)')`,markdown?'.cm-content':'.tiptap'),'visible group classes and named legend')
    if(markdown){await saveAs(saved);await wait(async()=>await readFile(saved,'utf8').catch(()=>null)===source,'regex search and highlighting do not change saved source');await wait(()=>run(`return document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('regex-saved.md')`),'Save As ownership settled')}
    const originalModel=markdown?null:await run(`return document.querySelector('[data-active=true] .tiptap').editor.getJSON()` )
    await click('//button[normalize-space(.)="Replace All"]')
    const changed=(markdown?source:renderedEditedBase).replaceAll('same','a-sa')
    await save();await wait(async()=>await readFile(saved,'utf8').catch(()=>null)===changed,'capture references and full content saved in '+(markdown?'source':'rendered'))
    await menu('Edit','Undo')
    if(!markdown)await wait(async()=>JSON.stringify(await run(`return document.querySelector('[data-active=true] .tiptap').editor.getJSON()`))===JSON.stringify(originalModel),'one rendered Undo restores the entire document model')
    await save();await wait(async()=>await readFile(saved,'utf8')===source,'one Undo saves exact source bytes in '+(markdown?'source':'rendered'))
    await click('//button[normalize-space(.)="Close Find"]')
    cases.push((markdown?'source':'rendered')+' regex nested named captures, legend, replacement and one-step native Undo')
  }
  const slow=join(dir,'regex-slow.md')
  await writeFile(slow,'a'.repeat(40000)+'!\n');await open(slow,'regex-slow.md');await mode(true)
  await menu('Edit','Replace...');await enable();await setText(0,'(a+)+$')
  await wait(async()=>/timed out/i.test(await output()),'catastrophic regex worker timeout')
  await setText(0,'!');await wait(async()=>/1 matches/.test(await output()),'new query after timeout')
  await setText(0,'(a+)+$');await setText(0,'!')
  await wait(async()=>/1 matches/.test(await output()),'new query supersedes slow worker');await delay(700)
  assert.match(await output(),/1 matches/,'Late slow result cannot overwrite newer query')
  cases.push('actual WebView catastrophic regex timeout, recovery and stale-query rejection')
  // Start a slow job, then make a genuine source edit while it is in flight.
  await setText(0,'(a+)+$')
  const e=await request('POST',`/session/${session}/element`,{using:'css selector',value:'[data-active=true] .cm-content'})
  await request('POST',`/session/${session}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/click`,{})
  await request('POST',`/session/${session}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:'Z',value:['Z']})
  await setText(0,'Z');await wait(async()=>/1 matches/.test(await output()),'new revision regex results');await delay(700)
  assert.match(await output(),/1 matches/,'Old revision result cannot overwrite current search')
  await menu('Edit','Undo');await setText(0,'(a+)+$')
  await click('//button[@role="tab" and contains(.,"regex-saved.md")]')
  await wait(()=>run('return document.querySelector("[role=tab][aria-selected=true]")?.textContent.includes("regex-saved.md")'),'switch document during regex search')
  await delay(700)
  assert.ok(await run('return document.querySelector("[role=tab][aria-selected=true]")?.textContent.includes("regex-saved.md")'))
  await save();await wait(async()=>await readFile(saved,'utf8')===source,'old-tab worker cannot mutate active document')
  cases.push('actual source revision and tab changes reject stale regex jobs')
  return {cases}
}
