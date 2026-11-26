(async () => {
  const inputs = __INPUTS__
  const source = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
  const classSource = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
  const fixtures = [
    ['sequence',source,inputs.sequence,true], ['class',classSource,inputs.klass,true],
    ['hidden-entity',classSource,inputs.klass.replace('class="entity"','class="entity" opacity="0"'),false],
    ['invisible-marker',classSource,inputs.klass.replace('stroke="#038048"','stroke="#F1F1F1"'),false],
    ['reversed-arrow',source,inputs.sequence.replace('89.64,98 99.64,102 89.64,106 93.64,102','109.64,98 99.64,102 109.64,106 105.64,102'),false],
    ['displaced-text',source,inputs.sequence.replace('x="31.83" y="97"','x="999" y="97"'),false],
    ['external-image',source,inputs.sequence.replace('<defs></defs>','<image href="http://127.0.0.1:9/canary"/>'),false],
    ['entity',source,'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///tmp/canary">]><svg>&x;</svg>',false],
    ['malformed',source,'<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',false],
    ['numeric-nul',source,inputs.sequence.replace('<title>Alice</title>','<title>Alice&#0;</title>'),false],
    ['literal-control',source,inputs.sequence.replace('<title>Alice</title>','<title>Alice\u0001</title>'),false],
  ]
  const worker = path => new Promise((resolve,reject)=>{
    const w = new Worker(path), timer=setTimeout(()=>{w.terminate();reject(Error('startup timeout'))},8000)
    w.onerror=e=>{clearTimeout(timer);reject(Error(e.message))}
    w.onmessage=e=>{if(e.data.ready){clearTimeout(timer);resolve(w)} else if(e.data.startupError){clearTimeout(timer);reject(Error(e.data.startupError))}}
  })
  const call = (w,id,src,svg) => new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('validation timeout')),8000)
    w.onmessage=e=>{if(e.data.id===id){clearTimeout(timer);resolve(e.data)}}
    w.postMessage({id,owner:'synthetic',source:src,svg})
  })
  const normal=await worker('/validation.js'), cases=[]
  for(const [id,[name,src,svg,expected]] of fixtures.entries()){
    const t=performance.now(), output=await call(normal,id+1,src,svg)
    const ok=typeof output.svg==='string', parsed=ok?new DOMParser().parseFromString(output.svg,'image/svg+xml'):null
    cases.push({name,expected,ok,ms:Math.round(performance.now()-t),nativeRejects:!!new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror'),safe:!ok||(!parsed.querySelector('parsererror,script,image')&&parsed.documentElement.namespaceURI==='http://www.w3.org/2000/svg')})
  }
  normal.terminate()
  const held=await worker('/validation-hold.js')
  await new Promise(resolve=>{held.onmessage=e=>{if(e.data.entered)resolve()};held.postMessage({__controlledDelay:true})})
  const fallback=document.querySelector('pre');fallback.textContent=source
  let ticks=0;const pulse=setInterval(()=>ticks++,5)
  const started=performance.now();await new Promise(resolve=>setTimeout(resolve,50));held.terminate();clearInterval(pulse)
  const elapsed=Math.round(performance.now()-started), next=await worker('/validation.js'), recovered=await call(next,99,source,inputs.sequence);next.terminate()
  window.webkit.messageHandlers.result.postMessage(JSON.stringify({cases,controlledTimeout:{entered:true,ticks,elapsedMs:elapsed,sourceVisible:fallback.textContent===source,nextSvg:typeof recovered.svg==='string'},qualification:'direct WebKitGTK Worker; hold wrapper is synthetic, no installed app or hard end-to-end UI deadline claim'}))
})().catch(e=>window.webkit.messageHandlers.result.postMessage(JSON.stringify({fatal:String(e)})))
