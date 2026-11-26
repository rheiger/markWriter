import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Exactly one correlated renderer request must occur in the controlled preview interval.
export function summarizeFinderLogs(lines, executable, samePath = (left, right) => left === right) {
  const requests = new Map()
  for (const line of lines.split('\n')) {
    if (!line.startsWith('{')) continue
    let value
    try { value = JSON.parse(line) } catch { continue }
    if (typeof value.processImagePath !== 'string' || !samePath(value.processImagePath, executable) || typeof value.eventMessage !== 'string') continue
    const match = /^request=([0-9a-fA-F-]{36}) (start|completed|fallback)(?: elapsed_ms=(\d+))?$/.exec(value.eventMessage)
    if (!match) continue
    if (!Number.isInteger(value.processID) || value.processID <= 0 || !Number.isFinite(Date.parse(value.timestamp))) throw new Error('Renderer event lacks valid identity or timestamp')
    const [, id, state, elapsed] = match
    if ((state === 'start') !== (elapsed === undefined)) throw new Error('Malformed renderer event')
    const request = requests.get(id) ?? []
    request.push({ pid: value.processID, timestamp: value.timestamp, state, ...(elapsed === undefined ? {} : { elapsedMs: Number(elapsed) }) })
    requests.set(id, request)
  }
  if (requests.size !== 1) throw new Error(`Expected exactly one correlated renderer request, found ${requests.size}`)
  const [[id, events]] = requests
  if (events.length !== 2 || events[0].state !== 'start' || events[1].state === 'start' || events[0].pid !== events[1].pid || Date.parse(events[1].timestamp) < Date.parse(events[0].timestamp)) throw new Error('Missing, interleaved or mismatched renderer events')
  return { executable, requestId: id, pid: events[0].pid, started: events[0].timestamp, ended: events[1].timestamp, outcome: events[1].state, elapsedMs: events[1].elapsedMs, scope: 'One process request observed during controlled Finder selection; request ID does not encode a filename' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , file, executable] = process.argv
  const samePath = (left, right) => {
    try { return realpathSync(left) === realpathSync(right) } catch { return false }
  }
  console.log(JSON.stringify(summarizeFinderLogs(await readFile(file, 'utf8'), executable, samePath), null, 2))
}
