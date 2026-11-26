// Experimental allowlist, not a complete PlantUML parser. Unsupported input
// must remain source in its caller; this function never rewrites Markdown.
export const PLANTUML_LIMITS = { inputBytes: 8192, lines: 200, entities: 40, members: 200, relations: 100, outputBytes: 512 * 1024 } as const
type Member = { visibility: '+' | '-'; name: string; type: string }
type Entity = { name: string; members: Member[] }
type Relation = { from: string; to: string; label: string; dashed: boolean; cardinalities: [string | undefined, string | undefined] | [] }
export type PlantUmlInput = { kind: 'sequence' | 'class'; source: string; entities: number; relations: number; expectedEntities: Entity[]; expectedRelations: Relation[] }
const ID = '[A-Za-z_][A-Za-z0-9_]{0,31}'
const LABEL = '[A-Za-z0-9][A-Za-z0-9 .,()_-]{0,79}'
const reserved = new Set('actor participant class interface enum abstract object component database note end startuml enduml title skinparam'.split(' '))
const declareSequence = new RegExp(`^(actor|participant)\\s+(${ID})$`)
const message = new RegExp(`^(${ID})\\s*(->|-->)\\s*(${ID})\\s*:\\s*(${LABEL})$`)
const declareClass = new RegExp(`^class\\s+(${ID})(?:\\s*(\\{))?$`)
const member = new RegExp(`^[+-]\\s*(${ID})\\s*:\\s*(${ID})$`)
const relationship = new RegExp(`^(${ID})(?:\\s+"([0-9*]{1,8})")?\\s+--\\s+(?:"([0-9*]{1,8})"\\s+)?(${ID})\\s*:\\s*(${LABEL})$`)
const bytes = (text: string) => new TextEncoder().encode(text).length

export function validatePlantUml(source: string): PlantUmlInput {
  if (source.length > PLANTUML_LIMITS.inputBytes || bytes(source) > PLANTUML_LIMITS.inputBytes) throw new Error('PlantUML input limit exceeded')
  const lines = source.split(/\r?\n/)
  if (lines.length > PLANTUML_LIMITS.lines) throw new Error('PlantUML line limit exceeded')
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  if (lines.shift()?.trim() !== '@startuml' || lines.pop()?.trim() !== '@enduml') throw new Error('PlantUML requires a single @startuml and @enduml')
  const names = new Set<string>(), references: string[] = []
  const expectedEntities: Entity[] = [], expectedRelations: Relation[] = []
  let kind: PlantUmlInput['kind'] | undefined, inClass = false, members = 0, relations = 0
  const setKind = (next: PlantUmlInput['kind']) => { if (kind && kind !== next) throw new Error('Mixed PlantUML diagrams are unsupported'); kind = next }
  const addName = (name: string) => {
    if (reserved.has(name.toLowerCase()) || names.has(name)) throw new Error('Unsupported or duplicate PlantUML name')
    names.add(name); expectedEntities.push({name, members:[]})
    if (names.size > PLANTUML_LIMITS.entities) throw new Error('PlantUML entity limit exceeded')
  }
  const addRelation = (a: string, b: string) => {
    references.push(a, b)
    if (++relations > PLANTUML_LIMITS.relations) throw new Error('PlantUML relationship limit exceeded')
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (inClass) {
      if (line === '}') { inClass = false; continue }
      const field = member.exec(line)
      if (!field || ++members > PLANTUML_LIMITS.members) throw new Error('Unsupported PlantUML class member')
      expectedEntities[expectedEntities.length - 1].members.push({visibility:line[0] as '+' | '-', name:field[1], type:field[2]})
      continue
    }
    let match = declareSequence.exec(line)
    if (match) { setKind('sequence'); addName(match[2]); continue }
    match = message.exec(line)
    if (match) { setKind('sequence'); addRelation(match[1], match[3]); expectedRelations.push({from:match[1], to:match[3], label:match[4], dashed:match[2] === '-->', cardinalities:[]}); continue }
    match = declareClass.exec(line)
    if (match) { setKind('class'); addName(match[1]); inClass = Boolean(match[2]); continue }
    match = relationship.exec(line)
    if (match) { setKind('class'); addRelation(match[1], match[4]); expectedRelations.push({from:match[1], to:match[4], label:match[5], dashed:false, cardinalities:[match[2], match[3]]}); continue }
    throw new Error('Unsupported PlantUML syntax')
  }
  if (inClass || !kind || !names.size || kind === 'sequence' && !relations) throw new Error('Incomplete PlantUML diagram')
  if (references.some(name => !names.has(name))) throw new Error('Undeclared PlantUML participant or class')
  return { kind, source, entities: names.size, relations, expectedEntities, expectedRelations }
}

