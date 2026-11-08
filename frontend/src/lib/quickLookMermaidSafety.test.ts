import { describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }))
import mermaid from 'mermaid'
import { quickLookRender } from './quickLookRender'

const render = async (source: string) => {
  const code = document.createElement('code')
  code.setAttribute('data-language', 'mermaid')
  code.textContent = source
  return quickLookRender(`<html><head></head><body><pre>${code.outerHTML}</pre></body></html>`)
}

describe('Quick Look Mermaid input safety', () => {
  beforeEach(() => vi.mocked(mermaid.render).mockReset())
  it('accepts path placeholders and bounded color styles without passing HTML tags', async () => {
    await render('flowchart TD\nA["/users/<tenant>/<id>/files"] --> B\nstyle B fill:#eeeeee,stroke:#bbb,stroke-dasharray:5 5')
    expect(mermaid.render).toHaveBeenCalledOnce()
    const source = vi.mocked(mermaid.render).mock.calls[0][1]
    expect(source).not.toContain('<tenant>')
    expect(source).toContain('#60;tenant#62;')
  })
  it('accepts a state description named file', async () => {
    await render('stateDiagram-v2\nfile: local document\nfile --> saved')
    expect(mermaid.render).toHaveBeenCalledOnce()
  })
  it.each([
    'flowchart TD\nA["<img src=x onerror=alert(1)>"]',
    'flowchart TD\nA["/<script>/x"]',
    'flowchart TD\nA["#60;script#62;"]',
    'flowchart TD\nclick A "https://example.test"',
    'flowchart TD\nstyle A fill:url(https://example.test/x)',
    'flowchart TD\nstyle A fill:red;stroke:red',
    'flowchart TD\nA-->B;style B fill:red',
    'stateDiagram-v2\nfile: https://example.test/a',
    'stateDiagram-v2\nfile:///etc/passwd',
    '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\nA-->B',
  ])('rejects unsafe input: %s', async source => {
    await render(source)
    expect(mermaid.render).not.toHaveBeenCalled()
  })
})

describe('Quick Look SVG style safety', () => {
  it.each([
    ['filter:url(#local-filter)', true],
    ['filter:url(https://example.test/evil)', false],
    ['filter:url(#local-filter);fill:url(https://example.test/evil)', false],
    ['filter:url(#local-filter);@import "https://example.test/evil"', false],
  ])('handles %s', async (style, accepted) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} })
    vi.mocked(mermaid.render).mockResolvedValueOnce({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g style='${style}'><path d="M0 0L10 10"/></g></svg>`, diagramType: 'flowchart' })
    try {
      const output = await render('flowchart TD\nA-->B')
      expect(output.includes('data:image/png;base64,AAAA')).toBe(accepted)
      expect(output).toContain('flowchart TD')
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals() }
  })
})
