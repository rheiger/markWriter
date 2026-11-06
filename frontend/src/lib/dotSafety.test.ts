import { describe, it, expect } from 'vitest'
import { validateDot, sanitizeDotSvg, DOT_LIMITS } from './dotSafety'

describe('DOT input resource boundary', () => {
  it('accepts local graph syntax, comments and escaped text labels', () => {
    expect(() => validateDot('digraph { /* image="x" */ rankdir=LR; a [label="URL=\\"text\\"", shape=box]; a -> b }')).not.toThrow()
  })
  it('treats quoted punctuation as label text or node IDs, not operators', () => {
    expect(() => validateDot('digraph { "=" [label="="]; "=" -> "<" }')).not.toThrow()
  })
  it.each(['image', 'imagepath', 'shapefile', 'URL', 'href', 'fontpath', '_background', 'stylesheet', 'layout'])('rejects %s including quoted attribute names', name => {
    for (const key of [name, `"${name}"`]) expect(() => validateDot(`digraph { a [${key}="javascript:alert(1)"] }`)).toThrow(/attribute/i)
  })
  it('rejects HTML labels and attribute-name concatenation rather than guessing semantics', () => {
    expect(() => validateDot('digraph { a [label=<<IMG SRC="file:///secret"/>>] }')).toThrow()
    expect(() => validateDot('digraph { a ["im" + "age"="x"] }')).toThrow()
  })
  it('bounds UTF-8 bytes and handles malformed strings/comments recoverably', () => {
    for (const source of ['', '漢'.repeat(DOT_LIMITS.inputBytes / 2), 'digraph { a [label="bad] }', 'digraph {/*']) expect(() => validateDot(source)).toThrow()
  })
  it('rejects gradient and multicolor paint rather than silently changing its meaning', () => {
    for (const paint of ['fillcolor="red:blue"', 'color="red:blue"', 'style=radial']) {
      expect(() => validateDot(`digraph { a [${paint}] }`)).toThrow(/gradient|multicolor/i)
    }
  })
})

describe('DOT SVG trust boundary', () => {
  const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`
  it('reconstructs static Graphviz geometry and text', () => {
    const svg = sanitizeDotSvg(wrap('<g transform="scale(1 1) rotate(0) translate(4 96)"><path fill="none" stroke="black" d="M0,1 C2,3 4,5 6,7"/><text x="1" y="2" font-family="Times,serif">Grüße &amp; 漢</text></g>'))
    expect(svg).toContain('<path')
    expect(svg).toContain('Grüße &amp; 漢')
    expect(svg).toContain('viewBox="0 0 100 100"')
  })
  it('preserves Graphviz text whitespace without copying other XML attributes', () => {
    const svg = sanitizeDotSvg(wrap('<text xml:space="preserve" xml:base="https://bad"> a   b </text>'))
    expect(svg).toContain('xml:space="preserve"'); expect(svg).toContain(' a   b '); expect(svg).not.toContain('xml:base')
  })
  it('drops executable, foreign, resource and CSS surfaces including namespace URLs', () => {
    const svg = sanitizeDotSvg(wrap('<script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://bad"/><style>@import "https://bad";</style><a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)"><text onclick="alert(1)" style="fill:url(https://bad)" fill="url(#bad)" x="1" y="2">safe</text></a>'))
    expect(svg).not.toMatch(/script|foreignObject|image|style|href|onclick|url\(|https:\/\/bad|javascript:/i)
    expect(svg).toContain('safe')
  })
  it('rejects malformed/non-SVG/oversized/entity input and bounds geometry', () => {
    for (const raw of ['<svg><g></svg>', '<html/>', '<!DOCTYPE svg [<!ENTITY x "x">]><svg>&x;</svg>', wrap('x'.repeat(DOT_LIMITS.outputBytes)), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1e99 10"/>']) expect(() => sanitizeDotSvg(raw)).toThrow()
  })
})

it('accepts only the known approximate Unicode metric warning, retaining all other renderer errors', async () => {
  const { checkedDotErrors }=await import('./dotSafety')
  expect(checkedDotErrors([{level:'warning',message:'Warning: no value for width of non-ASCII character 195. Falling back to width of space character'}])).toEqual([])
  expect(checkedDotErrors([{level:'warning',message:'Warning: unsupported style url(https://bad)'}])).toHaveLength(1)
  expect(checkedDotErrors([{level:'error',message:'Warning: no value for width of non-ASCII character 195. Falling back to width of space character'}])).toHaveLength(1)
})
