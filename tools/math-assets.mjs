import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')

// Packaging must honor the document's existing font-src policy. App fonts are
// local files; only self-contained HTML exports intentionally embed data URLs.
export async function verifyMathAssets(assets,fonts) {
  const names=await readdir(assets)
  const css=(await Promise.all(names.filter(name=>name.endsWith('.css')).map(name=>readFile(join(assets,name),'utf8')))).join('\n')
  assert.ok(!/url\(["']?data:font\//.test(css),'App font data URLs violate production font-src CSP')
  const expected=(await readdir(fonts)).filter(name=>name.endsWith('.woff2'))
  assert.equal(expected.length,20,'Pinned KaTeX font family set')
  const verified=[]
  for(const source of expected) {
    const stem=source.slice(0,-6)
    const candidates=names.filter(name=>name.startsWith(stem+'-')&&name.endsWith('.woff2'))
    assert.equal(candidates.length,1,'One local app font for '+source)
    assert.ok(css.includes(candidates[0]),'CSS must reference '+source)
    const original=await readFile(join(fonts,source)),actual=await readFile(join(assets,candidates[0]))
    assert.deepEqual(actual,original,'Exact pinned font bytes for '+source)
    verified.push({source,asset:candidates[0],sha256:sha(actual),size:actual.length})
  }
  return verified
}
