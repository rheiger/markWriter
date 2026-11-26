import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Process-level observations only: renderer requests have no correlation ID.
export function summarizeFinderLogs(lines, executable, samePath = (left, right) => left === right) {
  const events = []
  for (const line of lines.split('\n')) {
    if (!line.startsWith('{')) continue
    let value
    try { value = JSON.parse(line) } catch { continue }
    if (typeof value.processImagePath !== 'string' || !samePath(value.processImagePath, executable) || typeof value.eventMessage !== 'string') continue
    if (!Number.isInteger(value.processID) || value.processID <= 0 || typeof value.timestamp !== 'string') throw new Error('Renderer event lacks process ID or timestamp')
    events.push({ pid: value.processID, timestamp: value.timestamp, message: value.eventMessage })
  }
  if (!events.length) throw new Error('No renderer events from the tested extension')
  return { executable, scope: 'Uncorrelated process events; selected preview and request timing are not established', events }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , file, executable] = process.argv
  const samePath = (left, right) => {
    try { return realpathSync(left) === realpathSync(right) } catch { return false }
  }
  console.log(JSON.stringify(summarizeFinderLogs(await readFile(file, 'utf8'), executable, samePath), null, 2))
}
