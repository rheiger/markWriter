import { useEffect, useRef } from 'react'
import { plantumlRenderer } from '../lib/plantumlRenderer'

export function PlantUmlRenderer({ chart, owner, active = true, withinBudget = true }: { chart: string; owner: string; active?: boolean; withinBudget?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ chart, owner, active, withinBudget }); latest.current = { chart, owner, active, withinBudget }
  useEffect(() => {
    const container = ref.current
    if (!container || !active) return
    const abort = new AbortController()
    const valid = () => !abort.signal.aborted && container.isConnected && latest.current.active && latest.current.chart === chart && latest.current.owner === owner && latest.current.withinBudget === withinBudget
    const showSource = (message: string) => {
      container.replaceChildren()
      const status = document.createElement('div'), source = document.createElement('pre')
      status.setAttribute('role', 'status'); status.textContent = message
      source.textContent = chart; container.append(status, source)
    }
    if (!withinBudget) { showSource('PlantUML document budget exceeded'); return () => abort.abort() }
    showSource('Rendering PlantUML…')
    plantumlRenderer.render(chart, owner, abort.signal).then(svg => { if (valid()) container.innerHTML = svg }).catch(error => {
      if (!valid()) return
      showSource(`PlantUML unavailable: ${error instanceof Error ? error.message : 'rendering failed'}`)
    })
    return () => abort.abort()
  }, [chart, owner, active, withinBudget])
  return <div ref={ref} className="plantuml-diagram" aria-label="PlantUML diagram" />
}
