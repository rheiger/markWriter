import { expect, it } from 'vitest'
import { addPlantUmlBytes, PLANTUML_DOCUMENT_LIMITS } from './plantumlBudget'

it('enforces aggregate UTF-8 bytes and saturates after an oversized block', () => {
  const limit = PLANTUML_DOCUMENT_LIMITS.inputBytes
  expect(addPlantUmlBytes(0, 'a'.repeat(limit))).toBe(limit)
  expect(addPlantUmlBytes(0, 'a'.repeat(limit + 1))).toBeGreaterThan(limit)
  expect(addPlantUmlBytes(0, '漢'.repeat(6000))).toBeGreaterThan(limit)
  expect(addPlantUmlBytes(limit + 1, 'x')).toBeGreaterThan(limit)
})
