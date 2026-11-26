import { useEffect, useRef } from 'react'
import { plantumlRenderer } from '../lib/plantumlRenderer'

export function PlantUmlRenderer({ chart, owner, active = true }: { chart: string; owner: string; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ chart, owner, active }); latest.current = { chart, owner, active }
  useEffect(() => {
    const container = ref.current
    if (!container || !active) return
    const abort = new AbortController()
    const valid = () => !abort.signal.aborted && container.isConnected && latest.current.active && latest.current.chart === chart && latest.current.owner === owner
    container.removeAttribute('role'); container.textContent = 'Rendering PlantUML…'
    plantumlRenderer.render(chart, owner, abort.signal).then(svg => { if (valid()) container.innerHTML = svg }).catch(error => {
      if (!valid()) return
      container.replaceChildren()
      const status = document.createElement('div'), source = document.createElement('pre')
      status.setAttribute('role', 'status'); status.textContent = `PlantUML unavailable: ${error instanceof Error ? error.message : 'rendering failed'}`
      source.textContent = chart; container.append(status, source)
    })
    return () => abort.abort()
  }, [chart, owner, active])
  return <div ref={ref} className="plantuml-diagram" aria-label="PlantUML diagram" />
}
