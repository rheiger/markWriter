import { describe, expect, it } from 'vitest'
import { dbmlToDot } from './dbml'

describe('bounded DBML subset', () => {
  it('preserves qualified names, composite keys and relationship endpoints', () => {
    const dot = dbmlToDot(`Table "a.b"."表" {\n "x y" int [pk, not null]\n z varchar(20)\n indexes {\n ("x y", z) [unique]\n }\n}\nTable child {\n a int\n b int\n}\nRef: child.(a,b) > "a.b"."表".("x y",z)`)
    expect(dot).toContain('表')
    expect(dot).toContain('UK (\\"x y\\", z)')
    expect(dot).toContain('child (a, b) >')
    expect(dot).toContain('PK, NOT NULL')
  })
  it('rejects unsupported and unresolved data rather than dropping it', () => {
    expect(() => dbmlToDot('Table a {\n x int [default: 1]\n}')).toThrow(/Unsupported/)
    expect(() => dbmlToDot('Table a {\n x int\n}\nRef: a.x > b.id')).toThrow(/Unknown/)
    expect(() => dbmlToDot('Table a {\n x int\n}\nProject p {}')).toThrow()
  })
  it('escapes DOT control sequences in quoted labels', () => {
    const dot = dbmlToDot('Table "bad\\\\N" {\n "x\\"y" text\n}')
    expect(dot).toContain('bad')
    expect(dot).toContain('x')
  })
})

describe('DBML limits and identity', () => {
  it('rejects malformed, unsupported and inconsistent relationships', () => {
    expect(() => dbmlToDot('Table a {\n x int\n}\nRef: a.x > a.(x,x)')).toThrow()
    expect(() => dbmlToDot('Table a {\n x int\n}\nRef: a.x >? a.x')).toThrow()
    expect(() => dbmlToDot('Table a {\n x int\n indexes {\n (x, missing) [pk]\n }\n}')).toThrow(/Unknown/)
    expect(() => dbmlToDot('Table a {\n x int\n}\n'.repeat(10000))).toThrow(/32 KiB/)
  })
  it('distinguishes schema-qualified identifiers even when display names contain dots', () => {
    const result = dbmlToDot('Table "a.b".c {\n x int\n}\nTable a."b.c" {\n y int\n}\nRef: "a.b".c.x < a."b.c".y')
    expect(result).toContain('t0 -> t1')
    expect(result).toContain('one to many')
  })
})

it('renders escaped schema labels through the real offline DOT engine and sanitizer', async () => {
  const { instance } = await import('@viz-js/viz')
  const { sanitizeDotSvg, checkedDotErrors, validateDot } = await import('./dotSafety')
  const dot = dbmlToDot('Table "unsafe <script>" {\n "x\\"y" int [pk]\n}\nTable child {\n id int [ref: > "unsafe <script>"."x\\"y"]\n}')
  validateDot(dot)
  const viz = await instance()
  const result = viz.render(dot, { format: 'svg', engine: 'dot' })
  expect(result.status).toBe('success')
  expect(checkedDotErrors(result.errors)).toHaveLength(0)
  const clean = sanitizeDotSvg(result.output)
  expect(clean).not.toContain('<script>')
  expect(new DOMParser().parseFromString(clean, 'image/svg+xml').documentElement.textContent).toContain('unsafe <script>')
  expect(clean).toContain('many to one')
})
