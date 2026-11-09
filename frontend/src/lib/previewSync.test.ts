import { it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { interpolateAnchors, previewPoint, synchronizePreview } from './previewSync'
import { renderMappedMarkdown } from './markdown'

it('interpolates locally around tall atoms rather than by whole-document percentages', () => {
  const anchors = [{ source: 0, preview: 0 }, { source: 100, preview: 500 }, { source: 200, preview: 550 }, { source: 500, preview: 900 }]
  expect(interpolateAnchors(anchors, 150, 'source')).toBe(525)
  expect(interpolateAnchors(anchors, 525, 'preview')).toBe(150)
})
it('maps native Preview endpoints through exact segments and explicit atom fallbacks', () => {
  const source = 'same **same** &amp; 😀\n\n```mermaid\nflowchart TD\n A[same]\n```'
  const map = renderMappedMarkdown(source, { documentId: 'A', revision: 1, generation: 1 })
  const root = document.createElement('div'); root.innerHTML = map.html
  const spans = root.querySelectorAll('[data-mw-text]')
  const strong = Array.from(spans).find(el => el.textContent === 'same')!
  expect(previewPoint(root, map, strong.firstChild!, 2, 1)).toEqual({ position: source.indexOf('**same') + 4, exact: true })
  const atom = root.querySelector('[data-type=mermaid]')!
  expect(previewPoint(root, map, atom, 0, 1)?.exact).toBe(false)
  expect(previewPoint(root, map, atom, 0, 1)?.position).toBe(source.indexOf('```mermaid'))
  expect(previewPoint(root, map, document.body, 0, 1)).toBeNull()
})

it.each([false, true])('keeps exact source correspondence through nested syntax spans (caret: %s)', caret => {
  const source = "```js\nconst face = '😀';\n```"
  const codeFrom = source.indexOf('const'), codeTo = source.indexOf(';') + 1
  const map = renderMappedMarkdown(source, { documentId: 'A', revision: 1, generation: 1 })
  const root = document.createElement('div'); root.innerHTML = map.html
  const wrapper = root.querySelector<HTMLElement>('[data-mw-text]')!
  wrapper.innerHTML = '<span class="hljs-keyword">const</span> face = <span class="hljs-string">\'<span>😀</span>\'</span>;'
  const scroller = document.createElement('div'); scroller.append(root)
  const frames: FrameRequestCallback[] = [], ranges: string[] = []
  const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value(this: Range) {
    ranges.push(this.toString())
    return this.collapsed ? [] : [{ left: 10, top: 0, bottom: 12, width: 80, height: 12 }]
  } })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const view = { scrollDOM: document.createElement('div'), documentTop: 0,
    state: EditorState.create({ doc: source, selection: caret ? { anchor: codeTo } : { anchor: codeFrom + 2, head: source.indexOf('😀') + 2 } }),
  } as unknown as EditorView
  const sync = synchronizePreview({ view, root, scroller, getMap: () => map, getSource: () => source, valid: () => true })
  try {
    frames.shift()!(0)
    expect(ranges.at(-1)).toBe(caret ? ';' : "nst face = '😀")
    expect(scroller.querySelector(caret ? '.correspondence-caret' : '.correspondence-range')).not.toBeNull()
    expect(root.querySelector('.correspondence-block')).toBeNull()

    // Preview offsets remain UTF-16 source offsets at every descendant boundary,
    // including both code units of the emoji and bias in either direction.
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode(), total = 0
    while (text) {
      for (let offset = 0; offset <= text.textContent!.length; offset++) {
        for (const bias of [-1, 1]) expect(previewPoint(root, map, text, offset, bias)).toEqual({ position: codeFrom + total + offset, exact: true })
      }
      total += text.textContent!.length; text = walker.nextNode()
    }
  } finally {
    sync.dispose(); vi.unstubAllGlobals()
    if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects)
    else Reflect.deleteProperty(Range.prototype, 'getClientRects')
  }
})

it('does not navigate from stale Preview correspondence', () => {
  const source = 'Old paragraph', map = renderMappedMarkdown(source, { documentId:'A', revision:1, generation:1 })
  const root = document.createElement('div'); root.innerHTML = map.html
  const scroller = document.createElement('div'); scroller.append(root)
  document.body.append(scroller)
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const dispatch = vi.fn()
  const view = { scrollDOM:document.createElement('div'), documentTop:0, state:EditorState.create({doc:source}), dispatch } as unknown as EditorView
  const sync = synchronizePreview({view,root,scroller,getMap:()=>map,getSource:()=>source,valid:()=>false})
  try {
    frames.shift()!(0)
    root.dispatchEvent(new Event('pointerdown', {bubbles:true}))
    root.querySelector('[data-mw-text]')!.dispatchEvent(new Event('pointerup', {bubbles:true}))
    expect(dispatch).not.toHaveBeenCalled()
    expect(scroller.querySelector('.correspondence-range, .correspondence-caret, .correspondence-block')).toBeNull()
  } finally { sync.dispose(); scroller.remove(); vi.unstubAllGlobals() }
})
