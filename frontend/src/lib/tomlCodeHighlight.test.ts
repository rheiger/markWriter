import { describe, expect, it } from 'vitest'
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
