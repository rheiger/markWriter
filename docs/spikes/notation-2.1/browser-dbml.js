import {Parser} from '@dbml/core';
window.dbmlResult={status:'starting'};try{const db=new Parser().parse('Table test {\n id int [pk]\n}','dbmlv2');window.dbmlResult={status:'success',tables:db.schemas.length}}catch(e){window.dbmlResult={status:'failure',error:String(e)}}