// A successful engine callback may contain its syntax-error diagram. Verify
// expected entity identities, endpoints, fields and labels before sanitization.
// This is a semantic check, not an SVG security sanitizer; callers must apply a
// separate non-lossy SVG allowlist before displaying or exporting the result.
export function checkPlantUmlSvg(svg: string, input: PlantUmlInput): void {
  if (svg.length > PLANTUML_LIMITS.outputBytes || bytes(svg) > PLANTUML_LIMITS.outputBytes || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('PlantUML SVG limit or declaration rejected')
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || doc.querySelector('parsererror') || doc.querySelectorAll('*').length > 50000) throw new Error('Invalid PlantUML SVG')
  const nodes = Array.from(doc.querySelectorAll('g')).filter(g => input.kind === 'sequence' ? g.getAttribute('class') === 'participant participant-head' : g.getAttribute('class') === 'entity')
  if (nodes.length !== input.expectedEntities.length) throw new Error('PlantUML entity output mismatch')
  const ids = new Map<string, string>(), nodeByName = new Map<string, Element>()
  for (const expected of input.expectedEntities) {
    const node = nodes.find(n => n.getAttribute('data-qualified-name') === expected.name)
    if (!node || !Array.from(node.querySelectorAll('text')).some(t => t.textContent === expected.name)) throw new Error('PlantUML entity output mismatch')
    const uid = node.getAttribute(input.kind === 'sequence' ? 'data-entity-uid' : 'id')
    if (!uid || [...ids.values()].includes(uid)) throw new Error('PlantUML entity identity mismatch')
    ids.set(expected.name, uid); nodeByName.set(expected.name, node)
    const fields = Array.from(node.querySelectorAll('[data-visibility-modifier]'))
    if (fields.length !== expected.members.length) throw new Error('PlantUML member output mismatch')
    for (let fieldIndex = 0; fieldIndex < expected.members.length; fieldIndex++) {
      const field = expected.members[fieldIndex], glyph = fields[fieldIndex]
      const visibility = field.visibility === '+' ? 'PUBLIC_FIELD' : 'PRIVATE_FIELD'
      const label = glyph.nextElementSibling
      if (glyph.getAttribute('data-visibility-modifier') !== visibility || label?.localName !== 'text' || label.textContent !== `${field.name}: ${field.type}`) throw new Error('PlantUML member output mismatch')
    }
  }
  const edges = Array.from(doc.querySelectorAll('g')).filter(g => g.getAttribute('class') === (input.kind === 'sequence' ? 'message' : 'link') && (input.kind === 'class' || g.querySelector('text')))
  if (edges.length !== input.expectedRelations.length) throw new Error('PlantUML relationship output mismatch')
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i], expected = input.expectedRelations[i]
    if (edge.getAttribute('data-entity-1') !== ids.get(expected.from) || edge.getAttribute('data-entity-2') !== ids.get(expected.to)) throw new Error('PlantUML relationship endpoints mismatch')
    const texts = Array.from(edge.querySelectorAll('text'))
    if (!texts.some(t => t.textContent === expected.label)) throw new Error('PlantUML relationship label mismatch')
    if (input.kind === 'class' && expected.cardinalities.some(Boolean)) {
      if (expected.from === expected.to) throw new Error('PlantUML self-association multiplicity is unsupported')
      const center = (name: string) => {
        const rect = nodeByName.get(name)?.querySelector('rect')
        if (!rect) throw new Error('PlantUML class geometry missing')
        const x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y'))
        const width = Number(rect.getAttribute('width')), height = Number(rect.getAttribute('height'))
        if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('Invalid PlantUML class geometry')
        return {x:x + width / 2, y:y + height / 2}
      }
      const ends = [center(expected.from), center(expected.to)]
      const cardinalities = texts.slice(1)
      if (cardinalities.length !== expected.cardinalities.filter(Boolean).length) throw new Error('PlantUML multiplicity mismatch')
      for (let side = 0; side < 2; side++) {
        const value = expected.cardinalities[side]
        if (!value) continue
        const at = cardinalities.findIndex(t => {
          if (t.textContent !== value) return false
          const x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y'))
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false
          const distance = (i: number) => (x - ends[i].x) ** 2 + (y - ends[i].y) ** 2
          return distance(side) < distance(1 - side)
        })
        if (at < 0) throw new Error('PlantUML multiplicity endpoint mismatch')
        cardinalities.splice(at, 1)
      }
    }
    if (input.kind === 'sequence') {
      const line = edge.querySelector('line')
      if (!line || Boolean(line.getAttribute('stroke-dasharray')) !== expected.dashed) throw new Error('PlantUML arrow style mismatch')
    }
  }
}
