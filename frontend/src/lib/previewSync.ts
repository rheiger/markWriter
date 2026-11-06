import { EditorView } from '@codemirror/view'
import { foldedRanges, unfoldEffect } from '@codemirror/language'
import { sourceCoordinates } from './sourceCoordinates'
import { sourceOffset, renderedOffset, type PreviewMap } from './sourceMap'

export interface Anchor { source: number; preview: number }
type Pane = 'source' | 'preview'
export function interpolateAnchors(anchors: Anchor[], value: number, pane: Pane): number {
  const other = pane === 'source' ? 'preview' : 'source'
  const sorted = anchors.filter((a, i) => !i || a[pane] > anchors[i - 1][pane] + .5)
  if (!sorted.length) return 0
  if (value <= sorted[0][pane]) return sorted[0][other]
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i]
    if (value <= b[pane]) return a[other] + (b[other] - a[other]) * (value - a[pane]) / (b[pane] - a[pane])
  }
  return sorted[sorted.length - 1][other]
}

export function previewPoint(root: HTMLElement, map: PreviewMap, node: Node, offset: number, bias: number): { position: number; exact: boolean } | null {
  if (!root.contains(node)) return null
  const element = node instanceof Element ? node : node.parentElement
  const span = element?.closest<HTMLElement>('[data-mw-text]')
  const segment = span && map.segments[Number(span.dataset.mwText)]
  if (span && segment) {
    const range = document.createRange(); range.selectNodeContents(span)
    try { range.setEnd(node, offset) } catch { return null }
    return { position: sourceOffset(segment, Math.min(segment.text.length, range.toString().length), bias), exact: true }
  }
  const container = element?.closest<HTMLElement>('[data-mw-block]')
  const block = container && map.blocks[Number(container.dataset.mwBlock)]
  return block ? { position: bias > 0 ? block.from : block.to, exact: false } : null
}

