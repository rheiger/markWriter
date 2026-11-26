import { sanitizeDotSvg } from './dotSafety'

// The same strict resource-free SVG copier as DOT, with only the exact
// additional presentation attributes emitted by the pinned runtime.
export function sanitizePlantUmlSvg(svg: string): string {
  return sanitizeDotSvg(svg, { rejectLossy: true, plantuml: true })
}
