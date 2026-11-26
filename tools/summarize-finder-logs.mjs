import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Only renderer events emitted by the tested, extracted extension count.
export function summarizeFinderLogs(lines, executable, samePath = (left, right) => left === right) {
  const events = []
  for (const line of lines.split('\n')) {
    if (!line.startsWith('{')) continue
    let value
    try { value = JSON.parse(line) } catch { continue }
    if (typeof value.processImagePath === 'string' && samePath(value.processImagePath, executable) && typeof value.eventMessage === 'string') events.push(value)
  }
  const start = events.find(event => event.eventMessage === 'Starting local renderer')
  const end = events.find(event => event.eventMessage === 'Local renderer completed' || event.eventMessage.startsWith('Fallback:'))
  if (!start || !end || start.processID !== end.processID) throw new Error('No matched renderer start and outcome from the tested extension')
  const startMs = Date.parse(start.timestamp)
  const endMs = Date.parse(end.timestamp)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) throw new Error('Invalid renderer event timestamps')
  return { executable, pid: start.processID, started: start.timestamp, finished: end.timestamp, rendererElapsedMs: endMs - startMs, outcome: end.eventMessage }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , file, executable] = process.argv
  const samePath = (left, right) => {
    try { return realpathSync(left) === realpathSync(right) } catch { return false }
  }
  console.log(JSON.stringify(summarizeFinderLogs(await readFile(file, 'utf8'), executable, samePath), null, 2))
}
