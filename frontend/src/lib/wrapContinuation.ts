import { EditorSelection, type Extension } from '@codemirror/state'
import { layer, RectangleMarker, BlockType } from '@codemirror/view'

// Public layer/geometry APIs; marks are outside editable content and native clipboard data.
export function wrapContinuation(): Extension {
  return layer({
    above: false,
    class: 'wrap-continuation-layer',
    update: update => update.docChanged || update.geometryChanged || update.viewportChanged,
    markers(view) {
      if (!view.lineWrapping) return []
      const markers: RectangleMarker[] = []
      const scroller = view.scrollDOM.getBoundingClientRect()
      const visibleStart = view.posAtCoords({ x: view.contentDOM.getBoundingClientRect().left + 20, y: scroller.top + 4 }) ?? view.viewport.from
      for (const line of view.viewportLineBlocks) {
        if (line.type !== BlockType.Text || line.height < view.defaultLineHeight * 1.5) continue
        let position = Math.max(line.from, visibleStart)
        if (position > line.to) continue
        position = view.moveToLineBoundary(EditorSelection.cursor(position, 1), false, true).head
        // Walk actual visual wrap boundaries; never iterate through hidden payload characters.
        for (let count = 0; count < 500 && position < line.to; count++) {
          const end = view.moveToLineBoundary(EditorSelection.cursor(position, 1), true, true).head
          if (end >= line.to || end < position) break
          const next = end > position ? end : position + 1
          const rect = RectangleMarker.forRange(view, 'unused', EditorSelection.cursor(next, 1))[0]
          if (rect) {
            if (rect.top > view.scrollDOM.scrollTop + view.scrollDOM.clientHeight) break
            if (rect.top + rect.height >= view.scrollDOM.scrollTop) markers.push(new RectangleMarker('wrap-continuation', rect.left - 12, rect.top, 10, rect.height))
          }
          position = next
        }
      }
      return markers
    },
  })
}
