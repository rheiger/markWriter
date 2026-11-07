import { describe, it, expect } from 'vitest'
import { acceptsNativeCommand } from './nativeCommands'
describe('captured native menu ownership', () => {
  it('accepts only the current generation and blocks commands behind a modal', () => {
    expect(acceptsNativeCommand({generation:4},4,false)).toBe(true)
    expect(acceptsNativeCommand({generation:3},4,false)).toBe(false)
    expect(acceptsNativeCommand({generation:4},4,true)).toBe(false)
  })
})