interface Options {
  view: EditorView; root: HTMLElement; scroller: HTMLElement
  getMap: () => PreviewMap | null; getSource: () => string; valid: (map: PreviewMap) => boolean
}
// One controller per active source session. All mutations are navigation/view state only.
export function synchronizePreview({ view, root, scroller: pv, getMap, getSource, valid }: Options) {
  const cm = view.scrollDOM
  let disposed = false, frame = 0, settleFrame = 0, guardFrame = 0
  let dirty = true, anchors: Anchor[] = [], leader: Pane = 'source', pending: Pane | null = null
  let guard: { pane: Pane; target: number } | null = null
  let previewPointer = false
  let coordinateSource = getSource(), coordinates = sourceCoordinates(coordinateSource)
  const coordinateMap = () => {
    const source = getSource()
    if (source !== coordinateSource) { coordinateSource = source; coordinates = sourceCoordinates(source) }
    return coordinates
  }
  const overlay = document.createElement('div'); overlay.className = 'preview-correspondence'; overlay.setAttribute('aria-hidden', 'true'); pv.append(overlay)
  let blockHighlight: Element | null = null
  const alive = () => { const map = getMap(); return !disposed && map && valid(map) ? map : null }
  const measure = (map: PreviewMap) => {
    const cmRect = cm.getBoundingClientRect(), pvRect = pv.getBoundingClientRect()
    const origin = view.documentTop - cmRect.top + cm.scrollTop
    const coordinates = coordinateMap()
    const result: Anchor[] = [{ source: 0, preview: 0 }]
    for (const block of map.blocks) {
      if (!['paragraph_open', 'heading_open', 'tr_open', 'fence', 'code_block', 'hr', 'list_item_open'].includes(block.kind)) continue
      const element = root.querySelector<HTMLElement>(`[data-mw-block="${block.id}"]`)
      if (!element || !element.getClientRects().length) continue
      result.push({ source: origin + view.lineBlockAt(Math.min(view.state.doc.length, coordinates.toEditor(block.from))).top,
        preview: element.getBoundingClientRect().top - pvRect.top + pv.scrollTop })
    }
    result.sort((a, b) => a.source - b.source || a.preview - b.preview)
    // Nested/tight-list blocks may share coordinates. Keep monotone content anchors only.
    anchors = result.filter((a, i) => !i || a.source > result[i - 1].source + .5 && a.preview >= result[i - 1].preview)
    anchors.push({ source: Math.max(cm.scrollHeight, anchors[anchors.length - 1]?.source ?? 0), preview: Math.max(pv.scrollHeight, anchors[anchors.length - 1]?.preview ?? 0) })
    dirty = false
  }
  const clear = () => { overlay.replaceChildren(); blockHighlight?.classList.remove('correspondence-block'); blockHighlight = null }
  const draw = (map: PreviewMap) => {
    const selection = view.state.selection.main, coordinates = coordinateMap()
    const from = coordinates.toSource(selection.from), to = coordinates.toSource(selection.to)
    const pvRect = pv.getBoundingClientRect(), rectangles: { left: number; top: number; width: number; height: number }[] = []
    for (const segment of map.segments) {
      const first = segment.starts[0], last = segment.ends[segment.ends.length - 1]
      if (last < from || first > to) continue
      const element = root.querySelector(`[data-mw-text="${segment.id}"]`), text = element?.firstChild
      if (!text || text.nodeType !== Node.TEXT_NODE) continue
      const range = document.createRange()
      let start = renderedOffset(segment, Math.max(from, first)), end = renderedOffset(segment, Math.min(to, last))
      if (to > from && end < segment.text.length && segment.starts[end] < to) end++
      if (selection.empty && (from < first || from > last)) continue
      if (!selection.empty && end <= start) continue
      if (selection.empty) end = start
      range.setStart(text, Math.min(start, text.textContent!.length)); range.setEnd(text, Math.min(end, text.textContent!.length))
      let rects = Array.from(range.getClientRects())
      if (selection.empty && (!rects.length || !rects[0].height)) {
        start = Math.min(start, Math.max(0, segment.text.length - 1)); range.setStart(text, start); range.setEnd(text, start + 1); rects = Array.from(range.getClientRects())
      }
      for (const rect of rects) if (rect.bottom >= pvRect.top && rect.top <= pvRect.bottom) {
        rectangles.push({ left: rect.left - pvRect.left + pv.scrollLeft, top: rect.top - pvRect.top + pv.scrollTop, width: selection.empty ? 2 : rect.width, height: rect.height })
      }
      if (selection.empty && rectangles.length) break
      if (rectangles.length > 300) break
    }
    const fallback = !rectangles.length ? map.blocks.filter(block => block.from <= from && block.to >= to).sort((a, b) => a.to - a.from - (b.to - b.from))[0] : null
    clear()
    for (const rect of rectangles) {
      const element = document.createElement('div'); element.className = selection.empty ? 'correspondence-caret' : 'correspondence-range'
      Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); overlay.append(element)
    }
    if (fallback) { blockHighlight = root.querySelector(`[data-mw-block="${fallback.id}"]`); blockHighlight?.classList.add('correspondence-block') }
  }
  const programScroll = (pane: Pane, target: number) => {
    const element = pane === 'source' ? cm : pv
    target = Math.max(0, Math.min(target, element.scrollHeight - element.clientHeight))
    if (Math.abs(element.scrollTop - target) < .5) return
    guard = { pane, target }; element.scrollTop = target
    cancelAnimationFrame(settleFrame); cancelAnimationFrame(guardFrame)
    settleFrame = requestAnimationFrame(() => { guardFrame = requestAnimationFrame(() => { guard = null }) })
  }
  const run = () => {
    frame = 0
    const map = alive(); if (!map) { clear(); return }
    if (dirty) measure(map)
    const pane = pending; pending = null
    if (pane) {
      const element = pane === 'source' ? cm : pv
      const other = pane === 'source' ? 'preview' : 'source'
      // Content anchors include document padding. Interpolate at the same top viewport point.
      programScroll(other, interpolateAnchors(anchors, element.scrollTop + 16, pane) - 16)
    }
    draw(map)
  }
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(run) }
  const invalidate = () => { dirty = true; pending = leader; schedule() }
  const scroll = (pane: Pane) => {
    if (disposed) return
    const element = pane === 'source' ? cm : pv
    if (guard?.pane === pane && Math.abs(element.scrollTop - guard.target) < 2) { schedule(); return }
    leader = pane; pending = pane; schedule()
  }
  const sourceScroll = () => scroll('source'), previewScroll = () => scroll('preview')
  const sourceIntent = () => { leader = 'source'; guard = null }
  const previewIntent = () => { leader = 'preview'; guard = null }
  const mirrorPreview = (fallback?: Element | null) => {
    const map = alive(); if (!map) return
    const selection = window.getSelection()
    const forward = !selection || selection.anchorNode === selection.focusNode && selection.anchorOffset <= selection.focusOffset || !!(selection.anchorNode && selection.focusNode && selection.anchorNode.compareDocumentPosition(selection.focusNode) & Node.DOCUMENT_POSITION_FOLLOWING)
    let anchor = selection?.anchorNode && previewPoint(root, map, selection.anchorNode, selection.anchorOffset, forward ? 1 : -1)
    let head = selection?.focusNode && previewPoint(root, map, selection.focusNode, selection.focusOffset, forward ? -1 : 1)
    const atom = fallback?.closest('[data-type="mermaid"],[data-type="dot"],img')
    if (atom || (!anchor || !head) && fallback) {
      anchor = previewPoint(root, map, atom ?? fallback!, 0, 1)
      head = previewPoint(root, map, atom ?? fallback!, 0, -1)
    }
    if (!anchor || !head) return
    const coordinates = coordinateMap()
    const a = Math.max(0, Math.min(view.state.doc.length, coordinates.toEditor(anchor.position))), h = Math.max(0, Math.min(view.state.doc.length, coordinates.toEditor(head.position)))
    const effects: ReturnType<typeof unfoldEffect.of>[] = []
    foldedRanges(view.state).between(Math.min(a, h), Math.max(a, h), (from, to) => { effects.push(unfoldEffect.of({ from, to })) })
    if (a === view.state.selection.main.anchor && h === view.state.selection.main.head && !effects.length) return
    view.dispatch({ selection: { anchor: a, head: h }, effects })
    leader = 'preview'; pending = 'preview'; if (effects.length) dirty = true
    schedule()
  }
  const selectionChanged = () => { if (previewPointer || root.contains(document.activeElement)) mirrorPreview() }
  const down = () => { previewPointer = true; previewIntent() }
  const up = (event: PointerEvent) => { if (previewPointer) mirrorPreview(event.target instanceof Element ? event.target : null); previewPointer = false }
  const click = (event: MouseEvent) => { if ((event.target as Element)?.closest('a')) event.preventDefault() }
  cm.addEventListener('scroll', sourceScroll); pv.addEventListener('scroll', previewScroll)
  cm.addEventListener('wheel', sourceIntent, { passive: true }); pv.addEventListener('wheel', previewIntent, { passive: true })
  cm.addEventListener('pointerdown', sourceIntent); root.addEventListener('pointerdown', down); document.addEventListener('pointerup', up)
  cm.addEventListener('focusin', sourceIntent); cm.addEventListener('keydown', sourceIntent); root.addEventListener('focusin', previewIntent)
  root.addEventListener('click', click); document.addEventListener('selectionchange', selectionChanged)
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null
  observer?.observe(root); observer?.observe(cm); observer?.observe(pv)
  const images = () => invalidate(); root.addEventListener('load', images, true)
  document.fonts?.addEventListener('loadingdone', invalidate)
  schedule()
  return {
    invalidate,
    selection: schedule,
    dispose() {
      disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(settleFrame); cancelAnimationFrame(guardFrame); observer?.disconnect(); clear(); overlay.remove()
      cm.removeEventListener('scroll', sourceScroll); pv.removeEventListener('scroll', previewScroll)
      cm.removeEventListener('wheel', sourceIntent); pv.removeEventListener('wheel', previewIntent)
      cm.removeEventListener('pointerdown', sourceIntent); root.removeEventListener('pointerdown', down); document.removeEventListener('pointerup', up)
      cm.removeEventListener('focusin', sourceIntent); cm.removeEventListener('keydown', sourceIntent); root.removeEventListener('focusin', previewIntent)
      root.removeEventListener('click', click); document.removeEventListener('selectionchange', selectionChanged); root.removeEventListener('load', images, true)
      document.fonts?.removeEventListener('loadingdone', invalidate)
    },
  }
}
