import { useEffect, useRef } from 'react'
import { dotRenderer } from '../lib/dotRenderer'

export function DotRenderer({ chart, owner, active = true }: { chart: string; owner: string; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = ref.current
    if (!container || !active) return
    const abort = new AbortController()
    container.removeAttribute('role')
    container.textContent = 'Rendering DOT…'
    dotRenderer.render(chart, owner, abort.signal).then(svg => {
      if (!abort.signal.aborted && container.isConnected) container.innerHTML = svg
    }).catch(error => {
      if (!abort.signal.aborted && container.isConnected) { container.textContent = `DOT error: ${error.message}`; container.setAttribute('role', 'status') }
    })
    return () => abort.abort()
  }, [chart, owner, active])
  return <div ref={ref} className="dot-diagram" aria-label="DOT diagram" />
}
