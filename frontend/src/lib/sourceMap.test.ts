import { describe, it, expect } from 'vitest'
import { renderMappedMarkdown } from './markdown'
import { renderedOffset, sourceOffset } from './sourceMap'

describe('parser source sidecar', () => {
  it('maps repeated inline text, escapes, entities and UTF-16 without changing ordinary render output', () => {
    const source = '# Same\r\n\r\nSame **Same** [Same](https://same) &amp; \\* 😀é\r\n'
    const map = renderMappedMarkdown(source, { documentId: 'A', revision: 1, generation: 2 })
    const doc = new DOMParser().parseFromString(map.html, 'text/html')
    expect(doc.body.textContent).toContain('Same Same Same & * 😀é')
    for (const segment of map.segments) for (let i = 0; i < segment.text.length; i++) {
      expect(source.slice(segment.starts[i], segment.ends[i])).not.toBe('')
      expect(sourceOffset(segment, i, 1)).toBe(segment.starts[i])
      expect(renderedOffset(segment, segment.starts[i])).toBeLessThanOrEqual(i)
    }
    const positions = map.segments.filter(s => s.text === 'Same').map(s => s.starts[0])
    expect(positions).toContain(source.indexOf('**Same') + 2)
    expect(positions).toContain(source.indexOf('[Same') + 1)
    const amp = map.segments.find(s => s.text.includes('&'))!
    const i = amp.text.indexOf('&')
    expect(source.slice(amp.starts[i], amp.ends[i])).toBe('&amp;')
    expect(map.owner).toEqual({ documentId: 'A', revision: 1, generation: 2 })
  })
  it('keeps cell/list occurrences local and diagram internals at block granularity', () => {
    const source = '| same | same |\n|---|---|\n| a \\| b | **same** |\n\n- same\n  continuation\n\n```mermaid\nflowchart TD\n A[same]\n```\n'
    const map = renderMappedMarkdown(source, { documentId: 'A', revision: 0, generation: 1 })
    const doc = new DOMParser().parseFromString(map.html, 'text/html')
    expect(doc.querySelectorAll('table')).toHaveLength(1)
    expect(map.segments.filter(s => s.text === 'same').map(s => s.starts[0])).toEqual([2, 9, source.indexOf('**same') + 2, source.indexOf('- same') + 2])
    expect(map.segments.some(s => s.text.includes('flowchart'))).toBe(false)
    expect(map.blocks.some(b => b.kind === 'fence' && b.from === source.indexOf('```mermaid'))).toBe(true)
    expect(map.segments.some(s => s.text === 'a | b')).toBe(true)
  })
})

it('maps code, nested tasks and underline/strike boundaries without attributing syntax to text', () => {
  const source = '- [x] **done**\n  - [ ] child\n\n++under++ ~~strike~~ `a  b`\n'
  const map = renderMappedMarkdown(source, { documentId: 'A', revision: 0, generation: 1 })
  for (const text of ['done', 'child', 'under', 'strike', 'a  b']) {
    const segment = map.segments.find(s => s.text.includes(text))!
    expect(segment).toBeDefined()
    const i = segment.text.indexOf(text)
    expect(source.slice(segment.starts[i], segment.ends[i + text.length - 1])).toBe(text)
  }
})
