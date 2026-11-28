import assert from 'node:assert/strict'
import { MATH_WORKER_POLICY } from '../../tools/worker-response-acceptance.mjs'

async function fetchAsset(request, session, path) {
  return request('POST', `/session/${session}/execute/async`, {
    script: `
      const done = arguments[arguments.length - 1]
      fetch(arguments[0]).then(async response => {
        const bytes = await response.arrayBuffer()
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
        done({ status: response.status, url: response.url, type: response.headers.get('content-type'),
          bytes: bytes.byteLength, sha256: Array.from(digest, b => b.toString(16).padStart(2, '0')).join(''),
          policy: response.headers.get('content-security-policy') })
      }).catch(error => done({ error: String(error) }))
    `,
    args: ['/' + path],
  })
}

export async function verifyReleaseAssets(request, session, manifest) {
  const result = {}
  const assets = [
    ['worker', /^assets\/plantUmlWorker-[\w-]+\.js$/],
    ['validationWorker', /^assets\/plantUmlValidateWorker-[\w-]+\.js$/],
    ['notices', /^THIRD_PARTY_NOTICES\.txt$/],
  ]
  for (const [kind, pattern] of assets) {
    const matches = manifest.frontend.filter(asset => pattern.test(asset.path))
    assert.equal(matches.length, 1, 'Expected exactly one ' + kind)
    const expected = matches[0]
    const response = await fetchAsset(request, session, expected.path)
    assert.equal(response.status, 200, JSON.stringify(response))
    assert.equal(response.sha256, expected.sha256, expected.path)
    if (kind === 'notices') {
      assert.match(response.type, /^text\/plain(?:;|$)/i)
      assert.equal(response.sha256, '2078cf4c5242dcf56eb16b9eef81a207513e7e09ff34272ea11f2dbcfd282089')
    } else {
      assert.match(response.type, /^(?:text|application)\/(?:java|ecma)script(?:;|$)/i)
      assert.equal(response.policy, MATH_WORKER_POLICY)
    }
    result[kind] = { path: expected.path, ...response }
  }
  return result
}
