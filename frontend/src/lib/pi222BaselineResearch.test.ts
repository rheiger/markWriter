import { describe, expect, it } from 'vitest'
import { createHtmlExport } from './htmlExport'
import { renderMarkdownHtml } from './markdown'
import { writeFileSync } from 'node:fs'

// Research-only baseline: v2.21.1 has no PlantUML renderer. These assertions
// document how the existing generic fenced-code path behaves, not candidate
// renderer or installed-app acceptance.
const diagrams = [
  '@startuml\nAlice -> Bob : synthetic sequence\n@enduml',
  '@startuml\nclass User {\n +id: int\n}\nclass Order\nUser -- Order\n@enduml',
  '@startuml\nclass {\n@enduml',
  '@startuml\n!include /tmp/pi222-secret.puml\n@enduml',
  '@startuml\n!include http://127.0.0.1:49876/pi222.puml\n@enduml',
  '@startuml\n!theme absent\nAlice -> Bob\n@enduml',
  '@startuml\nAlice -> Bob : <img:http://127.0.0.1:49876/x.png>\n@enduml',
  '@startuml\n' + 'Alice -> Bob : synthetic line\n'.repeat(1000) + '@enduml',
]
const fenced = (diagram: string) => `\`\`\`plantuml\n${diagram}\n\`\`\`\n`

describe('PI 2.22 released-source PlantUML baseline (generic fences)', () => {
  it.each(diagrams)('keeps the synthetic diagram readable in Preview markup', diagram => {
    const parsed = new DOMParser().parseFromString(renderMarkdownHtml(fenced(diagram)), 'text/html')
    expect(parsed.querySelector('pre code')?.textContent).toBe(diagram + '\n')
    expect(parsed.querySelector('svg, img, script')).toBeNull()
  })
  it.each(diagrams)('keeps the synthetic diagram readable in standalone HTML', async diagram => {
    const html = await createHtmlExport(fenced(diagram) + '\n[ordinary link](https://example.com/)\n')
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    expect(parsed.querySelector('pre code')?.textContent).toBe(diagram + '\n')
    expect(parsed.querySelector('svg, img, script, link[rel="stylesheet"]')).toBeNull()
    expect(parsed.querySelector('a')?.getAttribute('href')).toBe('https://example.com/')
  })
  it('optionally writes a standalone synthetic HTML file for a separate browser check', async () => {
    const path = process.env.MW_PI222_EXPORT_PATH
    if (path) writeFileSync(path, await createHtmlExport(fenced(diagrams[0]) + '\n[ordinary link](https://example.com/)\n'))
    expect(true).toBe(true)
  })
})
