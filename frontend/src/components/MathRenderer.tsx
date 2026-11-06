import { useEffect, useRef } from 'react'
import 'katex/dist/katex.min.css'
import { mathRenderer, type MathBudget } from '../lib/mathRenderer'
import './MathRenderer.css'

export function MathRenderer({ chart, owner, budget, active = true }: { chart: string; owner: string; budget: MathBudget; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ chart, owner, budget, active })
  latest.current = { chart, owner, budget, active }
  useEffect(() => {
    const container = ref.current
    if (!container || !active) return
    const abort = new AbortController()
    let release: (() => void) | undefined
    const valid = () => !abort.signal.aborted && container.isConnected && latest.current.active && latest.current.chart === chart && latest.current.owner === owner && latest.current.budget === budget
    container.removeAttribute('role')
    container.textContent = 'Rendering math…'
    mathRenderer.render(chart, owner, budget, abort.signal).then(result => {
      if (valid()) { release = result.release; container.innerHTML = result.html }
      else result.release()
    }).catch(error => {
      if (valid()) {
        container.replaceChildren()
        const status = document.createElement('div'); status.setAttribute('role', 'status'); status.textContent = `Math error: ${error.message}`
        const source = document.createElement('pre'); source.textContent = chart
        container.append(status, source)
      }
    })
    return () => { abort.abort(); release?.() }
  }, [chart, owner, budget, active])
  return <div ref={ref} className="math-render" aria-label="Mathematical expression" />
}
