import { describe, it, expect, vi } from 'vitest'
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }))
import { quickLookRender } from './quickLookRender'
import mermaid from 'mermaid'

const doc = (body: string) => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body>${body}</body></html>`
describe('Quick Look static enrichment', () => {
  it('highlights known code and preserves escaped source text', async () => {
    const output = await quickLookRender(doc('<pre><code data-language="python">print(&quot;&lt;x&gt;&quot;)</code></pre>'))
    const parsed = new DOMParser().parseFromString(output, 'text/html')
    expect(parsed.querySelector('code')?.textContent).toBe('print("<x>")')
    expect(parsed.querySelector('code span')).not.toBeNull()
    expect(parsed.querySelector('script')).toBeNull()
  })
  it('leaves unsafe mermaid directives as inert text', async () => {
    const source = '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\nA--&gt;B'
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc(`<pre><code data-language="mermaid">${source}</code></pre>`)), 'text/html')
    expect(parsed.querySelector('code')?.textContent).toContain('securityLevel')
    expect(parsed.querySelector('svg, img, script')).toBeNull()
  })
  it('preserves structured text as highlighted text', async () => {
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc('<pre data-language="json">{&quot;x&quot;: 1}</pre>')), 'text/html')
    expect(parsed.querySelector('pre')?.textContent).toBe('{"x": 1}')
    expect(parsed.querySelector('pre span')).not.toBeNull()
  })
  it('removes active content from its static result', async () => {
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc('<script>bad()</script><p onclick="bad()">safe</p>')), 'text/html')
    expect(parsed.querySelector('script')).toBeNull()
    expect(parsed.querySelector('p')?.hasAttribute('onclick')).toBe(false)
  })
  it('rejects generated SVG with external resources and keeps diagram source', async () => {
    vi.mocked(mermaid.render).mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://example.test/leak"/></svg>', diagramType: 'flowchart' })
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc('<pre><code data-language="mermaid">flowchart TD\nA--&gt;B</code></pre>')), 'text/html')
    expect(parsed.querySelector('img, svg')).toBeNull()
    expect(parsed.querySelector('code')?.textContent).toContain('flowchart TD')
  })
  it('keeps oversized and frontmatter diagrams as source', async () => {
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc('<pre><code data-language="mermaid">---\nconfig: x\n---\nflowchart TD\nA--&gt;B</code></pre>')), 'text/html')
    expect(parsed.querySelector('code')?.textContent).toContain('config: x')
    expect(parsed.querySelector('img')).toBeNull()
  })

})
