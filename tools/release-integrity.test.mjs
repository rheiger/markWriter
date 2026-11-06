import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyReleaseAssets } from './release-integrity.mjs'
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'markwriter-manifest-')),version='2.1.0-alpha2',source='a'.repeat(40),manifests=[];for(const [platform,architecture,ext] of [['macos-arm64','arm64','dmg'],['windows-x64','x64','exe'],['ubuntu-26.04-x64','x64','deb']]){const data=Buffer.from(platform),name=`MarkWriter-${version}-${platform}.${ext}`;await writeFile(join(dir,name),data);manifests.push({version,source,platform,architecture,acceptance:{passed:true},asset:{name,size:data.length,sha256:createHash('sha256').update(data).digest('hex')}})}return {dir,manifests,expected:{version,source}}}
test('accepts exact qualified bytes and rejects tampering before publication',async()=>{const f=await fixture();await verifyReleaseAssets(f.dir,f.manifests,f.expected);await writeFile(join(f.dir,f.manifests[0].asset.name),'tampered');await assert.rejects(verifyReleaseAssets(f.dir,f.manifests,f.expected))})
test('rejects mixed source, failed acceptance, wrong architectures and target substitution',async()=>{for(const change of [m=>m[0].source='b'.repeat(40),m=>m[0].acceptance.passed=false,m=>m[0].architecture='x64',m=>m[0].platform='windows-x64',m=>m[0].asset.name='../outside.dmg']){const f=await fixture();change(f.manifests);await assert.rejects(verifyReleaseAssets(f.dir,f.manifests,f.expected))}})
