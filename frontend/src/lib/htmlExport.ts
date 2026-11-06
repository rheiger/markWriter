import mermaid from 'mermaid'
import { renderMarkdownHtml } from './markdown'
import { dotRenderer } from './dotRenderer'

// Use the same parser as Preview; diagrams become inline SVG for offline viewing.
export async function createHtmlExport(source: string): Promise<string> {
  const doc = new DOMParser().parseFromString(renderMarkdownHtml(source), 'text/html')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: 'default' })
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-type="mermaid"]'))) {
    const { svg } = await mermaid.render(`export-${crypto.randomUUID()}`, element.getAttribute('data-chart') ?? '')
    element.innerHTML = svg
  }
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-type="dot"]'))) {
    element.innerHTML = await dotRenderer.render(element.getAttribute('data-chart') ?? '', `export:${crypto.randomUUID()}`)
    element.className = 'dot-diagram'
    for (const name of ['data-chart', 'data-source-fence', 'data-notation']) element.removeAttribute(name)
  }
  doc.querySelectorAll('[data-type="mermaid"]').forEach(element => element.removeAttribute('data-chart'))
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exported Document</title><style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:32px;line-height:1.6;color:#222;background:#fff}
pre{padding:16px;background:#f5f5f5;overflow:auto}code{font-family:ui-monospace,monospace}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}
blockquote{border-left:3px solid #bbb;padding-left:16px}img,svg{max-width:100%}
</style></head><body>${doc.body.innerHTML}</body></html>`
}
