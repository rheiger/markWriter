import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { processInventory, ownedDescendants } from '../../tools/owned-process.mjs'
import { MATH_WORKER_POLICY } from '../../tools/worker-response-acceptance.mjs'

const sequence = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
const klass = '@startuml\nclass User {\n -id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
const theme = '@startuml\n!theme PI222Missing\n@enduml'
const malformed = '@startuml\nclass {\n@enduml'
const fence = source => '\x60\x60\x60plantuml\n' + source + '\n\x60\x60\x60\n'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function summarize(blocks) {
  return Array.from(blocks, node => {
    const svg = node.querySelector('svg')
    return { labels: svg ? Array.from(svg.querySelectorAll('text'), text => text.textContent) : null, source: node.querySelector('pre')?.textContent?.trimEnd() ?? null }
  })
}
function checkBlocks(blocks, fallback) {
  assert.equal(blocks.length, 2 + fallback.length)
  for (const [i, needed] of [['Alice', 'Bob', 'Request'], ['User', 'Order', 'id: int', 'owns']].entries()) {
    for (const label of needed) assert.ok(blocks[i].labels?.includes(label), JSON.stringify(blocks))
  }
  for (const [i, source] of fallback.entries()) {
    assert.equal(blocks[i + 2].labels, null)
    assert.equal(blocks[i + 2].source, source)
  }
}
export async function verifyWindowsPlantUml({ root, artifacts, fixture, driver, session, run, wait, mode, menu, dialog, openDocument, request }) {
  assert.equal(process.platform, 'win32')
  const manifest = JSON.parse(await readFile(join(root, 'candidate/windows-x64.manifest.json'), 'utf8'))
  const filename = 'pi222-plantuml.md'
  const path = join(fixture, filename)
  const exportPath = join(fixture, 'pi222-plantuml.html')
  const source = '# PI222 synthetic Windows fixture\n\n' + [sequence, klass, theme, malformed, sequence].map(fence).join('\n') + '\n[ordinary link](https://example.invalid/)\n'
  // Four PlantUML blocks are allowed per document. The repeated valid fifth block must remain source.
  const fallback = [theme, malformed, sequence]
  await writeFile(path, source)
  const started = performance.now()
  await openDocument(path, filename)
  await mode(false)
  const checkView = async selector => {
    return await wait(async () => {
      const blocks = await run(`return (${summarize})(document.querySelectorAll(arguments[0]))`, selector + ' [data-type=plantuml]')
      checkBlocks(blocks, fallback)
      return blocks
    }, 'two PlantUML diagrams and three source fallbacks in ' + selector)
  }
  const wysiwyg = await checkView('[data-active=true] .tiptap')
  const firstOpenMs = Math.round(performance.now() - started)
  const next = performance.now()
  await mode(true)
  const preview = await checkView('[data-active=true] .markwriter-preview')
  const previewSwitchMs = Math.round(performance.now() - next)
  const processes = ownedDescendants(await processInventory(), driver.pid)
  const webviews = processes.filter(p => p.path?.toLowerCase().endsWith('msedgewebview2.exe'))
  assert.ok(webviews.length && webviews.every(p => p.path.toLowerCase() === process.env.MARKWRITER_WEBVIEW_RUNTIME.toLowerCase()))
  const appProcesses = processes.filter(p => p.path?.toLowerCase() === process.env.MARKWRITER_BINARY.toLowerCase() || webviews.includes(p))
  const pids = appProcesses.map(p => p.pid)
  assert.ok(pids.length > webviews.length && pids.every(Number.isSafeInteger))
  const memory = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64,PeakWorkingSet64 | ConvertTo-Json -AsArray -Compress`], { encoding: 'utf8' }))
  const workers = []
  for (const name of ['plantUmlWorker-', 'plantUmlValidateWorker-']) {
    const assets = manifest.frontend.filter(x => x.path.startsWith('assets/' + name) && x.path.endsWith('.js'))
    assert.equal(assets.length, 1)
    const expected = assets[0]
    const response = await request('POST', `/session/${session}/execute/async`, {
      script: `const done=arguments[arguments.length-1];fetch(arguments[0]).then(async r=>{ const bytes=await r.arrayBuffer(); const digest=await crypto.subtle.digest('SHA-256', bytes); done({status:r.status,policy:r.headers.get('content-security-policy'),type:r.headers.get('content-type'),bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}); }).catch(e=>done({error:String(e)}))`,
      args: ['/' + expected.path],
    })
    assert.equal(response.sha256, expected.sha256, JSON.stringify(response))
    assert.equal(response.status, 200)
    assert.match(response.type, /^(?:text|application)\/(?:java|ecma)script(?:;|$)/i)
    assert.equal(response.policy, MATH_WORKER_POLICY)
    workers.push({ filename: expected.path, ...response })
  }
  const beginExport = performance.now()
  await menu('File', 'Export as HTML...')
  await dialog(exportPath)
  const html = await wait(() => readFile(exportPath, 'utf8'), 'OS Save dialog exported HTML')
  const exportMs = Math.round(performance.now() - beginExport)
  const exported = await run(`
    const doc = new DOMParser().parseFromString(arguments[0], 'text/html')
    return {
      blocks: (${summarize})(doc.querySelectorAll('[data-type=plantuml]')),
      link: doc.querySelector('a')?.getAttribute('href'),
      activeElements: doc.querySelectorAll('script, img, iframe, link, object, embed').length,
      stylesWithExternalResources: [...doc.querySelectorAll('style')].some(node => /url\\(\\s*["']?(?:https?:|file:|\\/\\/)/i.test(node.textContent))
    }
  `, html)
  checkBlocks(exported.blocks, fallback)
  assert.equal(exported.link, 'https://example.invalid/')
  assert.equal(exported.activeElements, 0)
  assert.equal(exported.stylesWithExternalResources, false)
  assert.equal(await readFile(path, 'utf8'), source)
  await writeFile(join(artifacts, 'pi222-preview.png'), Buffer.from(await request('GET', `/session/${session}/screenshot`), 'base64'))
  await writeFile(join(artifacts, 'pi222-export.html'), html)
  await writeFile(join(artifacts, filename), source)
  await writeFile(join(artifacts, 'pi222-windows.json'), JSON.stringify({
    passed: true, sourceCommit: manifest.source, packageRun: manifest.buildRun, asset: manifest.asset, binary: manifest.binaryInspection,
    testRun: process.env.GITHUB_RUN_ID, harnessCommit: process.env.GITHUB_SHA, os: process.env.ImageOS, image: process.env.ImageVersion,
    webviewRuntime: process.env.MARKWRITER_WEBVIEW_RUNTIME,
    openedSourceSHA256: sha256(source), sourceUnchanged: true, exportSHA256: sha256(html), exportBytes: Buffer.byteLength(html),
    workers, wysiwyg, preview, exported, firstOpenThroughNativeDialogMs: firstOpenMs, previewSwitchMs, exportThroughNativeDialogMs: exportMs,
    processWorkingSetSampleAfterPreview: memory,
  }, null, 2))
}
