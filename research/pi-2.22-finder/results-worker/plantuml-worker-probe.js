(async () => {
  const cases = {
    sequence:'@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\nBob --> Alice: Response\n@enduml',
    klass:'@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml',
    malformed:'@startuml\nclass {\n@enduml',
    theme:'@startuml\n!theme absent\n@enduml',
    file:'@startuml\n!include /tmp/secret\n@enduml',
    network:'@startuml\n!include http://127.0.0.1/canary\n@enduml',
    image:'@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: <img:http://127.0.0.1/canary>\n@enduml',
    oversized:'@startuml\n'+'x'.repeat(9000)+'\n@enduml',
  }
  const results=[]
  const startWorker = () => new Promise((resolve,reject) => {
    const worker=new Worker('/worker.js'), started=performance.now()
    worker.onerror=e=>reject(Error(e.message))
    worker.onmessage=e=>{ if(e.data.ready) resolve({worker,readyMs:Math.round(performance.now()-started)}); else if(e.data.startupError) reject(Error(e.data.startupError)) }
  })
  const call = (worker,id,source) => new Promise((resolve,reject) => {
    const started=performance.now(), timer=setTimeout(()=>reject(Error('test deadline')),8000)
    worker.onmessage=e=>{if(e.data.id!==id)return; clearTimeout(timer); resolve({value:e.data,ms:Math.round(performance.now()-started)})}
    worker.postMessage({id,owner:'synthetic-owner',source})
  })
  const first=await startWorker()
  for (const [i,[name,source]] of Object.entries(cases).entries()) {
    const {value,ms}=await call(first.worker,i+1,source)
    if(value.svg) {
      const parsed=new DOMParser().parseFromString(value.svg,'image/svg+xml')
      const labels=Array.from(parsed.querySelectorAll('text')).map(t=>t.textContent)
      results.push({name,ms,status:'svg',bytes:new TextEncoder().encode(value.svg).length,labels})
    } else {
      const fallback=document.querySelector('pre'); fallback.textContent=source
      results.push({name,ms,status:'error',readableSource:fallback.textContent===source,error:String(value.error)})
    }
  }
  first.worker.terminate()
  const pending=await startWorker(), source='@startuml\nactor Alice\nparticipant Bob\n'+Array(90).fill('Alice -> Bob: Work').join('\n')+'\n@enduml'
  const fallback=document.querySelector('pre'); fallback.textContent=source
  let timedResponse=false
  pending.worker.onmessage=e=>{if(e.data.id===99)timedResponse=true}
  pending.worker.postMessage({id:99,owner:'synthetic-owner',source})
  await new Promise(resolve=>setTimeout(resolve,1))
  pending.worker.terminate()
  await new Promise(resolve=>setTimeout(resolve,50))
  const recovery=await startWorker(), after=await call(recovery.worker,100,cases.sequence)
  recovery.worker.terminate()
  window.webkit.messageHandlers.result.postMessage(JSON.stringify({readyMs:first.readyMs,results,controlledTermination:{timedResponse,readableSource:fallback.textContent===source,nextPreviewSvg:typeof after.value.svg==='string',nextMs:after.ms},qualification:'direct macOS WKWebView Web Worker, not MarkWriter packaged app or Finder; timer does not prove engine execution began'}))
})().catch(e=>window.webkit.messageHandlers.result.postMessage(JSON.stringify({fatal:String(e)})))
