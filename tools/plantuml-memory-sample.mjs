import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)

// Linux observation only: sum sampled RSS for the exact executable and its
// descendants. Shared pages can be counted twice and short peaks can be missed.
export function samplePlantUmlProcessMemory(binary) {
  const samples = []
  let running = false, pending = Promise.resolve()
  const sample = async () => {
    if (running) return
    running = true
    try {
      const { stdout } = await exec('ps', ['-eo', 'pid=,ppid=,rss=,args='])
      const processes = stdout.split('\n').flatMap(line => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)
        return match ? [{ pid:+match[1], parent:+match[2], rss:+match[3], args:match[4] }] : []
      })
      const root = processes.find(p => p.args === binary || p.args.startsWith(binary + ' '))
      if (!root) return
      const ids = new Set([root.pid])
      let changed = true
      while (changed) {
        changed = false
        for (const process of processes) if (ids.has(process.parent) && !ids.has(process.pid)) { ids.add(process.pid); changed = true }
      }
      const descendants = processes.filter(p => ids.has(p.pid))
      samples.push({ ms:Date.now(), kib:descendants.reduce((sum, p) => sum + p.rss, 0), processes:descendants.length })
    } finally { running = false }
  }
  const timer = setInterval(() => { if (!running) pending = sample().catch(() => {}) }, 250)
  return { stop:async () => { clearInterval(timer); await pending; return { count:samples.length, peakSampledRssKiB:Math.max(0, ...samples.map(s => s.kib)), maxProcesses:Math.max(0, ...samples.map(s => s.processes)), description:'sampled sum of RSS for app and descendant processes; shared pages may be double counted and short peaks missed' } } }
}
