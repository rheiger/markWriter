import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useAppStore } from '../store/useAppStore'
import { dbmlRenderer } from '../lib/dbmlRenderer'
import { dbmlToDot } from '../lib/dbml'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }))
vi.mock('../lib/sqlDdlClient', async () => {
  const { convertSqlDdl } = await import('../lib/sqlDdl')
  return { convertSqlInWorker: vi.fn(async (source, dialect) => convertSqlDdl(source, dialect)) }
})
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }

const original = '# Existing  document\r\n\r\nA  paragraph with ` spaced  code `.'
const sql = 'CREATE TABLE account (id INTEGER PRIMARY KEY, name TEXT DEFAULT \'Guest\');'

function openImport() {
  fireEvent.click(screen.getByRole('button', { name: 'Insert', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Import SQL DDL…' }))
  fireEvent.change(screen.getByLabelText('SQL dialect'), { target: { value: 'postgresql' } })
  fireEvent.click(screen.getByRole('button', { name: 'Choose SQL file…' }))
}

describe('SQL import through the application', () => {
  beforeEach(() => {
    useAppStore.setState({ documents: [], currentDocument: null, error: null })
    useAppStore.getState().setCurrentDocument({
      id: 'import-owner', title: 'Existing', content: original, path: '/existing.md', isDirty: false, lastModified: new Date(),
    })
    vi.mocked(invoke).mockImplementation(async command => command === 'pick_sql_source' ? sql : null)
    vi.spyOn(dbmlRenderer, 'render').mockImplementation(async source => {
      dbmlToDot(source)
      return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(['markdown', 'wysiwyg'])('appends reviewed DBML as one exact Undo in %s', async mode => {
    const { container } = render(<StrictMode><App /></StrictMode>)
    if (mode === 'markdown') fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(container.querySelector(mode === 'markdown' ? '.cm-content' : '.tiptap')).toBeVisible())
    openImport()
    const preview = await screen.findByRole('textbox', { name: 'DBML preview' })
    expect(screen.getByText(/default.*omitted/i)).toBeVisible()
    fireEvent.change(preview, { target: { value: 'Table edited { id int [pk] }' } })
    fireEvent.click(screen.getByRole('button', { name: 'Append DBML' }))
    const expected = original + '\r\n\r\n```dbml\r\nTable edited { id int [pk] }\r\n```\r\n'
    await waitFor(() => expect(useAppStore.getState().currentDocument?.content).toBe(expected))
    expect(useAppStore.getState().currentDocument?.path).toBe('/existing.md')
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /^Undo / }))
    expect(useAppStore.getState().currentDocument?.content).toBe(original)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /^Redo / }))
    expect(useAppStore.getState().currentDocument?.content).toBe(expected)
  })

  it('protects a Markdown destination ending in a bare carriage return', async () => {
    const content = '# Existing document\r'
    useAppStore.getState().setCurrentDocument({ id: 'cr', title: 'CR', content, isDirty: false, lastModified: new Date() })
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeVisible())
    openImport()
    await screen.findByRole('textbox', { name: 'DBML preview' })
    fireEvent.click(screen.getByRole('button', { name: 'Append DBML' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('bare carriage return')
    expect(useAppStore.getState().currentDocument?.content).toBe(content)
  })

  it('does not append after the destination changes while validation is pending', async () => {
    let finish!: (svg: string) => void
    const pending = new Promise<string>(resolve => { finish = resolve })
    vi.mocked(dbmlRenderer.render).mockReturnValueOnce(pending)
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.tiptap')).toBeVisible())
    openImport()
    await screen.findByRole('textbox', { name: 'DBML preview' })
    fireEvent.click(screen.getByRole('button', { name: 'Append DBML' }))
    act(() => {
      const store = useAppStore.getState()
      store.setCurrentDocument({ id: 'different', title: 'Different', content: 'Other', isDirty: false, lastModified: new Date() })
      store.activateDocument('import-owner')
    })
    await act(async () => { finish('<svg />'); await pending })
    expect(await screen.findByRole('alert')).toHaveTextContent('The destination changed')
    expect(useAppStore.getState().currentDocument?.content).toBe(original)
    expect(useAppStore.getState().documents.find(doc => doc.id === 'different')?.content).toBe('Other')
  })
})
