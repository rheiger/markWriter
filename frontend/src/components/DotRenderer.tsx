import { useEffect, useRef } from 'react'
import { dotRenderer } from '../lib/dotRenderer'

export function DotRenderer({ chart, owner, active = true }: { chart: string; owner: string; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ chart, owner, active })
  latest.current = { chart, owner, active }
  useEffect(() => {
    const container = ref.current
    if (!container || !active) return
    const abort = new AbortController()
    const valid = () => !abort.signal.aborted && container.isConnected && latest.current.active && latest.current.chart === chart && latest.current.owner === owner
    container.removeAttribute('role')
    container.textContent = 'Rendering DOT…'
    dotRenderer.render(chart, owner, abort.signal).then(svg => {
      if (valid()) container.innerHTML = svg
    }).catch(error => {
      if (valid()) { container.textContent = `DOT error: ${error.message}`; container.setAttribute('role', 'status') }
    })
    return () => abort.abort()
  }, [chart, owner, active])
  return <div ref={ref} className="dot-diagram" aria-label="DOT diagram" />
}
