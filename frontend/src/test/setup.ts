import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>test</svg>' })
  }
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom has no layout engine; keep real editor/parser behavior and supply geometry only.
const rect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} })
Range.prototype.getBoundingClientRect = rect
Range.prototype.getClientRects = () => Object.assign([], { item: () => null })
HTMLElement.prototype.scrollIntoView = () => {}
