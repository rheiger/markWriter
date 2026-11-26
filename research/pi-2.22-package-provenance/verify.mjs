import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'

const [sourceDir, expectedCommit, expectedRun, artifactsDir, finderFile] = process.argv.slice(2)
assert.ok(sourceDir && /^[a-f0-9]{40}$/.test(expectedCommit) && /^\d+$/.test(expectedRun) && artifactsDir && finderFile,
  'Usage: node verify.mjs SOURCE_CHECKOUT FULL_COMMIT RUN_ID ARTIFACTS_DIR REBUILT_FINDER_SCRIPT')
const read = readFileSync
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = path => JSON.parse(read(path, 'utf8'))
const run = (cmd, args) => execFileSync(cmd, args, {maxBuffer: 64 * 1024 * 1024})
const source = resolve(sourceDir)
const tracked = path => run('git', ['-C', source, 'show', expectedCommit + ':' + path])
assert.equal(run('git', ['-C', source, 'rev-parse', 'HEAD']).toString().trim(), expectedCommit)
run('git', ['-C', source, 'diff', '--exit-code', expectedCommit, '--', 'frontend', 'notices', 'native/quicklook'])

const notice = tracked('frontend/public/THIRD_PARTY_NOTICES.txt')
const workerDir = join(source, 'frontend/dist/assets')
function localWorker(pattern) {
  const files = readdirSync(workerDir).filter(path => pattern.test(path))
  assert.equal(files.length, 1, 'Clean production build must have one worker for ' + pattern)
  return ['assets/' + files[0], read(join(workerDir, files[0]))]
}
const renderWorker = localWorker(/^plantUmlWorker-[\w-]+\.js$/)
const validateWorker = localWorker(/^plantUmlValidateWorker-[\w-]+\.js$/)
const finder = read(finderFile)
const pkg = JSON.parse(tracked('frontend/package-lock.json')).packages['node_modules/@plantuml/core']
assert.equal(pkg.version, '1.2026.10')
const engine = read(join(source, 'frontend/node_modules/@plantuml/core/plantuml.js'))
assert.equal(sha(engine), 'c6664799aaa464319b5e1070a69850b93a7ea23ee41a23e920a8f2086e7da21c')

const metadataUrl = 'https://registry.npmjs.org/@plantuml%2fcore/1.2026.10'
const download = url => run('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', url])
const metadata = JSON.parse(download(metadataUrl))
assert.equal(metadata.gitHead, 'a00eddaf700c0681a642ddd11c4f95e0ade8cdc9')
assert.equal(metadata.dist.tarball, pkg.resolved)
assert.equal(metadata.dist.integrity, pkg.integrity)
const tarball = download(pkg.resolved)
assert.equal('sha512-' + createHash('sha512').update(tarball).digest('base64'), pkg.integrity)
assert.equal(sha(tarball), '00e3d2849d443dd77d6ca9bdf8aedc63bd26ff86025972b617cb96f4678655ca')
const tarEngine = execFileSync('tar', ['-xzOf', '-', 'package/plantuml.js'], {input:tarball, maxBuffer:16*1024*1024})
assert.ok(tarEngine.equals(engine), 'Local runtime differs from registry tarball')

