import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve, basename, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { verifyReleaseAssets, peArchitecture } from './release-integrity.mjs'
import { verifyDesktopIconSources } from './icon-integrity.mjs'
const root=resolve(import.meta.dirname,'..'), assets=join(root,'release-assets'), args=process.argv.slice(2)
const sha=data=>createHash('sha256').update(data).digest('hex')
const json=async path=>JSON.parse(await readFile(join(root,path),'utf8'))
const version=(await json('frontend/package.json')).version
function command(file,args){return execFileSync(file,args,{encoding:'utf8',cwd:root}).trim()}
async function files(path){const result=[];for(const entry of await readdir(path,{withFileTypes:true})){const name=join(path,entry.name);if(entry.isDirectory())result.push(...await files(name));else result.push(name)}return result}
async function check(){
 assert.equal((await json('package.json')).version,version);assert.equal((await json('frontend/package-lock.json')).version,version);assert.equal((await json('frontend/package-lock.json')).packages[''].version,version);assert.equal((await json('src-tauri/tauri.conf.json')).version,version)
 for(const path of ['src-tauri/Cargo.toml','src-tauri/Cargo.lock'])assert.ok((await readFile(join(root,path),'utf8')).replaceAll('\r\n','\n').includes(`name = "markwriter"\nversion = "${version}"`),'Native version '+path)
 assert.equal(version,'2.1.0-alpha3')
 await verifyDesktopIconSources(root)
 if(process.env.GITHUB_REF_TYPE==='tag')assert.equal(process.env.GITHUB_REF_NAME,'v'+version)
 console.log('All application version metadata:',version)
}
async function checkFrontend(){
 await check();const paths=await files(join(root,'frontend/dist'))
 assert.ok(paths.some(path=>basename(path)==='THIRD_PARTY_NOTICES.txt'),'Bundled notices required')
 for(const path of paths){assert.ok(!/\.(?:py|pyc|pyd)$/i.test(path));if(path.endsWith('.js'))assert.ok(!(await readFile(path,'utf8')).includes('__MARKWRITER_ACCEPTANCE__'),'Production acceptance bridge exclusion')}
 const workers=paths.filter(path=>/^dotWorker-[^/]+\.js$/.test(basename(path)));assert.equal(workers.length,1,'One local worker bundle')
 console.log('Production frontend contains one bundled DOT worker and no acceptance bridge/Python assets')
}
if(args.includes('--check'))await check()
if(args.includes('--check-frontend'))await checkFrontend()
if(args.includes('--collect')){
 await checkFrontend();await mkdir(assets,{recursive:true});const platform=args[args.indexOf('--collect')+1]
 const expected={ 'macos-arm64':['darwin','arm64','.dmg'], 'windows-x64':['win32','x64','.exe'], 'ubuntu-26.04-x64':['linux','x64','.deb'] }[platform];assert.ok(expected)
 assert.equal(process.platform,expected[0]);assert.equal(process.arch,expected[1])
 const packageName=`MarkWriter_${version}_${{'macos-arm64':'aarch64','windows-x64':'x64-setup','ubuntu-26.04-x64':'amd64'}[platform]}${expected[2]}`
 // Cargo caches can contain previous-version packages; select current bytes by
 // exact Tauri filename while retaining older local artifacts unchanged.
 const packages=(await files(join(root,'src-tauri/target/release/bundle'))).filter(path=>basename(path)===packageName && !relative(join(root,'src-tauri/target/release/bundle'),path).split(/[\\/]/).includes('macos'))
 assert.equal(packages.length,1,'Exactly one requested installation format')
 const file=`MarkWriter-${version}-${platform}${expected[2]}`;await copyFile(packages[0],join(assets,file))
 const data=await readFile(join(assets,file));const acceptance=await json('package-acceptance-results/result.json');assert.equal(acceptance.passed,true)
 const iconSources=await verifyDesktopIconSources(root)
 let baseline,signing,binaryInspection,iconInspection
 if(process.platform==='darwin'){
  const binary=join(acceptance.installed,'MarkWriter.app/Contents/MacOS/markwriter')
  assert.equal(command('lipo',['-archs',binary]),'arm64')
  binaryInspection={format:'Mach-O',architecture:'arm64',sha256:sha(await readFile(binary)),details:command('file',['-b',binary])}
  baseline={os:command('sw_vers',[]),webview:command('/usr/bin/defaults',['read','/System/Library/Frameworks/WebKit.framework/Resources/Info','CFBundleVersion'])}
  const app=join(acceptance.installed,'MarkWriter.app')
  // Recheck actual installed bytes during collection, rather than trusting logs.
  command('codesign',['--verify','--deep','--strict',app])
  const details=await readFile(join(root,'package-acceptance-results/signature.txt'),'utf8')
  assert.ok(details.includes('Signature=adhoc') && details.includes('Sealed Resources version=2'),'Sealed ad-hoc bundle required')
  signing={status:'ad-hoc',sealed:true,strictVerified:true,trusted:false,notarized:false,details}
  const iconName=command('plutil',['-extract','CFBundleIconFile','raw',join(app,'Contents/Info.plist')]);assert.equal(iconName,'icon.icns')
  const installedIcon=join(app,'Contents/Resources',iconName),iconHash=sha(await readFile(installedIcon))
  assert.equal(iconHash,iconSources.find(icon=>icon.path.endsWith('.icns')).sha256,'Installed macOS icon bytes')
  iconInspection={verified:true,method:'Installed bundle CFBundleIconFile and source-byte equality',installed:[{path:installedIcon,sha256:iconHash}],sources:iconSources}
 }else if(process.platform==='linux'){
  const binary=process.env.MARKWRITER_BINARY,details=command('file',['-b',binary])
  assert.ok(details.startsWith('ELF 64-bit LSB') && details.includes('x86-64'),'Installed ELF architecture')
  binaryInspection={format:'ELF',architecture:'x64',sha256:sha(await readFile(binary)),details}
  baseline={os:await readFile('/etc/os-release','utf8'),kernel:command('uname',['-r']),webview:command('pkg-config',['--modversion','webkit2gtk-4.1'])};assert.ok(baseline.os.includes('VERSION_ID="26.04"'))
  baseline.packageName=command('dpkg-deb',['--field',packages[0],'Package'])
  assert.equal(baseline.packageName,'mark-writer')
  signing={status:'unsigned',trusted:false};assert.ok(command('dpkg-deb',['--field',packages[0],'Version']).includes(version));assert.equal(command('dpkg-deb',['--field',packages[0],'Architecture']),'amd64')
  const desktopPath='/usr/share/applications/MarkWriter.desktop',desktop=await readFile(desktopPath,'utf8')
  assert.match(desktop,/^Icon=markwriter$/m,'Desktop entry native icon identity')
  const installed=[]
  for(const icon of iconSources.filter(icon=>icon.dimensions)){
   // Tauri 2.8.3 keeps physical PNG dimensions and adds @2 for retina filenames.
   // https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.8.3/crates/tauri-bundler/src/bundle/linux/freedesktop/mod.rs
   const size=icon.dimensions[0],density=icon.path.includes('@2x')?'@2':'',path=`/usr/share/icons/hicolor/${size}x${size}${density}/apps/markwriter.png`,hash=sha(await readFile(path))
   assert.equal(hash,icon.sha256,'Installed Linux icon bytes: '+path);installed.push({path,sha256:hash,dimensions:icon.dimensions})
  }
  iconInspection={verified:true,method:'Installed hicolor icon bytes and desktop entry',desktop:{path:desktopPath,sha256:sha(desktop)},installed,sources:iconSources}
 }else{
  const installedBinary=await readFile(process.env.MARKWRITER_BINARY);assert.equal(peArchitecture(installedBinary),'x64');binaryInspection={format:'PE',architecture:peArchitecture(installedBinary),sha256:sha(installedBinary)}
  assert.ok(acceptance.actualWebviewPaths?.every(p=>p.toLowerCase()===process.env.MARKWRITER_WEBVIEW_RUNTIME?.toLowerCase()) && acceptance.actualWebviewPaths.length)
  baseline=JSON.parse(command('pwsh',['-NoProfile','-Command',`$o=Get-CimInstance Win32_OperatingSystem;$w=Get-Item -LiteralPath $env:MARKWRITER_WEBVIEW_RUNTIME;@{os=$o.Caption;version=$o.Version;build=$o.BuildNumber;webview=$w.VersionInfo.FileVersion;webviewPath=$w.FullName}|ConvertTo-Json -Compress`]))
  const status=command('pwsh',['-NoProfile','-Command',`(Get-AuthenticodeSignature -LiteralPath '${packages[0].replaceAll("'","''")}').Status.ToString()`]);assert.equal(status,'NotSigned');signing={status:'unsigned',authenticode:status,trusted:false}
  const nativeIcon=JSON.parse(command('pwsh',['-NoProfile','-File',join(root,'tools/verify-installed-icon-windows.ps1'),'-Binary',process.env.MARKWRITER_BINARY,'-Reference',join(root,'src-tauri/icons/32x32.png'),'-Output',join(root,'package-acceptance-results/native-associated-icon.png')]))
  assert.equal(nativeIcon.verified,true)
  iconInspection={...nativeIcon,sources:iconSources,sha256:sha(await readFile(nativeIcon.preview))}
 }
 const frontend=[];for(const path of await files(join(root,'frontend/dist')))frontend.push({path:relative(join(root,'frontend/dist'),path).split(/[\\/]/).join('/'),sha256:sha(await readFile(path))})
 const manifest={schemaVersion:1,product:'MarkWriter',technology:'Tauri 2',version,source:process.env.GITHUB_SHA??command('git',['rev-parse','HEAD']),buildRun:process.env.GITHUB_RUN_ID??null,buildUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,platform,architecture:process.arch,asset:{name:file,size:data.length,sha256:sha(data)},signing,iconInspection,baseline,binaryInspection,runner:{image:process.env.ImageOS??null,imageVersion:process.env.ImageVersion??null},toolchain:{node:process.version,rust:command('rustc',['--version']),tauriCli:JSON.parse(await readFile(join(root,'frontend/node_modules/@tauri-apps/cli/package.json'),'utf8')).version},frontend,acceptance}
 await writeFile(join(assets,`${platform}.manifest.json`),JSON.stringify(manifest,null,2)+'\n')
 await copyFile(join(root,'frontend/public/THIRD_PARTY_NOTICES.txt'),join(assets,'THIRD_PARTY_NOTICES.txt'))
 await copyFile(join(root,'docs/install-alpha3.md'),join(assets,'INSTALL-UPGRADE-ROLLBACK.md'))
 console.log('Collected',file,manifest.asset.sha256)
}
if(args.includes('--aggregate')){
 const manifests=await Promise.all((await readdir(assets)).filter(name=>name.endsWith('.manifest.json')).map(async name=>JSON.parse(await readFile(join(assets,name),'utf8'))))
 await verifyReleaseAssets(assets,manifests,{version,source:process.env.GITHUB_SHA})
 await writeFile(join(assets,'release-manifest.json'),JSON.stringify({schemaVersion:1,version,source:process.env.GITHUB_SHA,prerelease:true,makeLatest:false,platforms:manifests},null,2)+'\n')
 const sums=[];for(const name of (await readdir(assets)).filter(n=>n!=='SHA256SUMS').sort())sums.push(`${sha(await readFile(join(assets,name)))}  ${name}`)
 await writeFile(join(assets,'SHA256SUMS'),sums.join('\n')+'\n')
 console.log('Verified final assets and generated SHA256SUMS')
}
