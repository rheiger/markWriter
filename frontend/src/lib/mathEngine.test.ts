import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { renderMathSource } from './mathEngine'
import { MATH_LIMITS, validateMathOutput } from './mathSafety'
import { mathExportCss } from './mathStyles'

describe('offline math engine', () => {
  it.each([
    String.raw`\frac{a_1 + \alpha}{\sqrt{b^2 + \beta}}`,
    String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,
    String.raw`\begin{aligned} x &= y + z \\ y &= \int_0^1 x^2\,dx \end{aligned}`,
    String.raw`\overbrace{x+y}^{\text{sum}}\xrightarrow[\sim]{\infty}\widehat{a+b}`,
    String.raw`\cancel{x}+\text{a src=example href=label}`,
    Array.from({ length: 150 }, (_, i) => `x_{${i}}`).join('+'),
  ])('renders real KaTeX source with accessible MathML and passes output validation', source => {
    expect(katex.version).toBe('0.19.1')
    const html = renderMathSource(source)
    expect(validateMathOutput(html)).toBe(html)
    expect(html).toContain('katex-mathml')
    expect(html).toContain('katex-html')
  })
  it('rejects malformed math, untrusted links, images, HTML, and macro-expanded resources', () => {
    for (const source of [String.raw`\frac{a}`, String.raw`\href{https://example.org}{x}`, String.raw`\includegraphics{https://example.org/x}`, String.raw`\htmlStyle{color:red}{x}`, String.raw`\def\evil{\href{https://example.org}{x}}\evil`]) {
      expect(() => renderMathSource(source)).toThrow()
    }
  })
  it('bounds macro expansion and prevents definitions from leaking between blocks', () => {
    expect(() => renderMathSource(String.raw`\def\a{\a}\a`)).toThrow()
    expect(renderMathSource(String.raw`\gdef\abc{a}\abc`)).toContain('katex')
    expect(() => renderMathSource(String.raw`\abc`)).toThrow()
  })
  it('rejects numbering and references and enforces UTF-8 source bytes', () => {
    for (const command of ['tag', 'label', 'ref', 'eqref']) expect(() => renderMathSource(`x\\${command}{id}`)).toThrow(/numbering|references/)
    expect(() => renderMathSource('漢'.repeat(Math.ceil(MATH_LIMITS.inputBytes / 3)))).toThrow(/16 KiB/)
  })
  it('treats injected output and executable styles as invalid before insertion', () => {
    for (const html of [
      '<span class="katex-display"><img src="https://bad.example/"></span>',
      '<span class="katex-display"><span onclick="alert(1)">x</span></span>',
      '<span class="katex-display"><span style="background:url(https://bad.example/)">x</span></span>',
      '<span class="katex-display"><svg><foreignObject>x</foreignObject></svg></span>',
    ]) expect(() => validateMathOutput(html)).toThrow()
  })
  it('embeds every referenced font as local data in standalone export styles', () => {
    expect(mathExportCss.match(/data:font\/woff2;base64,/g)).toHaveLength(20)
    expect(mathExportCss).not.toMatch(/url\((?!["']?data:)/)
    expect(mathExportCss).toContain('.katex-display')
  })
})