const provenance = tracked('notices/PlantUML-1.2026.10-provenance.txt')
assert.ok(notice.includes(provenance))
for (const pin of [metadata.gitHead, 'e87d452e4bd70c77b9e19314a46c3d6971c148b6', '9d0fcb95caad5f205d849928087b2efa202be4d4']) {
  assert.ok(provenance.includes(pin), 'Missing source commit ' + pin)
}
// Check the published dependency chain independently of package-level MIT metadata.
const components = [
  {repository:'konsoletyper/teavm', tag:'0.16.0', commit:'e87d452e4bd70c77b9e19314a46c3d6971c148b6'},
  {repository:'ymnk/jzlib', tag:'1.1.3', commit:'9d0fcb95caad5f205d849928087b2efa202be4d4'},
]
for (const component of components) {
  const ref = 'refs/tags/' + component.tag
  const actual = run('git', ['ls-remote', 'https://github.com/' + component.repository + '.git', ref]).toString().trim()
  assert.equal(actual, component.commit + '\t' + ref)
}
function sourceEvidence(repository, commit, path, expectedFragments) {
  const url = 'https://raw.githubusercontent.com/' + repository + '/' + commit + '/' + path
  const data = download(url)
  for (const fragment of expectedFragments) assert.ok(data.includes(fragment), 'Source mismatch in ' + url + ': ' + fragment)
  return {url, sha256:sha(data), matched:expectedFragments}
}
const teavm = components[0], jzlib = components[1]
const upstreamSources = [
  sourceEvidence('plantuml/plantuml', metadata.gitHead, 'src/main/java/h/ST_Agraph_s.java',
    ['part of Smetana', 'Copyright (c) 2011 AT&T Intellectual Property', 'Eclipse Public License v1.0', 'class ST_Agraph_s']),
  sourceEvidence('plantuml/plantuml', metadata.gitHead, 'gradle/libs.versions.toml', ['"0.16.0"']),
  sourceEvidence(teavm.repository, teavm.commit, 'core/src/main/resources/org/teavm/backend/javascript/runtime.js',
    ['teavm_meta', 'Apache License', 'Alexey Andreev']),
  sourceEvidence(teavm.repository, teavm.commit, 'gradle/libs.versions.toml', ['com.jcraft:jzlib', '1.1.3']),
  sourceEvidence(jzlib.repository, jzlib.commit, 'src/main/java/com/jcraft/jzlib/GZIPException.java', ['class GZIPException']),
  sourceEvidence('plantuml/plantuml', metadata.gitHead, 'src/main/java/org/openpdf/text/ExceptionConverter.java',
    ['class ExceptionConverter', 'Kabutz']),
]
const sourceMap = JSON.parse(tracked('notices/registry-sources.json'))['@plantuml/core@1.2026.10']
const upstreamNotices = sourceMap.map(({url, path, sha256}) => {
  const pinned = tracked(path)
  assert.equal(sha(pinned), sha256)
  assert.ok(download(url).equals(pinned), 'Upstream source mismatch ' + url)
  assert.ok(notice.includes(pinned) && notice.includes(url), 'Missing packaged notice ' + url)
  return {url,sha256,bytes:pinned.length}
})
for (const text of ['/EPL-1.0.txt', '/LICENSE', '/NOTICE', '/LICENSE.md', '/LICENSE.txt', '/README', '/MPL-1.1.txt', '/MPL-2.0.txt']) {
  assert.ok(upstreamNotices.some(entry => entry.url.endsWith(text)), 'Missing pinned license source ' + text)
}
const markers = ['__plantumlSmetanaFallbackNoted', 'ST_Agraph_s', 'teavm_meta', 'jzlib', 'GZIPException', 'OpenPDF', 'DocumentException']
for (const bytes of [engine, renderWorker[1], finder]) {
  for (const marker of markers) {
    assert.ok(bytes.includes(marker), 'Missing compiled runtime marker ' + marker)
  }
}

// Tauri embeds a PHF of asset keys and complete Brotli streams in the executable.
// Only use a short Brotli prefix to shortlist offsets. A match requires decoding
// bytes from the executable and comparing the entire result to the source asset.
function verifyEmbedded(host, key, original) {
  assert.ok(host.includes('/' + key), 'Missing Tauri resource key ' + key)
  const prefix = brotliCompressSync(original, {params:{[constants.BROTLI_PARAM_QUALITY]:9}}).subarray(0, 4)
  for (let pos = host.indexOf(prefix); pos !== -1; pos = host.indexOf(prefix, pos + 1)) {
    let decoded
    try {
      decoded = brotliDecompressSync(host.subarray(pos), {info:true, maxOutputLength:original.length})
    } catch { continue }
    if (!original.equals(decoded.buffer)) continue
    const packedSize = decoded.engine.bytesWritten
    assert.ok(packedSize > 0 && pos + packedSize <= host.length)
    const packed = host.subarray(pos, pos + packedSize)
    assert.ok(brotliDecompressSync(packed, {maxOutputLength:original.length}).equals(original))
    return {key, offset:pos, compressedBytes:packedSize, compressedSha256:sha(packed),
      bytes:decoded.buffer.length, sha256:sha(decoded.buffer)}
  }
  throw new Error('Cannot find a byte-identical decoded Tauri asset for ' + key)
}

