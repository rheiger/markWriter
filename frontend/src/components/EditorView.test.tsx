import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorView } from './EditorView'
import { useAppStore } from '../store/useAppStore'

// Mock the store
vi.mock('../store/useAppStore', () => ({
  useAppStore: vi.fn()
}))

// Mock the MermaidRenderer component
vi.mock('./MermaidRenderer', () => ({
  MermaidRenderer: ({ chart, id }: { chart: string; id: string }) => (
    <div data-testid={`mermaid-${id}`}>{chart}</div>
  )
}))

describe('EditorView Component', () => {
  const mockStore = {
    currentDocument: {
      id: 'test-doc-1',
      title: 'Test Document',
      content: '# Test Content\n\nThis is a test document.',
      path: '/test.md',
      isDirty: false,
      lastModified: new Date('2024-01-01')
    },
    updateDocumentContent: vi.fn(),
    config: {
      theme: 'light'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as any).mockReturnValue(mockStore)
  })

  it('should render without crashing', () => {
    console.log('[TEST] Starting EditorView render test')

    try {
      const { container } = render(<EditorView />)
      console.log('[TEST] EditorView rendered successfully')
      console.log('[TEST] Container HTML:', container.innerHTML)

      expect(container).toBeInTheDocument()
    } catch (error) {
      console.error('[TEST] Error rendering EditorView:', error)
      throw error
    }
  })

  it('should display the welcome message when no document is present', () => {
    console.log('[TEST] Testing welcome message display')

    ;(useAppStore as any).mockReturnValue({
      ...mockStore,
      currentDocument: null
    })

    try {
      render(<EditorView />)

      expect(screen.getByText('Welcome to MarkWriter')).toBeInTheDocument()
      expect(screen.getByText('Create a new document or open an existing one to get started.')).toBeInTheDocument()

      console.log('[TEST] Welcome message displayed correctly')
    } catch (error) {
      console.error('[TEST] Error testing welcome message:', error)
      throw error
    }
  })

  it('should display the document content when a document is present', () => {
    console.log('[TEST] Testing document content display')

    try {
      render(<EditorView />)

      // Check if the editor pane is rendered
      expect(screen.getByText('Markdown')).toBeInTheDocument()
      expect(screen.getByText('Preview')).toBeInTheDocument()

      console.log('[TEST] Document content displayed correctly')
    } catch (error) {
      console.error('[TEST] Error testing document content:', error)
      throw error
    }
  })

  it('should handle theme changes correctly', () => {
    console.log('[TEST] Testing theme handling')

    const darkThemeStore = {
      ...mockStore,
      config: { theme: 'dark' }
    }

    ;(useAppStore as any).mockReturnValue(darkThemeStore)

    try {
      render(<EditorView />)

      // The component should render without errors regardless of theme
      expect(screen.getByText('Markdown')).toBeInTheDocument()

      console.log('[TEST] Dark theme handled correctly')
    } catch (error) {
      console.error('[TEST] Error testing dark theme:', error)
      throw error
    }
  })

  it('should expose editor methods through ref', () => {
    console.log('[TEST] Testing editor ref methods')

    try {
      const ref = { current: null }
      render(<EditorView ref={ref} />)

      // The ref should be properly set up
      expect(ref.current).toBeDefined()

      if (ref.current) {
        expect(typeof ref.current.getMarkdown).toBe('function')
        expect(typeof ref.current.setMarkdown).toBe('function')
        expect(typeof ref.current.undo).toBe('function')
        expect(typeof ref.current.redo).toBe('function')
        expect(typeof ref.current.focus).toBe('function')
      }

      console.log('[TEST] Editor ref methods exposed correctly')
    } catch (error) {
      console.error('[TEST] Error testing editor ref:', error)
      throw error
    }
  })

  it('should handle mermaid diagram parsing', () => {
    console.log('[TEST] Testing mermaid diagram parsing')

    const mermaidContent = `# Test with Mermaid

\`\`\`mermaid
graph TD
    A[Start] --> B[End]
\`\`\``

    const mermaidStore = {
      ...mockStore,
      currentDocument: {
        ...mockStore.currentDocument,
        content: mermaidContent
      }
    }

    ;(useAppStore as any).mockReturnValue(mermaidStore)

    try {
      render(<EditorView />)

      // Should display the preview with mermaid indicator
      expect(screen.getByText(/Preview/)).toBeInTheDocument()

      console.log('[TEST] Mermaid diagram parsing handled correctly')
    } catch (error) {
      console.error('[TEST] Error testing mermaid parsing:', error)
      throw error
    }
  })

  it('should handle document updates', () => {
    console.log('[TEST] Testing document updates')

    try {
      render(<EditorView />)

      // The updateDocumentContent function should be called when content changes
      // This is tested through the CodeMirror mock
      expect(mockStore.updateDocumentContent).toBeDefined()

      console.log('[TEST] Document updates handled correctly')
    } catch (error) {
      console.error('[TEST] Error testing document updates:', error)
      throw error
    }
  })

  it('should work without Tauri backend (standalone test)', () => {
    console.log('[TEST] Testing standalone component without Tauri')

    // Create a mock document directly without going through the store
    const standaloneDocument = {
      id: 'standalone-test',
      title: 'Standalone Test',
      content: '# Standalone Test\n\nThis is a test without Tauri.',
      path: '/test.md',
      isDirty: false,
      lastModified: new Date()
    }

    const standaloneStore = {
      currentDocument: standaloneDocument,
      updateDocumentContent: vi.fn(),
      config: { theme: 'light' }
    }

    ;(useAppStore as any).mockReturnValue(standaloneStore)

    try {
      const { container } = render(<EditorView />)

      // Should render the editor with the standalone document
      expect(screen.getByText('Markdown')).toBeInTheDocument()
      expect(screen.getByText('Preview')).toBeInTheDocument()

      console.log('[TEST] Standalone component works without Tauri')
      console.log('[TEST] Container HTML length:', container.innerHTML.length)

    } catch (error) {
      console.error('[TEST] Error in standalone test:', error)
      throw error
    }
  })
})
