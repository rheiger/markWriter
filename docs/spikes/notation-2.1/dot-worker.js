import {instance} from './node_modules/@viz-js/viz/dist/viz.js';
try{const viz=await instance();postMessage({status:'success',svg:viz.renderString('digraph {a -> b}',{format:'svg'})})}catch(e){postMessage({status:'failure',error:String(e)})}
