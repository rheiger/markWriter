import { it, expect } from 'vitest'
import { interpolateAnchors, previewPoint } from './previewSync'
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
