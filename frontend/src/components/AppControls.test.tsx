import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { useAppStore } from '../store/useAppStore'
import { defaultConfig } from '../lib/preferences'
import { version } from '../../package.json'
import type { Editor } from '@tiptap/core'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(), confirm: vi.fn() }))
// jsdom does not implement modal dialogs; real focus/Escape behavior is checked in-browser.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }

const source = '# Controls\n\nA paragraph.\n\n```mermaid\nflowchart TD\n A --> B\n```'

describe('application view controls', () => {
  beforeEach(() => {
    useAppStore.setState({
      documents: [], currentDocument: null,
      error: null, isLoading: false,
      config: { ...defaultConfig, theme: 'light' },
    })
    useAppStore.getState().setCurrentDocument({ id: 'controls', title: 'Controls', content: source, isDirty: false, lastModified: new Date() })
  })

  it('synchronizes explicit Auto/Light/Dark choices and the persisted highlighting controls', async () => {
    render(<App />)
    const syntax = screen.getByRole('button', { name: 'Syntax highlighting', exact: true })
    expect(syntax).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(syntax)
    expect(useAppStore.getState().config.syntaxHighlighting).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }))
    const item = screen.getByRole('menuitemcheckbox', { name: 'Syntax highlighting', exact: true })
    expect(item).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(item)
    expect(syntax).toHaveAttribute('aria-pressed', 'true')
    for (const [label, value] of [['Dark','dark'], ['Light','light'], ['Auto','system']]) {
      fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }))
      fireEvent.click(screen.getByRole('menuitemradio', { name: label, exact: true }))
      expect(useAppStore.getState().config.theme).toBe(value)
      expect(document.documentElement.getAttribute('data-theme')).toBe(value === 'system' ? null : value)
    }
    expect(useAppStore.getState().currentDocument?.content).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it('switches from toolbar and View menu without obscuring or changing the document', async () => {
    const { container } = render(<App />)
    const toggle = screen.getByRole('switch', { name: 'Markdown mode' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(container.querySelector('.editor-container [role=switch]')).toBeNull()
    fireEvent.click(toggle)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeVisible())
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'WYSIWYG', exact: true }))
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(container.querySelector('.tiptap')).toBeVisible()
    expect(useAppStore.getState().currentDocument?.content).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
    expect(screen.getByText('Ready', { exact: true })).toBeVisible()
  })

  it('keeps text size synchronized with menu zoom and Actual Size', async () => {
    render(<App />)
    const size = screen.getByRole('combobox', { name: 'Text size' })
    fireEvent.change(size, { target: { value: '20' } })
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--preview-font-size')).toBe('20px'))
    fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /Zoom In/ }))
    expect(size).toHaveValue('22')
    fireEvent.click(screen.getByTitle('Zoom Out'))
    expect(size).toHaveValue('20')
    fireEvent.click(screen.getByTitle('Zoom In'))
    expect(size).toHaveValue('22')
    fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /Actual Size/ }))
    expect(size).toHaveValue('16')
    expect(useAppStore.getState().config.fontSize).toBe(14)
    fireEvent.click(screen.getByRole('switch', { name: 'Markdown mode' }))
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'))
    expect(size).toHaveValue('14')
    fireEvent.change(size, { target: { value: '18' } })
    expect(useAppStore.getState().config).toMatchObject({ fontSize: 18, renderedFontSize: 16 })
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it('shows the current version and returns focus to Help when About closes', async () => {
    render(<App />)
    const help = screen.getByRole('button', { name: 'Help', exact: true })
    fireEvent.click(help)
    fireEvent.click(screen.getByRole('button', { name: 'About MarkWriter' }))
    const dialog = await screen.findByRole('dialog', { name: 'About MarkWriter' })
    expect(dialog).toHaveTextContent(`Version ${version}`)
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(help).toHaveFocus()
  })

  it.each(['markdown', 'wysiwyg'])('inserts an editable DOT starter through the menu in %s with one Undo', async mode => {
    const { container }=render(<App />)
    await waitFor(()=>expect((container.querySelector('.tiptap') as HTMLElement & {editor:Editor}).editor.isInitialized).toBe(true))
    if(mode==='markdown'){
      fireEvent.click(screen.getByRole('switch',{name:'Markdown mode'}))
      await waitFor(()=>expect(container.querySelector('.cm-content')).toBeVisible())
    }
    fireEvent.click(screen.getByRole('button',{name:'Insert',exact:true}))
    fireEvent.click(screen.getByRole('button',{name:'DOT',exact:true}))
    await waitFor(()=>expect(useAppStore.getState().currentDocument?.content).toContain('```dot\ndigraph'))
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(true)
    expect(container.querySelector('.menu-dropdown')).toBeNull()
    if(mode==='wysiwyg')expect(container.querySelector('.tiptap [data-type=dot]')).not.toBeNull()
    const inserted=useAppStore.getState().currentDocument!.content
    for(let i=0;i<2;i++){
      fireEvent.click(screen.getByRole('switch',{name:'Markdown mode'}))
      await waitFor(()=>expect(screen.getByRole('switch')).toHaveAttribute('aria-checked',String(mode==='wysiwyg' ? i===0 : i!==0)))
      expect(useAppStore.getState().currentDocument!.content).toBe(inserted)
    }
    fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}))
    fireEvent.click(screen.getByRole('button',{name:/^Undo/}))
    await waitFor(()=>expect(useAppStore.getState().currentDocument?.content).toBe(source))
  })
})
