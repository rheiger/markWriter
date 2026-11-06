import katex from 'katex'
import { MATH_LIMITS, mathBytes, validateMathSource } from './mathSafety'

// The callback always returns false, exactly the trust:false policy, while
// recording denied commands so callers can show an honest source fallback.
export function renderMathSource(source: string): string {
  validateMathSource(source)
  if (/\\(?:tag|label|ref|eqref)\b/.test(source)) throw new Error('Equation numbering and references are unsupported')
  let denied = false
  let html: string
  try {
    html = katex.renderToString(source, {
      displayMode: true, output: 'htmlAndMathml', throwOnError: true,
      maxExpand: MATH_LIMITS.maxExpand, maxSize: MATH_LIMITS.maxSize,
      strict: 'ignore', macros: {}, globalGroup: false,
      trust: () => { denied = true; return false },
    })
  } catch {
    // ParseError includes raw source; do not return it to the HTML layer.
    throw new Error('Invalid or unsupported math source')
  }
  if (denied) throw new Error('Math links, external resources and HTML commands are unsupported')
  if (html.length > MATH_LIMITS.outputBytes || mathBytes(html) > MATH_LIMITS.outputBytes) throw new Error('Math exceeds the 1 MiB output limit')
  return html
}
