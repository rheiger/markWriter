// Collect full installed license/notice texts from locked dependency sources.
// Includes build/dev Rust crates conservatively; never substitutes SPDX names for texts.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root=resolve(import.meta.dirname,'..'), entries=[], missing=[]
const supplements=JSON.parse(await readFile(join(root,'notices/registry-sources.json'),'utf8'))
async function add(name,version,path,license,extra=[]) {
 const names=(await readdir(path)).filter(n=>/^(licen[sc]e|copying|notice|unlicen[sc]e|copyright)(?:$|[._-])/i.test(n))
 const files=[...new Set([...names,...extra])].sort()
 const texts=[]
 for(const file of files) {try {const text=await readFile(join(path,file),'utf8'); if(text.trim())texts.push(`--- ${file} ---\n${text}`)}catch{/* Directories aren't license texts. */}}
 for(const source of supplements[`${name}@${version}`]??[]) {
  const data=await readFile(join(root,source.path));if(createHash('sha256').update(data).digest('hex')!==source.sha256)throw new Error('Notice source hash mismatch: '+source.path)
  texts.push(`--- ${source.url} [SHA256 ${source.sha256}] ---\n${data.toString('utf8')}`)
 }
 if(!texts.length)missing.push(`${name}@${version} (${license ?? 'unknown'})`)
 entries.push({name,version,license,text:texts.join('\n')})
}
const lock=JSON.parse(await readFile(join(root,'frontend/package-lock.json'),'utf8'))
for(const [key,pkg] of Object.entries(lock.packages)) {
 if(!key || pkg.dev)continue
 const path=join(root,'frontend',key)
 try {const info=JSON.parse(await readFile(join(path,'package.json'),'utf8'));await add(info.name,info.version,path,info.license)}
 catch(e){if(!pkg.optional)throw e}
}
const cargo=JSON.parse(execFileSync('cargo',['metadata','--locked','--format-version','1'],{cwd:join(root,'src-tauri'),maxBuffer:32*1024*1024,encoding:'utf8'}))
for(const pkg of cargo.packages.filter(p=>p.source))await add(`Rust/${pkg.name}`,pkg.version,dirname(pkg.manifest_path),pkg.license,pkg.license_file?[pkg.license_file]:[])
for(const file of (await readdir(join(root,'notices'))).filter(n=>n.endsWith('.txt') && n!=='THIRD_PARTY_NOTICES.txt'))entries.push({name:file,version:'',license:'See full text',text:await readFile(join(root,'notices',file),'utf8')})
if(missing.length)throw new Error('Missing license texts: '+missing.join('\n'))
entries.sort((a,b)=>`${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))
await mkdir(join(root,'frontend/public'),{recursive:true})
const intro=`MarkWriter Tauri v2 third-party notices\nGenerated from frontend/package-lock.json and src-tauri/Cargo.lock.\nSome build/test/unused transitive licenses are included conservatively. System WebViews/OS components are provided by the operating system.\n\nDOT runtime: @viz-js/viz3.31.0 (upstream c8ce050d28eb0dc1ed1629ea32ab7f3dc117db0f), compiled Graphviz16.1.0 + Expat2.8.5, Emscripten6.0.10. No local modifications to those components. Graphviz corresponding source: https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/16.1.0/graphviz-16.1.0.tar.gz ; build recipe: https://github.com/mdaines/viz-js/blob/c8ce050d28eb0dc1ed1629ea32ab7f3dc117db0f/packages/viz/backend/Dockerfile\n\n`
await writeFile(join(root,'frontend/public/THIRD_PARTY_NOTICES.txt'),intro+entries.map(e=>`\n${'='.repeat(72)}\n${e.name}@${e.version}\nDeclared license: ${JSON.stringify(e.license)}\n${e.text}`).join('\n'))
console.log(`Collected ${entries.length} dependency notices; ${missing.length} missing`)
