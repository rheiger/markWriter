import { describe, expect, it } from 'vitest'
import { PLANTUML_LIMITS, validatePlantUml } from './plantUmlSafety'

const sequence = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\nBob --> Alice: Response\n@enduml'
const klass = '@startuml\nclass User {\n +id: int\n +name: string\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'

describe('PlantUML supported subset', () => {
  it('recognizes and retains complete sequence and class sources', () => {
    expect(validatePlantUml(sequence)).toMatchObject({ kind:'sequence', source:sequence })
    expect(validatePlantUml(sequence + '\n').source).toBe(sequence + '\n')
    expect(validatePlantUml(klass)).toMatchObject({ kind:'class', source:klass })
  })
  it.each([
    '@startuml\n!theme missing\nAlice -> Bob : ok\n@enduml',
    '@startuml\n!include /tmp/a.puml\n@enduml',
    '@startuml\n!include http://localhost/a\n@enduml',
    '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: <img:http://localhost/a>\n@enduml',
    '@startuml\nclass {\n@enduml',
    '@startuml\nactor Alice\nAlice -> Bob: no declaration\n@enduml',
    '@startuml\nactor Alice\nclass Bob\n@enduml',
    '@startuml\nclass A {\n+id: int\n@enduml',
    '@startuml\nactor Alice\n@enduml\n!include x',
  ])('rejects unsupported or malformed input without invoking a renderer', source => {
    expect(() => validatePlantUml(source)).toThrow()
  })
  it('bounds input in UTF-8 bytes as well as characters', () => {
    expect(() => validatePlantUml('a'.repeat(PLANTUML_LIMITS.inputBytes + 1))).toThrow(/limit/i)
    expect(() => validatePlantUml('漢'.repeat(PLANTUML_LIMITS.inputBytes / 2))).toThrow(/limit/i)
  })
  it('rejects duplicate declarations and references to missing classes', () => {
    expect(() => validatePlantUml('@startuml\nclass A\nclass A\n@enduml')).toThrow()
    expect(() => validatePlantUml('@startuml\nclass A\nA -- B: owns\n@enduml')).toThrow()
  })
})

import sequenceSvg from './fixtures/plantuml/sequence.svg?raw'
import classSvg from './fixtures/plantuml/class.svg?raw'
import privateSvg from './fixtures/plantuml/private.svg?raw'
import sequenceReturnSvg from './fixtures/plantuml/sequence-return.svg?raw'
import { checkPlantUmlSvg } from './plantUmlSafety'

describe('PlantUML callback output semantics', () => {
  it('accepts actual Worker SVG with matching participant and message identity', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    expect(() => checkPlantUmlSvg(sequenceSvg, validatePlantUml(src))).not.toThrow()
  })
  it('accepts a matching reverse dashed response', () => {
    expect(() => checkPlantUmlSvg(sequenceReturnSvg, validatePlantUml(sequence))).not.toThrow()
  })
  it('accepts actual Worker SVG with matching classes, fields and associations', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    expect(() => checkPlantUmlSvg(classSvg, validatePlantUml(src))).not.toThrow()
  })
  it('rejects a participant role mismatch even when labels still match', () => {
    const src = '@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    expect(() => checkPlantUmlSvg(sequenceSvg, validatePlantUml(src))).toThrow()
  })
  it('rejects an arrowhead pointing toward the source participant', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const corrupted = sequenceSvg.replace('99.64,102', '24.83,102')
    expect(corrupted).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(corrupted, validatePlantUml(src))).toThrow()
  })
  it('rejects swapped association multiplicities', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "*" -- "1" Order : owns\n@enduml'
    expect(() => checkPlantUmlSvg(classSvg, validatePlantUml(src))).toThrow()
  })
  it('rejects an association with metadata but no visible path', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace(/<path d="[^"]+"[^>]*><\/path>/, '')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow(/geometry/i)
  })
  it('rejects an association disconnected from its classes', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace('M42,71.174', 'M999,71.174')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow(/geometry/i)
  })
  it('rejects a message line displaced from its lifelines', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replace('x1="24.83" y1="102"', 'x1="999" y1="102"')
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow(/geometry/i)
  })
  it('rejects relationship geometry moved by an ancestor transform', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replaceAll('class="message" data-entity-1="part1"', 'class="message" transform="translate(999 0)" data-entity-1="part1"')
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow(/geometry/i)
  })
  it('rejects a relationship hidden by group opacity', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace('class="link"', 'class="link" opacity="0"')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow(/geometry/i)
  })
  it('rejects a transparent or zero-width relationship', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace('stroke="#181818" stroke-width="1"></path>', 'stroke="none" stroke-width="0"></path>')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow(/geometry/i)
  })
  it('rejects an entity hidden by inherited opacity', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace('class="entity"', 'class="entity" opacity="0"')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects a hidden association multiplicity', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace(/(<text[^>]*)(>1<\/text>)/, '$1 opacity="0"$2')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects an off-canvas message label', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replace(/(<text x=")[^"]+("[^>]*>Request<\/text>)/, (_, left, right) => `${left}999${right}`)
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects a zero-area arrowhead', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replace(/(<polygon points=")[^"]+("[^>]*>)/, (_, left, right) => `${left}99.64,102 99.64,102 99.64,102${right}`)
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('accepts an actual Worker private field with a private visibility mark', () => {
    const src = '@startuml\nclass User {\n -id: int\n}\n@enduml'
    expect(() => checkPlantUmlSvg(privateSvg, validatePlantUml(src))).not.toThrow()
  })
  it('rejects a reversed arrowhead despite matching destination metadata', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replace('89.64,98 99.64,102 89.64,106 93.64,102', '109.64,98 99.64,102 109.64,106 105.64,102')
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects a hidden participant lifeline', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replace('class="participant-lifeline"', 'class="participant-lifeline" opacity="0"')
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects a public visibility mark recolored to the class background', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    const changed = classSvg.replace('stroke="#038048"', 'stroke="#F1F1F1"')
    expect(changed).not.toBe(classSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects a displaced actor body', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    const changed = sequenceSvg.replace('M24.83,21.5 L24.83,48.5', 'M124.83,21.5 L124.83,48.5')
    expect(changed).not.toBe(sequenceSvg)
    expect(() => checkPlantUmlSvg(changed, validatePlantUml(src))).toThrow()
  })
  it('rejects error SVGs returned in a success callback', () => {
    const error = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Syntax Error</text></svg>'
    expect(() => checkPlantUmlSvg(error, validatePlantUml(sequence))).toThrow()
  })
  it('rejects a partially rendered diagram or missing relationship', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    expect(() => checkPlantUmlSvg(classSvg.replace('data-entity-2="ent0002"', 'data-entity-2="ent0999"'), validatePlantUml(src))).toThrow()
  })
})
