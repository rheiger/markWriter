import { expect, it, vi } from 'vitest'
import { createHtmlExport } from './htmlExport'
import { plantumlRenderer } from './plantumlRenderer'

const chart = '@startuml\nAlice -> Bob : request\n@enduml\n'
const source = `Before\n\n\`\`\`plantuml\n${chart}\`\`\`\n\n[link](https://example.com)`

it('exports a checked diagram as static self-contained SVG', async () => {
  const spy = vi.spyOn(plantumlRenderer, 'render').mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Alice</text></svg>')
  try {
    const doc = new DOMParser().parseFromString(await createHtmlExport(source, 'captured:1'), 'text/html')
    expect(doc.querySelector('[data-type="plantuml"] svg text')?.textContent).toBe('Alice')
    expect(doc.querySelector('script,link[rel="stylesheet"]')).toBeNull()
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
  } finally { spy.mockRestore() }
})

it('preserves readable source and the rest of the export when rendering fails', async () => {
  const spy = vi.spyOn(plantumlRenderer, 'render').mockRejectedValue(new Error('Unsupported syntax'))
  try {
    const doc = new DOMParser().parseFromString(await createHtmlExport(source, 'captured:1'), 'text/html')
    expect(doc.querySelector('[data-type="plantuml"] pre')?.textContent).toBe(chart)
    expect(doc.querySelector('[data-type="plantuml"]')?.textContent).toContain('Unsupported syntax')
    expect(doc.body.textContent).toContain('Before')
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
  } finally { spy.mockRestore() }
})
