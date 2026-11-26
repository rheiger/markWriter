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

describe('larger Quick Look previews', () => {
  it('preserves and highlights standalone TOML through its final sentinel', async () => {
    const input = ('name = "example" # value\n').repeat(1800) + 'final_sentinel = true\n'
    const output = await quickLookRender(doc('<pre data-language="toml">' + input + '</pre>'))
    const pre = new DOMParser().parseFromString(output, 'text/html').querySelector('pre')!
    expect(pre.textContent).toBe(input)
    expect(Array.from(pre.querySelectorAll('span')).at(-1)?.textContent).toBe('true')
  })

  it('keeps highlighting through the end of a 48 KiB standalone source file', async () => {
    const source = 'echo "a representative argument" # ' + 'text '.repeat(15) + '\n'
    const input = source.repeat(450) + 'echo "last argument"\n'
    const parsed = new DOMParser().parseFromString(
      await quickLookRender(doc('<pre data-language="bash">' + input + '</pre>')), 'text/html',
    )
    const pre = parsed.querySelector('pre')!
    expect(pre.textContent).toBe(input)
    expect(Array.from(pre.querySelectorAll('span')).at(-1)?.textContent).toBe('"last argument"')
  })

  it('highlights JSON Lines records beyond the old block and token limits', async () => {
    const records = Array.from({ length: 140 }, (_, i) => JSON.stringify({
      id: i, name: 'Zürich', enabled: true, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    }, null, 2))
    const output = await quickLookRender(doc(records.map(record => '<pre data-language="json">' + record + '</pre>').join('')))
    const blocks = new DOMParser().parseFromString(output, 'text/html').querySelectorAll('pre')
    expect(blocks).toHaveLength(records.length)
    expect(blocks[139].textContent).toBe(records[139])
    expect(blocks[139].querySelector('span')).not.toBeNull()
  })
})

it('highlights a formatted JSON preview from a compact 96 KB file through the final value', async () => {
  const entries = Array.from({ length: 1600 }, (_, id) => ({
    id, state: 'ok', active: true, location: 'Zürich', count: 50,
  }))
  const compact = JSON.stringify(entries)
  expect(compact.length).toBeGreaterThan(96_000)
  const formatted = JSON.stringify(entries, null, 2)
  expect(formatted.length).toBeGreaterThan(128 * 1024)
  const html = await quickLookRender(doc('<pre data-language="json">' + formatted + '</pre>'))
  const pre = new DOMParser().parseFromString(html, 'text/html').querySelector('pre')!
  expect(pre.textContent).toBe(formatted)
  expect(Array.from(pre.querySelectorAll('.hljs-number')).at(-1)?.textContent).toBe('50')
})

describe('standalone Finder language markers', () => {
  it.each([
    ['c', 'int main(void) { return 42; }'],
    ['cpp', 'int main() { return 42; }'],
    ['javascript', 'export const answer = "Grüße & 日本語";'],
    ['typescript', 'export const Badge = (label: string) => <span>{label}</span>;'],
    ['dockerfile', 'FROM scratch\nLABEL message="Grüße & 日本語"'],
    ['ignore', '# Größere Dateien\n!keep/**\n\\#literal\n[tag]&.txt'],
    ['powershell', 'Write-Output "Grüße <tag>& 日本語"'],
    ['dos', 'if defined READY echo Grüße <tag>& 日本語'],
    ['css', 'body { color: red; }'],
    ['yaml', 'defaults: &base {enabled: true}\ncopy: *base\nscript: "<script>&"'],
  ])('enriches escaped %s text without changing or executing it', async (language, source) => {
    const pre = document.createElement('pre')
    pre.setAttribute('data-language', language); pre.textContent = source
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc(pre.outerHTML)), 'text/html')
    expect(parsed.querySelector('pre')?.textContent).toBe(source)
    expect(parsed.querySelector('pre span')).not.toBeNull()
    expect(parsed.querySelector('script')).toBeNull()
  })

  it('preserves ignore-file comment and negation semantics', async () => {
    const pre = document.createElement('pre')
    pre.setAttribute('data-language', 'gitignore')
    pre.textContent = '# a comment\n\\#literal\n!keep/**\n\\!literal\n'
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc(pre.outerHTML)), 'text/html')
    expect(parsed.querySelector('pre')?.textContent).toBe(pre.textContent)
    expect([...parsed.querySelectorAll('.hljs-comment')].map(span => span.textContent)).toEqual(['# a comment'])
    expect([...parsed.querySelectorAll('.hljs-keyword')].map(span => span.textContent)).toEqual(['!'])
  })

  it('highlights a standalone PowerShell source file beyond 100 KiB through the last line', async () => {
    const pre = document.createElement('pre')
    pre.setAttribute('data-language', 'powershell')
    const sample = Array.from({ length: 1000 }, (_, index) =>
      `$line${index} = "Grüße & 日本語" # A descriptive comment for this example disambiguates the line from the next one.\n`,
    ).join('') + 'Write-Output "final_sentinel"\n'
    expect(new TextEncoder().encode(sample).length).toBeGreaterThan(100 * 1024)
    pre.textContent = sample
    const parsed = new DOMParser().parseFromString(await quickLookRender(doc(pre.outerHTML)), 'text/html')
    const rendered = parsed.querySelector('pre')!
    expect(rendered.textContent).toBe(sample)
    expect(Array.from(rendered.querySelectorAll('.hljs-string')).at(-1)?.textContent).toBe('"final_sentinel"')
  })
})

it('explains SQL fallback in Finder enrichment without changing the code', async () => {
  const code = 'SELECT 1;\n' + 'x'.repeat(16 * 1024 + 1)
  const pre=document.createElement('pre'); pre.setAttribute('data-language','sql'); pre.textContent=code
  const output=new DOMParser().parseFromString(await quickLookRender(doc(pre.outerHTML)),'text/html')
  expect(output.querySelector('pre')!.getAttribute('aria-description')).toContain('original text is preserved')
  expect(output.querySelector('pre')!.textContent).toBe(code)
})

describe('Finder DBML diagrams', () => {
  const schema = 'Table customers {\n  id int [pk]\n}\nTable orders {\n  id int [pk]\n  customer_id int [not null, ref: > customers.id]\n}\n'
  function fixture(source: string) {
    return '```dbml\n' + source + '```\n'
  }
  async function render(source: string) {
    return new DOMParser().parseFromString(await quickLookRender(doc(''), source), 'text/html')
  }
  it('renders a supported schema and retains its exact source', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} })
    try {
      const output = await render(fixture(schema))
      expect(output.querySelector('img')?.getAttribute('alt')).toBe('DBML diagram')
      expect(output.querySelector('details code')?.textContent).toBe(schema)
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals() }
  })
  it.each([
    'Table t {\n  x int [default: 1]\n}\n',
    'Table t {\n  x int\n}\nRef: t.x > missing.id\n',
    'Table t {\n  x int\n}\n' + '// oversized\n'.repeat(800),
  ])('keeps unsupported, invalid or oversized schemas as source', async source => {
    const output = await render(fixture(source))
    expect(output.querySelector('img')).toBeNull()
    expect(output.querySelector('code')?.textContent).toBe(source)
  })
  it('shares the four-diagram budget with DOT and Mermaid', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} })
    try {
      const output = await render(fixture(schema).repeat(5))
      expect(output.querySelectorAll('img')).toHaveLength(4)
      expect(output.querySelectorAll('details')).toHaveLength(4)
      expect(output.querySelectorAll('pre > code')).toHaveLength(5)
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals() }
  })
})
