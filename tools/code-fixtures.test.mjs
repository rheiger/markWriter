import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { codeFixtureCases } from './code-fixtures.mjs'

test('code expectations are identical across LF, CRLF and bare-CR checkouts', async () => {
  const source = await readFile(new URL('./fixtures/code-highlighting-alpha3.md', import.meta.url), 'utf8')
  const lf = source.replace(/\r\n?/g, '\n')
  const expected = codeFixtureCases(lf).map(match => match.slice(0,3))
  assert.equal(expected.length,26)
  for (const ending of ['\r\n', '\r']) {
    const actual = codeFixtureCases(lf.replace(/\n/g,ending)).map(match => match.slice(0,3))
    assert.deepEqual(actual,expected)
  }
  assert.equal(expected[0][1],'c')
  assert.ok(expected.some(([,info])=>info==='plaintext'))
})

test('long-code native fixture covers the reported six-block aggregate without private content', async () => {
  const { longCodeFixture } = await import('./long-code-acceptance.mjs')
  const {source,blocks}=longCodeFixture()
  assert.deepEqual(blocks.map(block=>block.code.length),[4588,832,931,448,11246,8355])
  const parsed=codeFixtureCases(source)
  assert.equal(parsed.length,6)
  assert.ok(source.length>16*1024 && source.length<32*1024,'Exercises the previous document limit within the new separate Python/JSON budget')
  blocks.forEach((block,n)=>{
    assert.equal(parsed[n][1],block.language)
    assert.equal(parsed[n][2],block.code)
    assert.equal(block.code.split(block.marker).length-1,1,'Find marker is unique within its block')
    assert.equal(source.split(block.marker).length-1,1,'Find marker is unique in the whole document')
    assert.ok(block.code.split('\n').every(line=>line.length<=2048),'Retains the production individual-line safety limit')
    if(block.language==='json')assert.equal(JSON.parse(block.code)[block.marker],true)
  })
})
