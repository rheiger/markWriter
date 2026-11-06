import { useLayoutEffect, useRef, useState } from 'react'

// 40×40 is the supported insertion bound; numeric controls reach sizes beyond the visible grid.
export function TablePicker({ onInsert, onClose }: { onInsert: (rows: number, cols: number) => void; onClose: () => void }) {
  const [size, setSize] = useState({ rows: 1, cols: 1 })
  const [limits, setLimits] = useState({ rows: 5, cols: 5 })
  const [leftOffset, setLeftOffset] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const rect = root.current?.getBoundingClientRect()
      if (!rect) return
      const anchorLeft = root.current!.parentElement?.getBoundingClientRect().left ?? rect.left
      const left = Math.max(8, Math.min(anchorLeft, window.innerWidth - rect.width - 8))
      setLeftOffset(offset => Math.abs(offset - (left - anchorLeft)) < .5 ? offset : left - anchorLeft)
      // The panel may shift left as its grid grows, so its columns can use the
      // viewport's full available width rather than only the trigger's right side.
      const cols = Math.max(5, Math.min(16, Math.floor((window.innerWidth - 32) / 24)))
      const rows = Math.max(5, Math.min(16, Math.floor((window.innerHeight - rect.top - 150) / 24)))
      setLimits(previous => previous.cols === cols && previous.rows === rows ? previous : { cols, rows })
    }
    measure(); grid.current?.focus()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (root.current) observer?.observe(root.current)
    window.addEventListener('resize', measure)
    const outside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) onClose() }
    document.addEventListener('pointerdown', outside)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); document.removeEventListener('pointerdown', outside) }
  }, [onClose])
  const rows = Math.min(limits.rows, Math.max(5, size.rows + 1)), cols = Math.min(limits.cols, Math.max(5, size.cols + 1))
  const value = (number: number) => Math.min(40, Math.max(1, Number.isFinite(number) ? Math.floor(number) : 1))
  return <div ref={root} role="dialog" aria-label="Insert table" className="table-picker" style={{ left: leftOffset }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <div className="toolbar-dropdown-header"><output aria-live="polite">{size.cols} × {size.rows} · {size.cols * size.rows} cells</output></div>
    <div ref={grid} tabIndex={0} role="grid" aria-label="Table dimensions; arrow keys resize, Enter inserts" aria-rowcount={rows} aria-colcount={cols}
      className="table-grid" style={{ gridTemplateColumns: `repeat(${cols}, 24px)` }} onKeyDown={event => {
        const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
        if (delta[event.key]) { event.preventDefault(); const [r, c] = delta[event.key]; setSize(s => ({ rows: value(s.rows + r), cols: value(s.cols + c) })) }
        if (event.key === 'Enter') { event.preventDefault(); onInsert(size.rows, size.cols) }
      }}>
      {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => <button key={`${r}-${c}`} type="button" role="gridcell" tabIndex={-1}
        aria-label={`${c + 1} columns, ${r + 1} rows`} aria-selected={r < size.rows && c < size.cols}
        className={`table-cell${r < size.rows && c < size.cols ? ' active' : ''}`}
        onPointerMove={() => setSize(s => s.rows === r + 1 && s.cols === c + 1 ? s : { rows: r + 1, cols: c + 1 })}
        onClick={() => onInsert(r + 1, c + 1)} />))}
    </div>
    <div className="table-dimensions"><label>Columns<input type="number" min={1} max={40} value={size.cols} onChange={e => setSize(s => ({ ...s, cols: value(e.target.valueAsNumber) }))} /></label>
      <label>Rows<input type="number" min={1} max={40} value={size.rows} onChange={e => setSize(s => ({ ...s, rows: value(e.target.valueAsNumber) }))} /></label></div>
    <p>Rows include the header. Arrow keys or fields: up to 40 × 40.</p>
    <button type="button" onClick={() => onInsert(size.rows, size.cols)}>Insert table</button><button type="button" onClick={onClose}>Cancel</button>
  </div>
}
