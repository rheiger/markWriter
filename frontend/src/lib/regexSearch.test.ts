import { describe, expect, it, vi } from 'vitest'
import { executeRegex, expandReplacement } from './regexSearch'

describe('regex search contract', () => {
  it('captures UTF-16 ranges, nesting, names and unmatched groups', () => {
    const { hits } = executeRegex({ pattern: '(?<outer>a(b))(c)?', caseSensitive: true, wholeWord: false, segments: [{ text: '😀ab', start: 4 }] })
    expect(hits[0].from).toBe(6)
    expect(hits[0].groups.map(g => [g.from, g.to, g.index])).toEqual([[6, 8, 1], [7, 8, 2]])
    expect(expandReplacement('$$ $& $1 $2 $3 $<outer> $<unknown>', hits[0])).toBe('$ ab ab b  ab $<unknown>')
  })
  it('advances empty matches by Unicode code point and caps results', () => {
    const request = { pattern: '(?:)', caseSensitive: true, wholeWord: false, segments: [{ text: '😀a', start: 0 }] }
    expect(executeRegex(request).hits.map(h => h.from)).toEqual([0, 2, 3])
    expect(executeRegex({ ...request, segments: [{ text: 'x'.repeat(3000), start: 0 }] }).limited).toBe(true)
  })
  it('reports invalid expressions and rejects excessive input', () => {
    const request = { pattern: '(', caseSensitive: true, wholeWord: false, segments: [{ text: '', start: 0 }] }
    expect(executeRegex(request).error).toMatch(/Invalid/)
    expect(executeRegex({ ...request, pattern: 'x', segments: [{ text: 'x'.repeat(1_000_001), start: 0 }] }).error).toMatch(/limited/)
  })
})

it('fails closed before repeated lookahead captures exceed the result memory budget', () => {
  const result = executeRegex({ pattern: '(?=(a*))', caseSensitive: true, wholeWord: false,
    segments: [{ text: 'a'.repeat(30_000), start: 0 }] })
  expect(result.error).toMatch(/limit|large|budget/i)
  expect(result.hits).toEqual([])
})

it('bounds aggregate expansion before constructing replacement strings', async () => {
  const { prepareReplacements } = await import('./regexSearch')
  const hit = executeRegex({ pattern: '(x)', caseSensitive: true, wholeWord: false, segments: [{ text: 'x', start: 0 }] }).hits[0]
  expect(prepareReplacements('$1'.repeat(1000), Array(20_000).fill(hit), true).error).toMatch(/limit/)
  expect(prepareReplacements('x'.repeat(64_001), [hit], false).error).toMatch(/limit/)
  expect(prepareReplacements('$1!', [hit], true).replacements).toEqual(['x!'])
})

it('validates worker data, including lookaround capture ranges outside a match', async () => {
  const { validateRegexResult } = await import('./regexSearch')
  const request = { pattern: '(?=(?<ahead>ab))', caseSensitive: true, wholeWord: false, segments: [{ text: 'ab', start: 5 }] }
  const valid = executeRegex(request)
  expect(validateRegexResult(valid, request)).toEqual(valid)
  const badRange = structuredClone(valid); badRange.hits[0].groups[0].to = 8
  expect(validateRegexResult(badRange, request).error).toMatch(/Invalid/)
  const badValue = structuredClone(valid); badValue.hits[0].values[1] = 'wrong'
  expect(validateRegexResult(badValue, request).error).toMatch(/Invalid/)
  const badOrder = { hits: [valid.hits[0], { ...valid.hits[0], from: 4, to: 4 }] }
  expect(validateRegexResult(badOrder, request).error).toMatch(/Invalid/)
  expect(validateRegexResult({ hits: [null] }, request).error).toMatch(/Invalid/)
  expect(executeRegex({ ...request, segments: Array(10001).fill({ text: '', start: 0 }) }).error).toMatch(/segment limit/)
})


it('rejects malformed data at the worker message boundary and terminates the worker', async () => {
  const { startRegex } = await import('./regexSearch')
  let instance: { onmessage?: (event: { data: unknown }) => void; terminate: ReturnType<typeof vi.fn> } | undefined
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void
    onerror = null
    terminate = vi.fn()
    postMessage() { instance = this }
  }
  vi.stubGlobal('Worker', FakeWorker)
  try {
    const complete = vi.fn()
    startRegex({ pattern: 'x', caseSensitive: true, wholeWord: false, segments: [{ text: 'x', start: 0 }] }, complete)
    instance!.onmessage!({ data: { hits: [{ from: 0, to: 100, groups: [], values: ['x'], named: {} }] } })
    expect(complete).toHaveBeenCalledWith({ hits: [], error: 'Invalid regex worker response.' })
    expect(instance!.terminate).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})
