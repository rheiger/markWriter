import { createLowlight } from 'lowlight'
import type { Root, RootContent } from 'hast'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import objectivec from 'highlight.js/lib/languages/objectivec'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import rust from 'highlight.js/lib/languages/rust'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import yaml from 'highlight.js/lib/languages/yaml'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import css from 'highlight.js/lib/languages/css'
import swift from 'highlight.js/lib/languages/swift'
import makefile from 'highlight.js/lib/languages/makefile'

// Local, pinned grammars only. lowlight's public AST API preserves UTF-16 text offsets:
// https://github.com/wooorm/lowlight#lowlightHighlightlanguage-value-options
const grammars = { c, cpp, csharp, objectivec, sql, bash, rust, python, go, yaml, json, xml, javascript, typescript, dockerfile, css, swift, makefile }
const lowlight = createLowlight(grammars)
const aliases: Record<string, string> = {
  'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', 'c#': 'csharp', cs: 'csharp',
  'objective-c': 'objectivec', objc: 'objectivec', 'obj-c': 'objectivec', m: 'objectivec', mm: 'objectivec',
  sh: 'bash', zsh: 'bash', shell: 'bash', rs: 'rust', py: 'python', golang: 'go', yml: 'yaml',
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', html: 'xml', htm: 'xml', svg: 'xml', docker: 'dockerfile',
}
export const CODE_LIMIT = 4 * 1024
// Explicit Python/JSON are independently qualified for longer technical examples.
// Keep the conservative cap for other grammars (notably C++), and never enlarge auto work.
export const LONG_CODE_LIMIT = 16 * 1024
export const AUTO_LIMIT = 2 * 1024
const LINE_LIMIT = 2 * 1024
const DOCUMENT_LIMIT = 16 * 1024
const LONG_DOCUMENT_LIMIT = 32 * 1024
const SPAN_LIMIT = 4096
export interface CodeRange { from: number; to: number; className: string }
export interface CodeHighlight { language: string | null; ranges: readonly CodeRange[] }
const plain: CodeHighlight = { language: null, ranges: [] }
const cache = new Map<string, CodeHighlight>()
let cacheSize = 0

function rangesFor(tree: Root): CodeRange[] {
  const ranges: CodeRange[] = []
  let offset = 0
  const visit = (nodes: RootContent[], inherited: string[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        const to = offset + node.value.length
        if (to > offset && inherited.length) ranges.push({ from: offset, to, className: inherited.join(' ') })
        offset = to
      } else if (node.type === 'element') {
        const classes = Array.isArray(node.properties.className) ? node.properties.className.filter((name): name is string => typeof name === 'string' && /^[\w-]+$/.test(name)) : []
        visit(node.children, [...inherited, ...classes])
      }
    }
  }
  visit(tree.children, [])
  return ranges.length > SPAN_LIMIT ? [] : ranges
}

function codeLanguage(info: string) {
  const word = info.trim().split(/\s/, 1)[0].toLowerCase()
  return Object.hasOwn(aliases, word) ? aliases[word] : word
}
const longerGrammar = (language: string) => language === 'python' || language === 'json'
function eligible(code: string, language: string) {
  const limit = longerGrammar(language) ? LONG_CODE_LIMIT : language ? CODE_LIMIT : AUTO_LIMIT
  return code.length > 0 && code.length <= limit &&
    (!language || lowlight.registered(language)) &&
    !code.split(/\r\n?|\n/).some(line => line.length > LINE_LIMIT)
}

export function highlightCode(code: string, info = ''): CodeHighlight {
  const language = codeLanguage(info)
  if (!eligible(code, language)) return plain
  const key = language + '\0' + code
  const cached = cache.get(key)
  if (cached) { cache.delete(key); cache.set(key, cached); return cached }
  let result: CodeHighlight = plain
  try {
    let tree: Root | undefined
    if (language) tree = lowlight.highlight(language, code)
    else {
      // Relevance is a heuristic, not a language guarantee. Close/weak matches stay plain.
      // Comparing a fixed set gives a runner-up without relying on private emitter APIs.
      const candidates = Object.keys(grammars).map(name => lowlight.highlight(name, code))
        .sort((a,b) => (b.data?.relevance ?? 0) - (a.data?.relevance ?? 0))
      const best = candidates[0].data?.relevance ?? 0, second = candidates[1].data?.relevance ?? 0
      if (best >= 5 && best - second >= 2 && best >= second * 1.25) tree = candidates[0]
    }
    if (tree) result = { language: String(tree.data?.language ?? language), ranges: rangesFor(tree) }
  } catch { /* A grammar failure affects presentation only. Keep all source as plain text. */ }
  cache.set(key, result); cacheSize += key.length
  while (cache.size > 128 || cacheSize > 512 * 1024) {
    const oldest = cache.keys().next().value!
    cache.delete(oldest); cacheSize -= oldest.length
  }
  return result
}

// New budget per document render/rebuild, including cache hits. No document writes.
export function createCodeHighlighter(enabled: boolean) {
  let remaining = DOCUMENT_LIMIT, longerRemaining = LONG_DOCUMENT_LIMIT, blocks = 64, automatic = 4
  return (code: string, info = ''): CodeHighlight => {
    const language = codeLanguage(info), longer = longerGrammar(language)
    if (!enabled || --blocks < 0 || !eligible(code, language) ||
      code.length > (longer ? longerRemaining : remaining) || (!language && --automatic < 0)) return plain
    if (longer) longerRemaining -= code.length
    else remaining -= code.length
    return highlightCode(code, info)
  }
}
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function highlightedHtml(code: string, result: CodeHighlight): string {
  let html = '', from = 0
  for (const range of result.ranges) {
    html += escape(code.slice(from, range.from)) + `<span class="${range.className}">${escape(code.slice(range.from, range.to))}</span>`
    from = range.to
  }
  return html + escape(code.slice(from))
}
