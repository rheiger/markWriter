import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// The direct probe issues five requests serially, without any other renderer.
export function verifyDirectLogs(lines, executable, samePath = (a, b) => a === b) {
  const requests = []
  let current = null
  let pid = null
  for (const line of lines.split('\n')) {
    if (!line.startsWith('{')) continue
    let value
    try { value = JSON.parse(line) } catch { continue }
    if (typeof value.processImagePath !== 'string' || !samePath(value.processImagePath, executable) || typeof value.eventMessage !== 'string') continue
    if (!Number.isInteger(value.processID) || value.processID <= 0) throw new Error('Missing renderer process identity')
    if (pid !== null && pid !== value.processID) throw new Error('Renderer process changed')
    pid = value.processID
    const match = /^request=([0-9a-fA-F-]{36}) (start|completed|fallback)(?: elapsed_ms=(\d+))?$/.exec(value.eventMessage)
    if (match) {
      const [, id, state, elapsed] = match
      if (state === 'start') {
        if (current || elapsed !== undefined || requests.some(item => item.id === id)) throw new Error('Overlapping or duplicate renderer request')
        current = { id, reasons: [] }
      } else {
        if (!current || current.id !== id || elapsed === undefined) throw new Error('Unmatched renderer outcome')
        requests.push({ ...current, outcome: state, elapsedMs: Number(elapsed) })
        current = null
      }
    } else if (value.eventMessage.startsWith('Fallback:')) {
      if (!current) throw new Error('Unattributed fallback reason')
      current.reasons.push(value.eventMessage)
    }
  }
  if (current || requests.length !== 5) throw new Error('Expected five complete renderer requests')
  if (requests.map(item => item.outcome).join(',') !== 'completed,completed,fallback,fallback,completed') throw new Error('Unexpected renderer outcomes')
  if (!requests[3].reasons.includes('Fallback: renderer timed out')) throw new Error('CPU-bound request was not stopped by the native deadline')
  return { scope: 'Five sequential direct synthetic WebKit requests; not Finder or packaged-extension acceptance', pid, requests }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , file, executable] = process.argv
  const samePath = (left, right) => {
    try { return realpathSync(left) === realpathSync(right) } catch { return false }
  }
  console.log(JSON.stringify(verifyDirectLogs(await readFile(file, 'utf8'), executable, samePath), null, 2))
}
