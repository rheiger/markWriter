import { createServer } from 'node:http'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLocalPrototype } from './update-prototype.mjs'

test('isolated manifest checks reject downgrade, prerelease, redirects, oversize and missing signatures', async t => {
  let response = { code: 200, body: '' }
  const server = createServer((_req, res) => { res.writeHead(response.code, response.headers); res.end(response.body) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const check = () => checkLocalPrototype(`${origin}/manifest`, '2.5.1', 'darwin-aarch64')
  const manifest = version => JSON.stringify({ version, platforms: { 'darwin-aarch64': { url: `${origin}/artifact`, signature: 'unverified' } } })
  response.body = manifest('2.6.0')
  assert.deepEqual(await check(), { kind: 'unverified-candidate', currentVersion: '2.5.1', version: '2.6.0' })
  response.body = manifest('2.5.0')
  assert.equal((await check()).kind, 'current')
  response.body = manifest('2.6.0-alpha.1')
  await assert.rejects(check(), /invalid stable/)
  response.body = JSON.stringify({ version: '2.6.0', platforms: {} })
  await assert.rejects(check(), /missing platform/)
  response.body = 'x'.repeat(16385)
  await assert.rejects(check(), /too large/)
  response = { code: 302, headers: { Location: `${origin}/manifest` }, body: '' }
  await assert.rejects(check(), /unexpected response/)
  response = { code: 204 }
  assert.equal((await check()).kind, 'current')
  await assert.rejects(checkLocalPrototype('https://example.com/', '2.5.1', 'darwin-aarch64'), /loopback/)
})
