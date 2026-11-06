// Shared regression journey. Uses only the caller's real UI/native I/O adapters,
// including for the installed production build: no acceptance bridge access here.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

function padding(length) {
  return Array.from({length:Math.ceil(length/200)},(_,n)=>' '.repeat(Math.min(199,length-n*200-1))+'\n').join('').slice(0,length)
}
function jsonBlock(size,marker) {
  const object={[marker]:true}
  for(let n=0;;n++) {
    object[`quality_score_${n}`]=n/100
    if(JSON.stringify(object,null,2).length>size-200){delete object[`quality_score_${n}`];break}
  }
  const text=JSON.stringify(object,null,2)
  return text+padding(size-text.length)
}
export function longCodeFixture() {
  const marker='long_python_probe'
  let python=`def ${marker}():\n    score = 0.0\n`+Array.from({length:127},(_,n)=>`    score += ${n} * 0.75\n`).join('')+'    return score\n'
  while(python.length<4588) {
    const remaining=4588-python.length
    python+=remaining===1?'\n':'#'+' '.repeat(Math.min(198,remaining-2))+'\n'
  }
  const blocks=[{language:'python',marker,code:python},...[832,931,448,11246,8355].map((size,n)=>{
    const marker=`long_json_probe_${n+1}`
    return {language:'json',marker,code:jsonBlock(size,marker)}
  })]
  return {blocks,source:'# Long explicit code regression\n\n'+blocks.map(({language,code},n)=>`## Block ${n+1}\n\n\`\`\`${language}\n${code}\n\`\`\``).join('\n\n')+'\n'}
}

export async function verifyLongCode({dir,artifacts,run,click,menu,mode,open,close,saveAs,exportHtml,wait,syntax,request,session}) {
  const {blocks,source}=longCodeFixture(),cases=[]
  const path=join(dir,'long-code.md'),saved=join(dir,'long-code-saved.md')
  await writeFile(path,source);await open(path,'long-code.md');await syntax(true,'toolbar')
  const expected=blocks.map(block=>block.code+'\n')
  const evidence={sizes:blocks.map(block=>block.code.length),blocks:[],sourceMarkers:[],cases}
  async function saveExact(destination,label) {
    await saveAs(destination)
    await wait(async()=>await readFile(destination,'utf8').catch(()=>null)===source,label+' file bytes')
    await wait(()=>run(`const t=document.querySelector('[role=tab][aria-selected=true]');return t?.textContent.includes(arguments[0])&&!t.querySelector('[aria-label=Unsaved]')&&!document.querySelector('.status-item.loading')`,basename(destination)),label+' captured path adopted and clean')
  }
  for(const markdown of [false,true]) {
    await mode(markdown)
    const base=markdown?'.markwriter-preview':'.tiptap'
    await wait(()=>run(`const nodes=[...document.querySelectorAll('[data-active=true] '+arguments[0]+' pre>code')];return nodes.length===arguments[1].length&&nodes.every((n,i)=>n.textContent===arguments[1][i]&&!!n.querySelector('[class*=hljs-]'))`,base,expected),'all six long/short code blocks highlighted in '+(markdown?'Preview':'Tiptap'))
    const counts=await run(`return [...document.querySelectorAll('[data-active=true] '+arguments[0]+' pre>code')].map(n=>n.querySelectorAll('[class*=hljs-]').length)`,base)
    evidence.blocks.push({surface:markdown?'Preview':'Tiptap',counts})
    if(markdown) {
      // CodeMirror virtualizes long documents. Navigate to every unique marker
      // with the actual Find UI before inspecting its visible decorated line.
      for(const block of blocks) {
        await menu('Edit','Find...')
        await wait(()=>run('return !!document.querySelector("[role=search] textarea")'),'long-code source Find opened')
        await run(`const e=document.querySelector('[role=search] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,arguments[0]);e.dispatchEvent(new Event('input',{bubbles:true}))`,block.marker)
        await wait(()=>run('return document.querySelector("[role=search] output")?.textContent.includes("1 match")'),'unique long-code source marker')
        await click('//button[normalize-space(.)="Next"]')
        await click('//button[normalize-space(.)="Close Find"]')
        await wait(()=>run(`return [...document.querySelectorAll('[data-active=true] .cm-line')].some(n=>n.textContent.includes(arguments[0])&&!!n.querySelector('[class*=hljs-]'))`,block.marker),'visible highlighted CodeMirror block '+block.marker)
        evidence.sourceMarkers.push({marker:block.marker,highlighted:true})
      }
    }
    await writeFile(join(artifacts,`long-code-${markdown?'source':'rendered'}.png`),Buffer.from(await request('GET',`/session/${session}/screenshot`),'base64'))
  }
  cases.push('six-block long Python/JSON aggregate document highlights in real CodeMirror, Preview and Tiptap')
  for(const enabled of [true,false]) {
    await syntax(enabled,'toolbar')
    for(const markdown of [false,true]) {
      await mode(markdown)
      const base=markdown?'.markwriter-preview':'.tiptap'
      await wait(()=>run(`const nodes=[...document.querySelectorAll('[data-active=true] '+arguments[0]+' pre>code')];return nodes.length===arguments[1].length&&nodes.every((n,i)=>n.textContent===arguments[1][i]&&!!n.querySelector('[class*=hljs-]')===arguments[2])`,base,expected,enabled),'long-code '+(enabled?'enabled':'disabled')+' presentation retains exact code')
      if(markdown && !enabled)assert.equal(await run(`return document.querySelectorAll('[data-active=true] .cm-content [class*=hljs-]').length`),0,'Long-code source syntax disabled')
    }
    const exported=join(dir,`long-code-${enabled?'on':'off'}.html`);await exportHtml(exported)
    const html=await wait(async()=>{const text=await readFile(exported,'utf8').catch(()=>null);return text?.endsWith('</html>')?text:null},'complete long-code native HTML export')
    const check=await run(`const doc=new DOMParser().parseFromString(arguments[0],'text/html'),nodes=[...doc.querySelectorAll('pre>code')];return {text:nodes.map(n=>n.textContent),tokens:nodes.map(n=>n.querySelectorAll('[class*=hljs-]').length),scripts:doc.querySelectorAll('script').length}`,html)
    assert.deepEqual(check.text,expected,'All six exported code texts remain exact')
    assert.equal(check.scripts,0,'Long code export is static')
    assert.ok(check.tokens.every(n=>enabled?n>0:n===0),'Long code export captures highlighting preference')
    evidence.blocks.push({surface:enabled?'export-on':'export-off',counts:check.tokens})
  }
  cases.push('long Python/JSON both-editor syntax toggle and static HTML export honor preference without changing text')
  await saveExact(saved,'long-code view-only exact native Save As')
  await syntax(true,'menu');await mode(false);await mode(true)
  const savedAgain=join(dir,'long-code-cycle-saved.md');await saveExact(savedAgain,'long-code toggle/mode cycles preserve canonical saved bytes')
  cases.push('long-code view-only native Save As and repeated mode/toggle cycles preserve original bytes')
  await close()
  return evidence
}
