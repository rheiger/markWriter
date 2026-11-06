import { execFileSync } from 'node:child_process'
import { readdir,readFile,readlink } from 'node:fs/promises'
import { resolve } from 'node:path'
export async function processInventory() {
 if(process.platform==='win32')return JSON.parse(execFileSync('pwsh',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath | ConvertTo-Json -Compress'],{encoding:'utf8',maxBuffer:8*1024*1024})).map(p=>({pid:p.ProcessId,parent:p.ParentProcessId,path:p.ExecutablePath}))
 const rows=[]
 for(const name of await readdir('/proc'))if(/^\d+$/.test(name)){try{const stat=await readFile(`/proc/${name}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');rows.push({pid:Number(name),parent:Number(fields[1]),path:await readlink(`/proc/${name}/exe`)})}catch{/* A process may exit during inventory. */}}
 return rows
}
export function ownedDescendants(rows,parent) {
 const ids=new Set([parent]);let changed=true
 while(changed){changed=false;for(const row of rows)if(ids.has(row.parent)&&!ids.has(row.pid)){ids.add(row.pid);changed=true}}
 return rows.filter(row=>row.pid!==parent&&ids.has(row.pid))
}
export async function stopOwnedApplication(driverPid,binary) {
 const rows=ownedDescendants(await processInventory(),driverPid),normalize=p=>process.platform==='win32'?p?.toLowerCase():p
 const candidates=rows.filter(row=>normalize(row.path)===normalize(resolve(binary)))
 if(candidates.length!==1)throw new Error(`Expected one application owned by test driver; found ${candidates.length}`)
 const pid=candidates[0].pid
 if(process.platform==='win32')execFileSync('taskkill',['/F','/PID',String(pid),'/T'])
 else process.kill(pid,'SIGKILL')
 return pid
}
