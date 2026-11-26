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
import { checkPlantUmlSvg } from './plantUmlSafety'

describe('PlantUML callback output semantics', () => {
  it('accepts actual Worker SVG with matching participant and message identity', () => {
    const src = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml'
    expect(() => checkPlantUmlSvg(sequenceSvg, validatePlantUml(src))).not.toThrow()
  })
  it('accepts actual Worker SVG with matching classes, fields and associations', () => {
    const src = '@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order : owns\n@enduml'
    expect(() => checkPlantUmlSvg(classSvg, validatePlantUml(src))).not.toThrow()
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
