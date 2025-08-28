import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Toolbar } from './Toolbar'
import { useAppStore } from '../store/useAppStore'

// Mock the Tauri API
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn()
}))

// Mock the store
vi.mock('../store/useAppStore', () => ({
  useAppStore: vi.fn()
}))

describe('File Operations', () => {
  const mockEditorRef = { current: null }
  
  const mockStore = {
    currentDocument: {
      id: 'test-id',
      title: 'Test Document',
      content: '# Test Content',
      path: '/test/path.md',
      isDirty: false,
      lastModified: new Date()
    },
    openDocument: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn(),
    exportDocument: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as any).mockReturnValue(mockStore)
  })

  it('should render file operation buttons', () => {
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    expect(screen.getByTitle('Open')).toBeInTheDocument()
    expect(screen.getByTitle('Save')).toBeInTheDocument()
    expect(screen.getByTitle('Save As')).toBeInTheDocument()
  })

  it('should handle open file operation', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog')
    ;(open as any).mockResolvedValue('/test/file.md')
    
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    const openButton = screen.getByTitle('Open')
    fireEvent.click(openButton)
    
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        multiple: false,
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown', 'txt']
          }
        ]
      })
    })
    
    await waitFor(() => {
      expect(mockStore.openDocument).toHaveBeenCalledWith('/test/file.md')
    })
  })

  it('should handle save operation when path exists', async () => {
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    const saveButton = screen.getByTitle('Save')
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(mockStore.saveDocument).toHaveBeenCalled()
    })
  })

  it('should handle save as operation', async () => {
    const { save } = await import('@tauri-apps/plugin-dialog')
    ;(save as any).mockResolvedValue('/test/new-file.md')
    
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    const saveAsButton = screen.getByTitle('Save As')
    fireEvent.click(saveAsButton)
    
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown']
          }
        ]
      })
    })
    
    await waitFor(() => {
      expect(mockStore.saveDocumentAs).toHaveBeenCalledWith('/test/new-file.md')
    })
  })

  it('should handle save operation when no path exists', async () => {
    const { save } = await import('@tauri-apps/plugin-dialog')
    ;(save as any).mockResolvedValue('/test/new-file.md')
    
    // Mock document without path
    const mockStoreNoPath = {
      ...mockStore,
      currentDocument: {
        ...mockStore.currentDocument,
        path: undefined
      }
    }
    ;(useAppStore as any).mockReturnValue(mockStoreNoPath)
    
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    const saveButton = screen.getByTitle('Save')
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(save).toHaveBeenCalled()
    })
    
    await waitFor(() => {
      expect(mockStore.saveDocumentAs).toHaveBeenCalledWith('/test/new-file.md')
    })
  })
})
