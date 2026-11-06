window.dotResult={status:'starting'};window.dbmlResult={status:'starting'};
const worker=new Worker('/dot-worker.js',{type:'module'});worker.onmessage=e=>{window.dotResult=e.data;worker.terminate()};worker.onerror=e=>{window.dotResult={status:'failure',error:e.message};worker.terminate()};
import('/browser-dbml-bundle.js').catch(e=>{window.dbmlResult={status:'failure',error:String(e)}});
