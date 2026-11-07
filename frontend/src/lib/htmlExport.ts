import mermaid from 'mermaid'
import { renderMarkdownHtml } from './markdown'
import { dotRenderer } from './dotRenderer'
import { dbmlRenderer } from './dbmlRenderer'
import { mathRenderer, createMathBudget } from './mathRenderer'
import tokenCss from './codeHighlight.css?inline'

// Use the same parser as Preview; diagrams become inline SVG for offline viewing.
export async function createHtmlExport(source: string, owner = `export:${crypto.randomUUID()}`, highlighting = true): Promise<string> {
  const doc = new DOMParser().parseFromString(renderMarkdownHtml(source, highlighting), 'text/html')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: 'default' })
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-type="mermaid"]'))) {
    const { svg } = await mermaid.render(`export-${crypto.randomUUID()}`, element.getAttribute('data-chart') ?? '')
    element.innerHTML = svg
  }
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-type="dot"]'))) {
    element.innerHTML = await dotRenderer.render(element.getAttribute('data-chart') ?? '', owner)
    element.className = 'dot-diagram'
    for (const name of ['data-chart', 'data-source-fence', 'data-notation']) element.removeAttribute(name)
  }
  const dbml = Array.from(doc.querySelectorAll<HTMLElement>('[data-type="dbml"]'))
  if (dbml.length) {
    const abort = new AbortController()
    const deadline = setTimeout(() => abort.abort(), 10_000)
    try {
      for (const element of dbml) {
        const source = element.getAttribute('data-chart') ?? ''
        element.innerHTML = await dbmlRenderer.render(source, owner, abort.signal)
        element.className = 'dbml-diagram'
        for (const name of ['data-chart', 'data-source-fence', 'data-notation']) element.removeAttribute(name)
      }
    } catch (error) {
      const reason = abort.signal.aborted ? 'export time limit exceeded' : error instanceof Error ? error.message : String(error)
      throw new Error(`DBML export failed: ${reason}`)
    } finally {
      clearTimeout(deadline)
    }
  }
  let mathCss = ''
  const math = Array.from(doc.querySelectorAll<HTMLElement>('[data-type="math"]'))
  if (math.length) {
    mathCss = (await import('./mathStyles')).mathExportCss
    const license = (await import('../../../notices/KaTeX-fonts-OFL-1.1.txt?raw')).default
    mathCss += `\n/* ${license.replace(/\*\//g, '* /')} */`
    const budget = createMathBudget(), releases: (() => void)[] = []
    const abort = new AbortController()
    const deadline = setTimeout(() => abort.abort(), 10_000)
    try {
      for (const element of math) {
        const source = element.getAttribute('data-chart') ?? ''
        element.className = 'math-block'
        try {
          if (abort.signal.aborted) throw new Error('Math export time limit exceeded')
          const result = await mathRenderer.render(source, owner, budget, abort.signal)
          releases.push(result.release)
          element.innerHTML = result.html
        } catch (error) {
          // Invalid/oversized math remains readable and inert in the exported
          // document; one unfinished expression cannot discard surrounding work.
          element.replaceChildren()
          const message = doc.createElement('p'), fallback = doc.createElement('pre')
          message.textContent = `Math unavailable: ${error instanceof Error ? error.message : 'rendering failed'}`
          fallback.className = 'math-source'; fallback.textContent = source
          element.append(message, fallback)
        }
        for (const name of ['data-chart', 'data-source-fence', 'data-notation']) element.removeAttribute(name)
      }
    } finally { clearTimeout(deadline); abort.abort(); releases.forEach(release => release()) }
  }
  doc.querySelectorAll('[data-type="mermaid"]').forEach(element => element.removeAttribute('data-chart'))
  return `<!DOCTYPE html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exported Document</title><style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:32px;line-height:1.6;color:#222;background:#fff}
pre{padding:16px;background:#f5f5f5;overflow:auto}code{font-family:ui-monospace,monospace;white-space:pre-wrap;white-space:break-spaces}pre code{white-space:pre}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}
.math-block{max-width:100%;overflow-x:auto}.math-source{white-space:pre-wrap;overflow-wrap:anywhere}
blockquote{border-left:3px solid #bbb;padding-left:16px}img,svg{max-width:100%}
${tokenCss}
${mathCss}
</style></head><body>${doc.body.innerHTML}</body></html>`
}
