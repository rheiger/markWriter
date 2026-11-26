// Keep the embedded engine's distribution record tied to the npm lock and
// check the text users actually receive in the offline notices.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root))
const sha256 = data => createHash('sha256').update(data).digest('hex')

test('bundled PlantUML notices identify the locked engine and retain upstream texts', async () => {
  const lock = JSON.parse(await read('frontend/package-lock.json'))
  const pkg = lock.packages['node_modules/@plantuml/core']
  const key = `@plantuml/core@${pkg.version}`
  const provenance = await read(`notices/PlantUML-${pkg.version}-provenance.txt`)
  const engine = await read('frontend/node_modules/@plantuml/core/plantuml.js')
  const bundle = await read('frontend/public/THIRD_PARTY_NOTICES.txt')
  assert.ok(provenance.includes(pkg.resolved), 'tarball URL differs from lock')
  assert.ok(provenance.includes(sha256(engine)), 'engine differs from documented source')
  assert.ok(bundle.includes(provenance), 'offline provenance text missing or altered')

  const supplements = JSON.parse(await read('notices/registry-sources.json'))
  const sources = supplements[key]
  const expected = ['EPL-1.0.txt', 'LICENSE', 'NOTICE', 'LICENSE.txt', 'README', 'LICENSE.md', 'MPL-1.1.txt', 'MPL-2.0.txt']
  assert.deepEqual(sources.map(source => source.url.split('/').at(-1)).sort(), expected.sort())
  const start = bundle.indexOf(`\n${key}\n`)
  assert.notEqual(start, -1, 'offline engine notice section missing')
  const end = bundle.indexOf('\n' + '='.repeat(72) + '\n', start)
  const section = bundle.subarray(start, end === -1 ? bundle.length : end)
  for (const { url, path, sha256: expectedHash } of sources) {
    const data = await read(path)
    assert.equal(sha256(data), expectedHash, url)
    assert.ok(section.includes(`--- ${url} [SHA256 ${expectedHash}] ---\n`), url)
    assert.ok(section.includes(data), `upstream text omitted or changed: ${url}`)
  }
})
