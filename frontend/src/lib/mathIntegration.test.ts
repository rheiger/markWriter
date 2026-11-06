import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { renderMappedMarkdown, renderMarkdownHtml, toWysiwygHtml, fromWysiwygHtml } from './markdown'
import { findEmbeddedSource } from './sourceFolds'
import { createHtmlExport } from './htmlExport'

describe('explicit math integration', () => {
  it('reserves exact math fences and retains opaque source through rendered serialization', () => {
    const source = 'Before\n\n~~~~math\r\n\\frac{α_1}{β^2} < & "漢"\r\n~~~~\n'
    const html = toWysiwygHtml(source)
    expect(html).toContain('data-type="math"')
    const result = fromWysiwygHtml(html)
    expect(result).toContain('~~~~math\r\n')
    const first = new DOMParser().parseFromString(html,'text/html').querySelector('[data-type=math]')
    const second = new DOMParser().parseFromString(toWysiwygHtml(result),'text/html').querySelector('[data-type=math]')
    expect(second?.getAttribute('data-chart')).toBe(first?.getAttribute('data-chart'))
    expect(renderMarkdownHtml('```Math\nx\n```')).not.toContain('data-type="math"')
    expect(renderMarkdownHtml('$x$ and $$y$$')).not.toContain('data-type="math"')
  })
  it('maps math as a block fallback and exposes a source fold', () => {
    const source='```math\nE=mc^2\n```\n'
    const map=renderMappedMarkdown(source,{documentId:'A',revision:1,generation:2})
    expect(map.blocks).toHaveLength(1)
    expect(map.segments).toHaveLength(0)
    expect(findEmbeddedSource(EditorState.create({doc:source}))[0].kind).toBe('Math')
  })
  it('exports static math with embedded fonts and no navigation/source metadata', async () => {
    const { mathRenderer }=await import('./mathRenderer')
    const release=vi.fn()
    const spy=vi.spyOn(mathRenderer,'render').mockResolvedValue({html:'<span class="katex"><math><mi>x</mi></math></span>',release})
    try {
      const output=await createHtmlExport('```math\nx\n```')
      expect(output).toContain('class="katex"')
      expect(output).toContain('data:font/woff2;base64,')
      expect(output).not.toMatch(/<script|data-mw-|data-chart|data-source-fence|src=["']https?:/)
      expect(release).toHaveBeenCalledOnce()
    } finally {spy.mockRestore()}
  })
})

it('exports invalid math as inert source fallback while retaining the complete document', async () => {
  const {mathRenderer}=await import('./mathRenderer')
  const spy=vi.spyOn(mathRenderer,'render').mockRejectedValue(new Error('Invalid or unsupported math source'))
  try {
    const source='Before\n\n```math\n\\frac{<img src=x>}{\n```\n\nAfter'
    const doc=new DOMParser().parseFromString(await createHtmlExport(source),'text/html')
    expect(doc.body.textContent).toContain('Before')
    expect(doc.body.textContent).toContain('After')
    expect(doc.querySelector('.math-source')?.textContent).toBe('\\frac{<img src=x>}{\n')
    expect(doc.querySelector('img,script')).toBeNull()
    expect(doc.querySelector('[data-chart],[data-source-fence]')).toBeNull()
  } finally {spy.mockRestore()}
})

it('bounds total math export time and retains remaining source when a worker stalls', async () => {
  const {mathRenderer}=await import('./mathRenderer')
  await import('./mathStyles')
  await import('../../../notices/KaTeX-fonts-OFL-1.1.txt?raw')
  vi.useFakeTimers()
  const spy=vi.spyOn(mathRenderer,'render').mockImplementation((_source,_owner,_budget,signal)=>new Promise((_resolve,reject)=>{
    signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true})
  }))
  try {
    const pending=createHtmlExport('Before\n\n```math\nx\n```\n\n```math\ny\n```\n\nAfter')
    await vi.waitFor(()=>expect(spy).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(10_001)
    const output=await pending
    const doc=new DOMParser().parseFromString(output,'text/html')
    expect([...doc.querySelectorAll('.math-source')].map(e=>e.textContent)).toEqual(['x\n','y\n'])
    expect(doc.body.textContent).toContain('After')
    expect(spy).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  } finally {spy.mockRestore();vi.useRealTimers()}
})
