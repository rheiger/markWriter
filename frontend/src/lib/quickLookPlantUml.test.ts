import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@plantuml/core', async () => {
  const sequence = await import('./fixtures/plantuml/sequence.svg?raw')
  const classes = await import('./fixtures/plantuml/class.svg?raw')
  const privateClass = await import('./fixtures/plantuml/private.svg?raw')
  return { renderToString: vi.fn((lines: string[], success: (svg: string) => void) => success(lines.some(line => line.trim().startsWith('-id:')) ? privateClass.default : lines.some(line => line.startsWith('class ')) ? classes.default : sequence.default)) }
})
import { quickLookRender } from './quickLookRender'
import { renderToString } from '@plantuml/core'
import sequenceSvg from './fixtures/plantuml/sequence.svg?raw'

const empty = '<!doctype html><html><head></head><body></body></html>'
const sequence = '@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml\n'
const classes = '@startuml\nclass User {\n  +id: int\n}\nclass Order {\n  +id: int\n}\nUser "1" -- "*" Order: owns\n@enduml\n'
const privateClass = '@startuml\nclass User {\n -id: int\n}\n@enduml\n'
const fence = (source: string) => '```plantuml\n' + source + '```\n'

function stubRasterizer() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), measureText: (text: string) => ({ width: text.length * 8 }) } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
  vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} })
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Finder PlantUML evidence', () => {
  it.each([sequence, classes, privateClass])('renders a supported diagram and retains its exact source', async source => {
    stubRasterizer()
    const result = new DOMParser().parseFromString(await quickLookRender(empty, fence(source)), 'text/html')
    expect(result.querySelector('img')?.getAttribute('alt')).toBe('PlantUML diagram')
    expect(result.querySelector('details code')?.textContent).toBe(source)
  })

  it.each([
    '@startuml\n!include file:///tmp/synthetic.puml\n@enduml\n',
    '@startuml\nAlice -> Bob: <img:http://127.0.0.1:9/synthetic.png>\n@enduml\n',
    '@startuml\n!theme missingtheme\nAlice -> Bob: Message\n@enduml\n',
    '@startuml\nclass {\n@enduml\n',
    '@startuml\n' + 'Alice -> Bob: Message\n'.repeat(500) + '@enduml\n',
  ])('keeps unsupported or over-budget input as readable source', async source => {
    stubRasterizer()
    const result = new DOMParser().parseFromString(await quickLookRender(empty, fence(source)), 'text/html')
    expect(result.querySelector('img')).toBeNull()
    expect(result.querySelector('pre code')?.textContent).toBe(source)
  })

  it('keeps source when the success callback returns an error SVG', async () => {
    stubRasterizer()
    vi.mocked(renderToString).mockImplementationOnce((_lines, success) => success('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Syntax Error</text></svg>'))
    const result = new DOMParser().parseFromString(await quickLookRender(empty, fence(sequence)), 'text/html')
    expect(result.querySelector('img')).toBeNull()
    expect(result.querySelector('pre code')?.textContent).toBe(sequence)
  })

  it('keeps source when rasterization would strip a filter', async () => {
    stubRasterizer()
    vi.mocked(renderToString).mockImplementationOnce((_lines, success) => success(sequenceSvg.replace('<defs></defs>', '<defs><filter id="f"></filter></defs>')))
    const result = new DOMParser().parseFromString(await quickLookRender(empty, fence(sequence)), 'text/html')
    expect(result.querySelector('img')).toBeNull()
    expect(result.querySelector('pre code')?.textContent).toBe(sequence)
  })
})
