(async () => {
  const url = '__CANARY_URL__';
  const cases = {
    sequence: '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\nBob --> Alice: Response\n@enduml',
    klass: '@startuml\nclass User {\n +id: int\n +name: string\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml',
    validErrorText: '@startuml\nAlice -> Bob : Syntax Error\n@enduml',
    malformed: '@startuml\nclass {\n@enduml',
    local: '@startuml\n!include __CANARY_FILE__\nAlice -> Bob\n@enduml',
    network: '@startuml\n!include '+url+'/include.puml\nAlice -> Bob\n@enduml',
    theme: '@startuml\n!theme absent\nAlice -> Bob\n@enduml',
    image: '@startuml\nAlice -> Bob : <img:'+url+'/image.png>\n@enduml',
  };
  const denied = {};
  for (const [name, target] of Object.entries({network:url+'/fetch',local:'file://__CANARY_FILE__'})) {
    try { denied[name] = {ok:true, text:await (await fetch(target)).text()}; }
    catch(e) { denied[name] = {ok:false, error:String(e)}; }
  }
  const out = [];
  for (const [name, src] of Object.entries(cases)) {
    const start = performance.now();
    const result = await new Promise(resolve => mwRender(src.split('\n'), svg => resolve({callback:'success', bytes:new TextEncoder().encode(svg).length, labels:['Alice','Bob','Request','Response','User','Order','owns','Error','Syntax','Cannot','CANARY'].filter(x => svg.includes(x)), refs:[...svg.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1])}), e => resolve({callback:'error',error:String(e)}), {maxSvgSize:4096}));
    out.push({name,ms:Math.round(performance.now()-start),...result});
  }
  window.webkit.messageHandlers.result.postMessage(JSON.stringify({webkit:'2.54.0',directFetch:denied, caseResults:out}));
})().catch(e => window.webkit.messageHandlers.result.postMessage(JSON.stringify({fatal:String(e),stack:e.stack})));
