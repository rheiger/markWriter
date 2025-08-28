import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri API
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}))

// Mock CodeMirror modules
vi.mock('@codemirror/view', () => ({
  EditorView: Object.assign(vi.fn().mockImplementation(() => ({
    state: {
      doc: { toString: () => 'test content' },
      selection: { main: { from: 0, to: 0 } }
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
    dom: { parentNode: null }
  })), {
    updateListener: { of: vi.fn() },
    theme: vi.fn()
  }),
  keymap: { of: vi.fn() },
}))

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn().mockReturnValue({
      doc: { toString: () => 'test content' },
      selection: { main: { from: 0, to: 0 } }
    })
  }
}))

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn()
}))

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: vi.fn()
}))

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  historyKeymap: [],
  history: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn()
}))

vi.mock('@codemirror/search', () => ({
  searchKeymap: []
}))

// Mock marked
vi.mock('marked', () => ({
  marked: {
    parse: vi.fn().mockReturnValue('<p>test</p>')
  }
}))

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
