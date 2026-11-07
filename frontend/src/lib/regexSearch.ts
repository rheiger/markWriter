export interface RegexGroup { from: number; to: number; index: number; name?: string }
export interface RegexHit { from: number; to: number; groups: RegexGroup[]; values: (string | undefined)[]; named: Record<string, string | undefined> }
export interface SearchSegment { text: string; start: number }
export interface RegexRequest { pattern: string; caseSensitive: boolean; wholeWord: boolean; segments: SearchSegment[] }
export interface RegexResult { hits: RegexHit[]; error?: string; limited?: boolean }

const MAX_SEGMENTS = 10_000
const RESULT_BUDGET = 1_000_000
const REPLACEMENT_BUDGET = 16_000_000
const TEMPLATE_LIMIT = 64_000
const RESULT_ERROR = 'Regex result exceeds the memory limit.'

function requestError(request: RegexRequest): string | undefined {
  if (request.pattern.length > 1024) return 'Pattern exceeds 1,024 characters.'
  if (request.segments.length > MAX_SEGMENTS) return 'Regex search exceeds the 10,000 segment limit.'
  if (request.segments.reduce((n, s) => n + s.text.length, 0) > 1_000_000) return 'Regex search is limited to 1,000,000 UTF-16 units.'
}

// This function runs only inside a disposable worker in production. Indices are UTF-16,
// the native coordinate system of both editing engines.
export function executeRegex(request: RegexRequest): RegexResult {
  const invalid = requestError(request)
  if (invalid) return { hits: [], error: invalid }
  try {
    const expression = new RegExp(request.pattern, request.caseSensitive ? 'dgu' : 'dgiu')
    const hits: RegexHit[] = []
    let cost = 0
    const word = /[\p{L}\p{N}\p{M}_]/u
    for (const segment of request.segments) {
      expression.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = expression.exec(segment.text))) {
        if (match.length > 65) return { hits: [], error: 'Regex search supports at most 64 capture groups.' }
        const indices = (match as RegExpExecArray & { indices: (Array<[number, number] | undefined> & { groups?: Record<string, [number, number] | undefined> }) }).indices
        const from = match.index, to = from + match[0].length
        const before = segment.text.slice(Math.max(0, from - 2), from).match(/.$/u)?.[0] ?? ''
        const after = String.fromCodePoint(segment.text.codePointAt(to) ?? 0)
        if (!request.wholeWord || !word.test(before) && !word.test(after)) {
          const names = indices.groups ?? {}
          // Count every copied value, named duplicate and fixed metadata before
          // constructing retained objects or posting structured-clone data.
          cost += 64 + match.length * 32 + Object.keys(names).length * 32
          for (const value of match) cost += value?.length ?? 0
          for (const [name, value] of Object.entries(match.groups ?? {})) cost += name.length * 2 + (value?.length ?? 0)
          if (cost > RESULT_BUDGET) return { hits: [], error: RESULT_ERROR }
          const groups = indices.slice(1).flatMap((range, i) => range ? [{ from: segment.start + range[0], to: segment.start + range[1], index: i + 1, name: Object.keys(names).find(name => names[name] === range) }] : [])
          hits.push({ from: segment.start + from, to: segment.start + to, groups, values: Array.from(match), named: { ...match.groups } })
          if (hits.length >= 2000) return { hits, limited: true }
        }
        if (to === from) expression.lastIndex = from + (segment.text.codePointAt(from)! > 0xffff ? 2 : 1)
      }
    }
    return { hits }
  } catch (error) { return { hits: [], error: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}` } }
}

// Replacement supports $$, $&, $1..$99 and $<name>. Unknown references stay literal;
// unmatched existing captures expand to empty text.
export function expandReplacement(template: string, hit: RegexHit): string {
  return template.replace(/\$\$|\$&|\$<([^>]+)>|\$(\d{1,2})/g, (token, name: string | undefined, number: string | undefined) => {
    if (token === '$$') return '$'
    if (token === '$&') return hit.values[0] ?? ''
    if (name !== undefined) return Object.prototype.hasOwnProperty.call(hit.named, name) ? hit.named[name] ?? '' : token
    const n = Number(number)
    return n > 0 && n < hit.values.length ? hit.values[n] ?? '' : token
  })
}

// Preflight all outputs before allocating any expanded replacement or editing.
export function prepareReplacements(template: string, hits: HitForReplacement[], regex: boolean): { replacements?: string[]; error?: string } {
  if (template.length > TEMPLATE_LIMIT) return { error: 'Replacement exceeds the 64,000 character limit.' }
  const tokenPattern = /\$\$|\$&|\$<([^>]+)>|\$(\d{1,2})/g
  const tokens = regex ? Array.from(template.matchAll(tokenPattern)) : []
  if (tokens.length * hits.length > 1_000_000) return { error: 'Replacement exceeds the expansion work limit.' }
  let total = 0
  for (const hit of hits) {
    let size = template.length
    for (const token of tokens) {
      let value: string | undefined
      if (token[0] === '$$') value = '$'
      else if (token[0] === '$&') value = hit.values?.[0] ?? ''
      else if (token[1] !== undefined) value = Object.prototype.hasOwnProperty.call(hit.named, token[1]) ? hit.named?.[token[1]] ?? '' : token[0]
      else { const index = Number(token[2]); value = index > 0 && index < (hit.values?.length ?? 0) ? hit.values?.[index] ?? '' : token[0] }
      size += value.length - token[0].length
      if (size > REPLACEMENT_BUDGET) return { error: 'Replacement output exceeds the 16,000,000 character limit.' }
    }
    total += size
    if (total > REPLACEMENT_BUDGET) return { error: 'Replacement output exceeds the 16,000,000 character limit.' }
  }
  return { replacements: hits.map(hit => regex ? expandReplacement(template, hit as RegexHit) : template) }
}
type HitForReplacement = { from: number; to: number; values?: (string | undefined)[]; named?: Record<string, string | undefined> }

// Validate structured-clone data before it can become decorations or edits. Capture
// ranges may lie outside a zero-width match (lookaround), but not its segment.
export function validateRegexResult(data: unknown, request: RegexRequest): RegexResult {
  const fail = (): RegexResult => ({ hits: [], error: 'Invalid regex worker response.' })
  if (!data || typeof data !== 'object') return fail()
  const result = data as RegexResult
  if (!Array.isArray(result.hits) || result.hits.length > 2000 || (result.limited !== undefined && typeof result.limited !== 'boolean') || (result.error !== undefined && (typeof result.error !== 'string' || result.error.length > 1024))) return fail()
  if (result.error) return result.hits.length === 0 && !result.limited ? { hits: [], error: result.error } : fail()
  let cost = 0, segmentIndex = 0, previousEnd = -1
  for (const hit of result.hits) {
    if (!hit || !Number.isSafeInteger(hit.from) || !Number.isSafeInteger(hit.to) || hit.from > hit.to || hit.from < previousEnd || !Array.isArray(hit.groups) || hit.groups.length > 64 || !Array.isArray(hit.values) || hit.values.length < 1 || hit.values.length > 65 || !hit.named || typeof hit.named !== 'object' || Array.isArray(hit.named)) return fail()
    while (segmentIndex < request.segments.length && hit.from > request.segments[segmentIndex].start + request.segments[segmentIndex].text.length) segmentIndex++
    const segment = request.segments[segmentIndex]
    if (!segment || hit.from < segment.start || hit.to > segment.start + segment.text.length || hit.values[0] !== segment.text.slice(hit.from - segment.start, hit.to - segment.start)) return fail()
    const names = Object.entries(hit.named)
    if (names.length > 64) return fail()
    cost += 64 + hit.values.length * 32 + names.length * 32
    for (const value of hit.values) { if (value !== undefined && typeof value !== 'string') return fail(); cost += value?.length ?? 0 }
    for (const [name, value] of names) { if (!name || name.length > 1024 || value !== undefined && typeof value !== 'string') return fail(); cost += name.length * 2 + (value?.length ?? 0) }
    if (cost > RESULT_BUDGET) return fail()
    let lastIndex = 0
    for (const group of hit.groups) {
      if (!group || !Number.isSafeInteger(group.index) || group.index <= lastIndex || group.index >= hit.values.length || !Number.isSafeInteger(group.from) || !Number.isSafeInteger(group.to) || group.from < segment.start || group.to < group.from || group.to > segment.start + segment.text.length || hit.values[group.index] !== segment.text.slice(group.from - segment.start, group.to - segment.start)) return fail()
      if (group.name !== undefined && (typeof group.name !== 'string' || hit.named[group.name] !== hit.values[group.index])) return fail()
      lastIndex = group.index
    }
    if (hit.values.some((value, index) => index > 0 && value !== undefined && !hit.groups.some(group => group.index === index))) return fail()
    if (names.some(([name, value]) => value !== undefined && !hit.groups.some(group => group.name === name))) return fail()
    previousEnd = hit.to
  }
  return result
}

export function startRegex(request: RegexRequest, complete: (result: RegexResult) => void): () => void {
  const invalid = requestError(request)
  if (invalid) { complete({ hits: [], error: invalid }); return () => {} }
  let worker: Worker
  try { worker = new Worker(new URL('./regexSearch.worker.ts', import.meta.url), { type: 'module' }) }
  catch { complete({ hits: [], error: 'Regex worker is unavailable.' }); return () => {} }
  let done = false
  const finish = (result: RegexResult) => { if (done) return; done = true; clearTimeout(timer); worker.terminate(); complete(result) }
  const timer = setTimeout(() => finish({ hits: [], error: 'Regex search timed out. Simplify the pattern or search a smaller document.' }), 500)
  worker.onmessage = event => finish(validateRegexResult(event.data, request))
  worker.onerror = () => finish({ hits: [], error: 'Regex worker failed.' })
  worker.postMessage(request)
  return () => { done = true; clearTimeout(timer); worker.terminate() }
}
