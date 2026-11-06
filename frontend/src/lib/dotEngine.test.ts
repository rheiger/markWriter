import { it, expect } from 'vitest'
import { instance, graphvizVersion } from '@viz-js/viz'
import { sanitizeDotSvg, validateDot } from './dotSafety'

it('sanitizes real pinned Graphviz SVG while retaining labels, arrows and whitespace', async () => {
  const source = 'digraph { rankdir=LR; a [label=" a ",shape=box]; a -> b [label="Grüße 漢"] }'
  validateDot(source)
  const viz = await instance()
  expect(graphvizVersion).toBe('16.1.0')
  const result = viz.render(source,{format:'svg',engine:'dot'})
  expect(result.status).toBe('success')
  if (result.status !== 'success') throw new Error('Real Graphviz failed')
  const clean = sanitizeDotSvg(result.output)
  expect(clean).toContain('<path'); expect(clean).toContain('<polygon')
  expect(clean).toContain(' a '); expect(clean).toContain('xml:space="preserve"')
  expect(clean).toContain('Grüße 漢')
  expect(clean).not.toMatch(/<!DOCTYPE|href|<script|style=/)
})
