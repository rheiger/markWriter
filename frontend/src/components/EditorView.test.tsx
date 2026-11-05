import { createRef } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { EditorView, type EditorViewRef } from './EditorView'
import { toWysiwygHtml } from '../lib/markdown'
import { useAppStore } from '../store/useAppStore'

const chart = 'flowchart TD\n  A["<b>Start</b> & finish"] --> B[End]'
const fixture = '# Document\n\nA paragraph.\n\n```mermaid\n' + chart + '\n```\n\n| Name | Value |\n| --- | --- |\n| **Bold** | a \\| b |\n\n- [x] Done\n- [ ] Pending\n'

async function mount(content = fixture) {
  useAppStore.setState({ currentDocument: {
    id: 'doc-1', title: 'Test', content, path: '/test.md', isDirty: false, lastModified: new Date(),
  } })
  const ref = createRef<EditorViewRef>()
  const result = render(<EditorView ref={ref} />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const editor = (result.container.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor
  return { ...result, ref, editor }
}

async function markdown(ref: React.RefObject<EditorViewRef>) {
  fireEvent.click(screen.getByRole('button', { name: 'Markdown', exact: true }))
  await waitFor(() => expect(ref.current?.getEditorView()).toBeTruthy())
}
async function wysiwyg() {
  fireEvent.click(screen.getByRole('button', { name: 'WYSIWYG', exact: true }))
  await waitFor(() => expect(document.querySelector('.tiptap')).toBeVisible())
}

describe('document fidelity with real editors', () => {
  beforeEach(() => useAppStore.setState({ currentDocument: null, error: null }))

  it('shows the welcome state without a document', () => {
    render(<EditorView />)
    expect(screen.getByText('Welcome to MarkWriter')).toBeVisible()
  })

  it('loads Mermaid source literally, including HTML-like labels', async () => {
    const { editor } = await mount()
    const charts: string[] = []
    editor.state.doc.descendants(node => { if (node.type.name === 'mermaid') charts.push(node.attrs.chart.trim()) })
    expect(charts).toEqual([chart])
  })

  it('preserves original Markdown and clean state through five unedited switches', async () => {
    const { ref } = await mount()
    for (let i = 0; i < 5; i++) {
      await markdown(ref)
      expect(useAppStore.getState().currentDocument?.content).toBe(fixture)
      expect(ref.current?.getMarkdown()).toBe(fixture)
      await wysiwyg()
    }
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it('preserves diagrams, formatted table cells and task state after a WYSIWYG edit', async () => {
    const { ref, editor } = await mount()
    act(() => { editor.commands.insertContentAt(1, 'Edited ') })
    const content = useAppStore.getState().currentDocument!.content
    expect(content).toContain(chart)
    expect(content).toContain('**Bold**')
    expect(content).toContain('a \\| b')
    expect(content).toContain('- [x] Done')
    expect(content).toContain('- [ ] Pending')
    for (let i = 0; i < 3; i++) { await markdown(ref); await wysiwyg() }
    expect(useAppStore.getState().currentDocument?.content).toBe(content)
  })

  it('reads current WYSIWYG content through the public editor ref before Markdown is mounted', async () => {
    const { ref } = await mount()
    expect(ref.current?.getMarkdown()).toBe(fixture)
  })
  it('applies the editor API in WYSIWYG mode, including undo and redo', async () => {
    const { ref, editor } = await mount('# Original')
    act(() => ref.current!.insertText('New '))
    expect(editor.getText()).toContain('New ')
    act(() => ref.current!.undo())
    expect(editor.getText()).not.toContain('New ')
    act(() => ref.current!.redo())
    expect(editor.getText()).toContain('New ')
    act(() => ref.current!.setMarkdown('# Replacement'))
    expect(editor.getText().trim()).toBe('Replacement')
    expect(ref.current!.getMarkdown()).toBe('# Replacement')
  })

  it('shows current content after replacing a document and switching modes', async () => {
    const { ref } = await mount()
    await markdown(ref)
    act(() => useAppStore.setState({ currentDocument: {
      ...useAppStore.getState().currentDocument!, id: 'doc-2', content: '# Second document',
    } }))
    await wysiwyg()
    expect(document.querySelector('.tiptap')).toHaveTextContent('Second document')
    await markdown(ref)
    expect(ref.current!.getEditorView()!.state.doc.toString()).toBe('# Second document')
  })

  it('retains an image when editing surrounding WYSIWYG text', async () => {
    const { editor } = await mount('Before\n\n![Diagram](diagram.png "Caption")\n\nAfter')
    act(() => { editor.commands.insertContentAt(1, 'Edited ') })
    expect(useAppStore.getState().currentDocument!.content).toContain('![Diagram](diagram.png "Caption")')
  })

  it('does not undo into a previously opened document', async () => {
    const { ref, editor } = await mount('# First')
    act(() => { editor.commands.insertContentAt(1, 'Edited ') })
    await markdown(ref)
    act(() => { ref.current!.insertText('Markdown edit') })
    act(() => useAppStore.setState({ currentDocument: {
      ...useAppStore.getState().currentDocument!, id: 'second', content: '# Second', isDirty: false,
    } }))
    await wysiwyg()
    act(() => { ref.current!.undo() })
    expect(useAppStore.getState().currentDocument!.content).toBe('# Second')
    await markdown(ref)
    act(() => { ref.current!.undo() })
    expect(useAppStore.getState().currentDocument!.content).toBe('# Second')
  })

  it('preserves table column alignment after a surrounding edit', async () => {
    const { editor } = await mount('Before\n\n| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |')
    act(() => { editor.commands.insertContentAt(1, 'Edited ') })
    const content = useAppStore.getState().currentDocument!.content
    const doc = new DOMParser().parseFromString(toWysiwygHtml(content), 'text/html')
    expect(Array.from(doc.querySelectorAll('th'), cell => cell.style.textAlign)).toEqual(['left', 'center', 'right'])
  })

  it('preserves nested list structure and task formatting after a surrounding edit', async () => {
    const { editor } = await mount('Before\n\n- Parent\n  - Child **bold**\n  - Other\n\n- [x] Task **bold**\n  - [ ] Nested task')
    act(() => { editor.commands.insertContentAt(1, 'Edited ') })
    const doc = new DOMParser().parseFromString(toWysiwygHtml(useAppStore.getState().currentDocument!.content), 'text/html')
    expect(doc.querySelector('li ul li strong')?.textContent).toBe('bold')
    expect(doc.querySelector('li[data-checked="true"] strong')?.textContent).toBe('bold')
    expect(doc.querySelector('li[data-checked="true"] li[data-checked="false"]')).not.toBeNull()
  })

  it('preserves code language and literal fence content after a surrounding edit', async () => {
    const { editor } = await mount('Before\n\n````typescript\nconst literal = "```";\n````')
    act(() => { editor.commands.insertContentAt(1, 'Edited ') })
    const doc = new DOMParser().parseFromString(toWysiwygHtml(useAppStore.getState().currentDocument!.content), 'text/html')
    expect(doc.querySelector('code.language-typescript')?.textContent).toBe('const literal = "```";\n')
  })

})
