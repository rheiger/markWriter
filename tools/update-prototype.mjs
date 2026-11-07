// Isolated loopback-only feasibility experiment. Never use for product updates:
// it does not authenticate metadata or verify Tauri artifact signatures.
const MAX_MANIFEST = 16 * 1024
const LIMIT = 999_999_999
function stableVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw Error('invalid stable version')
  const parts = value.split('.').map(Number)
  if (parts.some(value => !Number.isSafeInteger(value) || value > LIMIT)) throw Error('invalid stable version')
  return parts
}
function isNewer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}
export async function checkLocalPrototype(endpoint, currentVersion, platform, { timeoutMs = 2000 } = {}) {
  const current = stableVersion(currentVersion)
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash) throw Error('loopback endpoint required')
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
  if (response.status === 204) return { kind: 'current', version: currentVersion }
  if (response.status !== 200) throw Error('unexpected response')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_MANIFEST) throw Error('manifest too large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const version = stableVersion(manifest.version)
  if (!isNewer(version, current)) return { kind: 'current', version: currentVersion }
  const artifact = manifest.platforms?.[platform]
  if (!artifact || typeof artifact.signature !== 'string' || !artifact.signature || typeof artifact.url !== 'string') throw Error('missing platform artifact')
  const artifactUrl = new URL(artifact.url)
  if (artifactUrl.origin !== url.origin || artifactUrl.username || artifactUrl.password || artifactUrl.hash) throw Error('artifact must stay on loopback origin')
  return { kind: 'unverified-candidate', currentVersion, version: manifest.version }
}
