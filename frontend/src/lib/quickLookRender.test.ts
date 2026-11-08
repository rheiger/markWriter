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

describe('diagram raster contrast', () => {
  it('paints an opaque light background before drawing the diagram', async () => {
    const fillRect = vi.fn(), drawImage = vi.fn()
    const context = { fillStyle: '', fillRect, drawImage }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    vi.stubGlobal('Image', class { onload?: () => void; onerror?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} })
    vi.mocked(mermaid.render).mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>', diagramType: 'flowchart' })
    try {
      const output = await quickLookRender(doc('<pre><code data-language="mermaid">flowchart TD\nA--&gt;B</code></pre>'))
      expect(output).toContain('data:image/png;base64,AAAA')
      expect(context.fillStyle).toBe('#ffffff')
      expect(fillRect).toHaveBeenCalledWith(0, 0, 10, 10)
      expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(drawImage.mock.invocationCallOrder[0])
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals() }
  })
})

describe('Finder feedback fixtures', () => {
  it('renders full Markdown even when the native fallback has no code fences', async () => {
    const source = '**Bold** and [example](https://example.test)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
    const output = await quickLookRender(doc('<p>Native fallback</p>'), source)
    const parsed = new DOMParser().parseFromString(output, 'text/html')
    expect(parsed.querySelector('strong')?.textContent).toBe('Bold')
    expect(parsed.querySelector('tbody td')?.textContent).toBe('1')
    expect(parsed.body.textContent).toContain('example')
    expect(parsed.querySelector('[href]')).toBeNull()
    expect(parsed.body.textContent).not.toContain('Native fallback')
  })

  it('highlights a long supported fence through its last line and preserves its text', async () => {
    const source = ('printf "%s\\n" "quoted text" # example\n').repeat(150) + 'echo "tail marker"\n'
    expect(source.length).toBeGreaterThan(4096)
    const output = await quickLookRender(doc('<p>Native fallback</p>'), '```bash\n' + source + '```')
    const code = new DOMParser().parseFromString(output, 'text/html').querySelector('code')!
    expect(code.textContent).toBe(source)
    expect(Array.from(code.querySelectorAll('span')).at(-1)?.textContent).toBe('"tail marker"')
  })

  it('colors long literal XML as text without processing entities', async () => {
    const source = '<?xml version="1.0"?>\n<root>' + '<item name="value">&amp;</item>\n'.repeat(160) + '</root>'
    expect(source.length).toBeGreaterThan(4096)
    const escaped = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const output = await quickLookRender(doc('<pre data-language="xml">' + escaped + '</pre>'))
    const pre = new DOMParser().parseFromString(output, 'text/html').querySelector('pre')!
    expect(pre.textContent).toBe(source)
    expect(pre.querySelectorAll('span').length).toBeGreaterThan(100)
    expect(pre.querySelector('item')).toBeNull()
  })
})
