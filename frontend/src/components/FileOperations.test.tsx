import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Toolbar } from './Toolbar'
import { saveCopyWithDialog, useAppStore } from '../store/useAppStore'
import { defaultConfig } from '../lib/preferences'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }))

// Mock the Tauri API
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn()
}))

describe('File Operations', () => {
  const mockEditorRef = { current: null }
  
  const mockStore = {
    config: { ...defaultConfig },
    updateConfig: vi.fn(),
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
    useAppStore.setState({ ...mockStore, documents: [mockStore.currentDocument] })
  })

  it('exposes accessible names for file operation buttons', () => {
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save As' })).toBeInTheDocument()
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
      expect(mockStore.saveDocumentAs).toHaveBeenCalledWith('/test/new-file.md', 'test-id', expect.objectContaining({ id: 'test-id' }))
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
    useAppStore.setState({ ...mockStoreNoPath, documents: [mockStoreNoPath.currentDocument] })
    
    render(<Toolbar editorViewRef={mockEditorRef} />)
    
    const saveButton = screen.getByTitle('Save')
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(save).toHaveBeenCalled()
    })
    
    await waitFor(() => {
      expect(mockStore.saveDocumentAs).toHaveBeenCalledWith('/test/new-file.md', 'test-id', expect.objectContaining({ id: 'test-id' }))
    })
  })

  it('starts Open, Save As and Save a Copy in the usable document folder', async () => {
    useAppStore.setState({ config: { ...defaultConfig, defaultDocumentFolder: '/documents' } })
    vi.mocked(invoke).mockResolvedValue(true)
    vi.mocked(open).mockResolvedValue(null)
    vi.mocked(save).mockResolvedValue(null)
    render(<Toolbar editorViewRef={mockEditorRef} />)

    fireEvent.click(screen.getByTitle('Open'))
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '/documents' })))
    fireEvent.click(screen.getByTitle('Save As'))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '/documents' })))
    await saveCopyWithDialog(mockStore.currentDocument)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Save a Copy', defaultPath: '/documents' }))
  })

  it.each(['unavailable', 'failed lookup'])('uses the native picker default on %s', async result => {
    useAppStore.setState({ config: { ...defaultConfig, defaultDocumentFolder: '/missing' } })
    if (result === 'failed lookup') vi.mocked(invoke).mockRejectedValueOnce('Lookup failed')
    else vi.mocked(invoke).mockResolvedValueOnce(false)
    vi.mocked(save).mockResolvedValue(null)
    render(<Toolbar editorViewRef={mockEditorRef} />)

    fireEvent.click(screen.getByTitle('Save As'))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] }))
    expect(invoke).toHaveBeenCalledWith('is_dialog_directory_available', { path: '/missing' })
  })
})
