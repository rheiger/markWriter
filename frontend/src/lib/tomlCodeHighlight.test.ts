import { describe, expect, it } from 'vitest'
import { createHtmlExport } from './htmlExport'
import { renderMappedMarkdown } from './markdown'
import { LONG_CODE_LIMIT, createCodeHighlighter, createQuickLookHighlighter, highlightCode, highlightedHtml } from './codeHighlight'

const toml = `# Example configuration
[owner.profile]
name = "Richard 😀 & <editor>"
'quoted.key'.enabled = true
retries = 1_000
ratio = -3.14
created = 1979-05-27T07:32:00Z
[[servers]]
name = 'first'
ports = [8000, 8001]
# final comment
`

function textFromHtml(code: string, result: ReturnType<typeof highlightCode>) {
  const node = document.createElement('code')
  node.innerHTML = highlightedHtml(code, result)
  return node.textContent
}

function classesAt(code: string, result: ReturnType<typeof highlightCode>, token: string) {
  const offset = code.indexOf(token)
  expect(offset).toBeGreaterThanOrEqual(0)
  return result.ranges.filter(range => range.from <= offset && range.to >= offset + token.length).map(range => range.className).join(' ')
}

describe('explicit TOML highlighting', () => {
  it('colors tables, dotted keys, comments, strings, booleans, numbers and date components while preserving text', () => {
    const result = highlightCode(toml, 'TOML title="example"')
    expect(result.language).toBe('toml')
    for (const [token, name] of [['[owner.profile]', 'section'], ['[[servers]]', 'section'], ["'quoted.key'.enabled", 'attr'], ['# Example configuration', 'comment'], ['"Richard 😀 & <editor>"', 'string'], ['true', 'literal'], ['1_000', 'number'], ['1979', 'number']]) {
      expect(classesAt(toml, result, token)).toContain(`hljs-${name}`)
    }
    expect(textFromHtml(toml, result)).toBe(toml)
  })

  it('preserves malformed input and handles long TOML through its final token in both budgets', () => {
    const long = '[package]\n' + Array.from({ length: 300 }, (_, n) => `dependency_${n} = "version-${n}" # pinned\n`).join('') + 'final_sentinel = true\n'
    expect(long.length).toBeGreaterThan(10 * 1024)
    expect(long.length).toBeLessThanOrEqual(LONG_CODE_LIMIT)
    for (const result of [createCodeHighlighter(true)(long, 'toml'), createQuickLookHighlighter()(long, 'toml')]) {
      expect(classesAt(long, result, 'final_sentinel')).toContain('hljs-attr')
      expect(classesAt(long, result, 'true')).toContain('hljs-literal')
      expect(textFromHtml(long, result)).toBe(long)
    }
    const malformed = '[unclosed\nkey = "unterminated\n <script>&\n'
    expect(textFromHtml(malformed, highlightCode(malformed, 'toml'))).toBe(malformed)
    const standalone = '[package]\n' + Array.from({ length: 2600 }, (_, n) => `dependency_${n} = "version-${n}" # pinned\n`).join('') + 'final_sentinel = true\n'
    expect(standalone.length).toBeGreaterThan(100 * 1024)
    const quickLook = createQuickLookHighlighter()(standalone, 'toml')
    expect(classesAt(standalone, quickLook, 'final_sentinel')).toContain('hljs-attr')
    expect(textFromHtml(standalone, quickLook)).toBe(standalone)
    const documentHighlight = createCodeHighlighter(true)
    expect(documentHighlight(long, 'toml').ranges.length).toBeGreaterThan(0)
    expect(documentHighlight(long, 'toml').ranges.length).toBeGreaterThan(0)
    expect(documentHighlight(long, 'toml').ranges).toEqual([])
  })

  it('does not expand automatic detection or explicit unknown/plain handling and retains size bounds', () => {
    expect(highlightCode(toml, 'unknown').ranges).toEqual([])
    expect(highlightCode(toml, 'plaintext').ranges).toEqual([])
    expect(highlightCode('x'.repeat(LONG_CODE_LIMIT + 1), 'toml').ranges).toEqual([])
    expect(highlightCode(toml).language).not.toBe('toml')
  })
})

function tomlFence(code: string) {
  return '```toml\n' + code + '```\n'
}

async function renderedToml(source: string, highlighting = true) {
  const owner = { documentId: 'toml', revision: 1, generation: 1 }
  const preview = renderMappedMarkdown(source, owner, highlighting).html
  const exported = await createHtmlExport(source, 'toml:1:export', highlighting)
  return [preview, exported].map(html => new DOMParser().parseFromString(html, 'text/html'))
}

describe('large TOML in Preview and HTML export', () => {
  it('highlights more than 110 KiB through the final key and preserves every code character', async () => {
    const value = 'Zürich 日本語 & <configured>'.repeat(8)
    const code = Array.from({ length: 600 }, (_, index) => `key_${index} = "${value}"\n`).join('') +
      'final_large_toml = true\n'
    expect(new TextEncoder().encode(code).length).toBeGreaterThan(110 * 1024)
    expect(code.length).toBeLessThan(128 * 1024)

    const source = tomlFence(code)
    for (const doc of await renderedToml(source)) {
      expect(doc.querySelector('pre code')?.textContent).toBe(code)
      expect([...doc.querySelectorAll('.hljs-attr')].map(node => node.textContent)).toContain('final_large_toml')
      expect(doc.querySelector('pre[data-toml-fallback]')).toBeNull()
      expect(doc.querySelector('script')).toBeNull()
    }
    expect(createCodeHighlighter(true)(code, 'toml').ranges).toEqual([])
  })

  it('keeps complete source at the size boundary and visibly falls back beyond content, line and span limits', async () => {
    const padding = Array.from({ length: 127 }, () => '#'.padEnd(1023, 'x') + '\n').join('')
    const fenceLimit = 128 * 1024
    const tail = 'boundary_marker = true\n'
    const atLimit = padding + '#'.padEnd(fenceLimit - padding.length - tail.length - 1, 'x') + '\n' + tail
    expect(atLimit.length).toBe(fenceLimit)
    for (const doc of await renderedToml(tomlFence(atLimit) + tomlFence('over_document_budget = true\n'))) {
      const [large, remainder] = Array.from(doc.querySelectorAll('pre'))
      expect(large.querySelector('code')?.textContent).toBe(atLimit)
      expect([...large.querySelectorAll('.hljs-attr')].map(node => node.textContent)).toContain('boundary_marker')
      expect(remainder.querySelector('code')?.textContent).toBe('over_document_budget = true\n')
      expect(remainder.hasAttribute('data-toml-fallback')).toBe(true)
    }

    const rejected = [
      atLimit.replace('#x', '#xx'),
      `text = "${'x'.repeat(2048)}"\n`,
      'a = 1\n'.repeat(6500),
    ]
    for (const doc of await renderedToml(rejected.map(tomlFence).join(''))) {
      for (const [index, block] of [...doc.querySelectorAll('pre')].entries()) {
        expect(block.querySelector('code')?.textContent).toBe(rejected[index])
        expect(block.querySelector('.hljs-attr')).toBeNull()
        expect(block.hasAttribute('data-toml-fallback')).toBe(true)
      }
    }
    for (const doc of await renderedToml(tomlFence(rejected[1]), false)) {
      expect(doc.querySelector('pre code')?.textContent).toBe(rejected[1])
      expect(doc.querySelector('pre[data-toml-fallback]')).toBeNull()
    }
  })
})
