import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { codeFixtureCases } from './code-fixtures.mjs'

test('code expectations are identical across LF, CRLF and bare-CR checkouts', async () => {
  const source = await readFile(new URL('./fixtures/code-highlighting-alpha3.md', import.meta.url), 'utf8')
  const lf = source.replace(/\r\n?/g, '\n')
  const expected = codeFixtureCases(lf).map(match => match.slice(0,3))
  assert.equal(expected.length,22)
  for (const ending of ['\r\n', '\r']) {
    const actual = codeFixtureCases(lf.replace(/\n/g,ending)).map(match => match.slice(0,3))
    assert.deepEqual(actual,expected)
  }
  assert.equal(expected[0][1],'c')
  assert.ok(expected.some(([,info])=>info==='plaintext'))
})
