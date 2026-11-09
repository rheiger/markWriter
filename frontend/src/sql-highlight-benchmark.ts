import { renderMappedMarkdown } from './lib/markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HighlightedCodeBlock, sourceCodeHighlighting } from './lib/editorCodeHighlight'

const sql = 'SELECT id, name FROM items WHERE id = 42;\n'.repeat(2800) + 'SELECT'
const source='```sql\n'+sql+'\n```'
const initStart=performance.now()
const state=EditorState.create({doc:source,extensions:[markdown(),sourceCodeHighlighting]}); ensureSyntaxTree(state,source.length,5000)
const cm=new EditorView({state,parent:document.querySelector('#cm')!})
const editor=new Editor({element:document.querySelector('#pm')!,extensions:[StarterKit.configure({codeBlock:false}),HighlightedCodeBlock],content:{type:'doc',content:[{type:'codeBlock',attrs:{language:'sql'},content:[{type:'text',text:sql}]}]}})
const initMs=performance.now()-initStart
const cmTimes:number[]=[],pmTimes:number[]=[], previewTimes:number[]=[]
const preview=document.createElement('div'); document.body.append(preview)
for(let n=0;n<20;n++) {
 let t=performance.now(); cm.dispatch({changes:{from:10,insert:'x'}}); cmTimes.push(performance.now()-t)
 t=performance.now(); const result=renderMappedMarkdown(cm.state.doc.toString(), {documentId:'bench',revision:n,generation:n}); preview.innerHTML=result.html; previewTimes.push(performance.now()-t)
 t=performance.now(); editor.commands.insertContentAt(2,'x'); pmTimes.push(performance.now()-t)
}
document.querySelector('#results')!.textContent=JSON.stringify({initMs,units:sql.length,bytes:new TextEncoder().encode(sql).length,cmTimes,pmTimes,previewTimes,cmText:cm.state.doc.toString().length,pmText:editor.state.doc.textContent.length,pmSpans:document.querySelectorAll('#pm .hljs-keyword').length,cmSpans:document.querySelectorAll('#cm .hljs-keyword').length,pmFinal:[...document.querySelectorAll('#pm .hljs-keyword')].at(-1)?.textContent==='SELECT'})
