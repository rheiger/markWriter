import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
export async function verifyReleaseAssets(directory, manifests, expected) {
 const targets={'macos-arm64':['arm64','dmg'],'windows-x64':['x64','exe'],'ubuntu-26.04-x64':['x64','deb']}
 assert.equal(manifests.length,3,'Three qualified target manifests required')
 assert.deepEqual(manifests.map(m=>m.platform).sort(),Object.keys(targets).sort(),'Exact qualified target matrix required')
 assert.match(expected.source,/^[0-9a-f]{40}$/,'Full source SHA required')
 for(const m of manifests){
  assert.equal(m.version,expected.version);assert.equal(m.source,expected.source);assert.equal(m.acceptance.passed,true)
  assert.equal(m.iconInspection?.verified,true,'Installed native icon qualification required')
  if(m.platform==='macos-arm64'){
   assert.equal(m.signing?.status,'ad-hoc','Expected qualified ad-hoc signature')
   assert.equal(m.signing.sealed,true,'Whole macOS bundle resource seal required')
   assert.equal(m.signing.strictVerified,true,'Strict installed bundle verification required')
  }
  const [architecture,extension]=targets[m.platform];assert.equal(m.architecture,architecture)
  assert.equal(m.asset.name,`MarkWriter-${expected.version}-${m.platform}.${extension}`)
  const data=await readFile(join(directory,m.asset.name));assert.equal(data.length,m.asset.size)
  assert.equal(createHash('sha256').update(data).digest('hex'),m.asset.sha256,'Final asset checksum mismatch')
 }
}

export function peArchitecture(data) {
 assert.ok(data.length>=64 && data.toString('ascii',0,2)==='MZ','PE DOS header')
 const offset=data.readUInt32LE(0x3c);assert.ok(offset+6<=data.length && data.toString('ascii',offset,offset+4)==='PE\0\0','PE signature')
 const architecture={0x8664:'x64',0x14c:'x86',0xaa64:'arm64'}[data.readUInt16LE(offset+4)]
 assert.ok(architecture,'Known PE architecture required');return architecture
}
