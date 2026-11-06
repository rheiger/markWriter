import { describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { createHtmlExport } from './htmlExport'

describe('standalone HTML export', () => {
  it('renders tables, checked tasks and Mermaid SVG without external scripts', async () => {
    const source = '# Export\n\n| Name | Value |\n| --- | --- |\n| **Bold** | 2 |\n\n- [x] Done\n\n```mermaid\nflowchart TD\n A --> B\n```'
    const html = await createHtmlExport(source)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('h1')?.textContent).toBe('Export')
    expect(doc.querySelector('table strong')?.textContent).toBe('Bold')
    expect(doc.querySelector('input')?.hasAttribute('checked')).toBe(true)
    expect(doc.querySelector('[data-type="mermaid"] svg')).not.toBeNull()
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.querySelector('link[rel="stylesheet"]')).toBeNull()
  })
  it('reports a diagram error rather than exporting an incomplete document', async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Invalid diagram'))
    await expect(createHtmlExport('```mermaid\ninvalid\n```')).rejects.toThrow('Invalid diagram')
  })
  it('does not interpret raw document HTML as executable markup', async () => {
    const html = await createHtmlExport('<script>alert(1)</script>')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.body.textContent).toContain('<script>alert(1)</script>')
  })
})

it('exports qualified static DOT with no source or navigation metadata', async () => {
  const { dotRenderer } = await import('./dotRenderer')
  const spy = vi.spyOn(dotRenderer, 'render').mockResolvedValueOnce('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>safe</text></svg>')
  try {
    const html = await createHtmlExport('```graphviz\ndigraph {a -> b}\n```', 'document:7:export:1')
    expect(spy).toHaveBeenCalledWith('digraph {a -> b}\n', 'document:7:export:1')
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/data-(?:chart|source-fence|notation|mw-)/)
    expect(html).not.toMatch(/<script|href=/)
  } finally { spy.mockRestore() }
})