const macBundle = 'MarkWriter/MarkWriter.app/Contents/'
const extensionScript = macBundle + 'PlugIns/MarkWriterQuickLook.appex/Contents/Resources/quicklook-render.js'
const platforms = ['macos-arm64', 'windows-x64', 'ubuntu-26.04-x64']
const records = []
for (const platform of platforms) {
  const dir = join(artifactsDir, 'package-' + platform)
  const manifest = json(join(dir, platform + '.manifest.json'))
  assert.equal(manifest.product, 'MarkWriter')
  assert.equal(manifest.platform, platform)
  assert.equal(manifest.source, expectedCommit)
  assert.equal(String(manifest.buildRun), expectedRun)
  const {name, size, sha256} = manifest.asset
  assert.equal(basename(name), name)
  const file = join(dir, name)
  const bytes = read(file)
  assert.equal(bytes.length, size)
  assert.equal(sha(bytes), sha256)
  assert.ok(read(join(dir,'THIRD_PARTY_NOTICES.txt')).equals(notice), 'Release notice differs from source')
  const temporary = mkdtempSync(join(tmpdir(),'mw-notice-proof-'))
  try {
    let host
    let hostEntry
    let extension
    if (platform === 'macos-arm64') {
      hostEntry = macBundle + 'MacOS/markwriter'
      host = run('7z', ['x', '-so', file, hostEntry])
      const packaged = run('7z', ['x', '-so', file, extensionScript])
      assert.ok(packaged.equals(finder), 'Finder renderer differs from independent build')
      extension = {entry:extensionScript, bytes:packaged.length, sha256:sha(packaged)}
    } else if (platform === 'windows-x64') {
      hostEntry = 'markwriter.exe'
      host = run('7z', ['x', '-so', file, hostEntry])
    } else {
      hostEntry = 'usr/bin/markwriter'
      run('dpkg-deb', ['-x', file, temporary])
      host = read(join(temporary,hostEntry))
    }
    assert.equal(sha(host), manifest.binaryInspection.sha256, 'Builder installed a different executable')
    const assets = [['THIRD_PARTY_NOTICES.txt', notice], renderWorker, validateWorker].map(([key, original]) => {
      const entries = manifest.frontend.filter(entry => entry.path === key)
      assert.equal(entries.length, 1)
      assert.equal(entries[0].sha256, sha(original))
      return verifyEmbedded(host, key, original)
    })
    records.push({platform, artifact:manifest.asset, host:{entry:hostEntry,bytes:host.length,sha256:sha(host)},
      signing:manifest.signing.status, assets, ...(extension ? {extension} : {})})
  } finally { rmSync(temporary, {recursive:true,force:true}) }
}
console.log(JSON.stringify({source:expectedCommit, packageRun:expectedRun,
  npmRuntime:{name:metadata.name,version:pkg.version,metadataUrl,gitHead:metadata.gitHead,tarball:pkg.resolved,
    integrity:pkg.integrity,tarballSha256:sha(tarball),engineBytes:engine.length,engineSha256:sha(engine),
    compiledMarkers:markers}, upstreamReleases:components, upstreamSources, upstreamNotices, sourceProvenanceSha256:sha(provenance),
  sourceNotice:{bytes:notice.length, sha256:sha(notice)}, packages:records,
  scope:'Extracted executables, decoded Tauri resources and an independently rebuilt Finder script. UI navigation and display require separate observations.'}, null, 2))
