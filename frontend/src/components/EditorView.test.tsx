import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { EditorView, type EditorViewRef } from './EditorView'
import { toWysiwygHtml } from '../lib/markdown'
import { useAppStore } from '../store/useAppStore'

const chart = 'flowchart TD\n  A["<b>Start</b> & finish"] --> B[End]'
const fixture = '# Document\n\nA paragraph.\n\n```mermaid\n' + chart + '\n```\n\n| Name | Value |\n| --- | --- |\n| **Bold** | a \\| b |\n\n- [x] Done\n- [ ] Pending\n'

async function mount(content = fixture) {
  useAppStore.getState().setCurrentDocument({
    id: 'doc-1', title: 'Test', content, path: '/test.md', isDirty: false, lastModified: new Date(),
  })
  const ref = createRef<EditorViewRef>()
  const result = render(<EditorView ref={ref} />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const editor = (result.container.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor
  return { ...result, ref, editor }
}

async function markdown(ref: React.RefObject<EditorViewRef>) {
  act(() => ref.current!.setMode('markdown'))
  await waitFor(() => expect(ref.current?.getEditorView()).toBeTruthy())
}
async function wysiwyg(ref: React.RefObject<EditorViewRef>) {
  act(() => ref.current!.setMode('wysiwyg'))
  await waitFor(() => expect(document.querySelector('[data-active="true"] .tiptap')).toBeVisible())
}

describe('document fidelity with real editors', () => {
  beforeEach(() => useAppStore.setState({ documents: [], currentDocument: null, error: null }))

  it('shows the welcome state without a document', () => {
    render(<EditorView />)
    expect(screen.getByText('Welcome to MarkWriter')).toBeVisible()
  })

  it('retains both histories and mode when switching A → B → A', async () => {
    const { ref, editor } = await mount('# First')
    act(() => editor.commands.insertContentAt(1, 'WYS '))
    await markdown(ref)
    act(() => ref.current!.insertText('Source '))
    const a = ref.current!.getMarkdown()
    act(() => useAppStore.getState().setCurrentDocument({ id: 'B', title: 'B', content: '# Second', isDirty: false, lastModified: new Date() }))
    act(() => ref.current!.insertText('B edit '))
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe('# Second')
    act(() => useAppStore.getState().activateDocument('doc-1'))
    expect(ref.current!.getMarkdown()).toBe(a)
    expect(document.querySelector('[data-active="true"] .cm-content')).toBeVisible()
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).not.toContain('Source ')
    await wysiwyg(ref)
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).not.toContain('WYS ')
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
      await wysiwyg(ref)
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
    for (let i = 0; i < 3; i++) { await markdown(ref); await wysiwyg(ref) }
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
    act(() => useAppStore.getState().setCurrentDocument({
      ...useAppStore.getState().currentDocument!, id: 'doc-2', content: '# Second document',
    }))
    await wysiwyg(ref)
    expect(document.querySelector('[data-active="true"] .tiptap')).toHaveTextContent('Second document')
    await markdown(ref)
    expect(ref.current!.getEditorView()!.state.doc.toString()).toBe('# Second document')
  })

  it('inserts ERD outside the current table so its source survives serialization', async () => {
    const { ref, editor } = await mount(fixture)
    const { mermaidErdTemplate } = await import('../lib/templates')
    let position = 0
    editor.state.doc.descendants((node, pos) => { if (!position && node.type.name === 'tableCell') position = pos + 2 })
    act(() => editor.commands.setTextSelection(position))
    act(() => ref.current!.insertMarkdown(mermaidErdTemplate))
    const html = toWysiwygHtml(ref.current!.getMarkdown())
    expect(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('[data-type=mermaid]')).toHaveLength(2)
    expect(ref.current!.getMarkdown()).toContain('int customer_id FK')
  })

  it('retains embedded image payloads after a WYSIWYG edit and mode cycles', async () => {
    const data = 'data:image/png;base64,' + 'ABCD'.repeat(100)
    const { ref, editor } = await mount(`Before\n\n![Embedded](${data})\n\nAfter`)
    expect(editor.getHTML()).toContain(data)
    act(() => editor.commands.insertContentAt(1, 'Edited '))
    await markdown(ref); await wysiwyg(ref)
    expect(ref.current!.getMarkdown()).toContain(data)
    const { createHtmlExport } = await import('../lib/htmlExport')
    expect(await createHtmlExport(ref.current!.getMarkdown())).toContain(data)
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
    act(() => useAppStore.getState().setCurrentDocument({
      ...useAppStore.getState().currentDocument!, id: 'second', content: '# Second', isDirty: false,
    }))
    await wysiwyg(ref)
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

  it('retains the existing sample document structure over an edited round-trip', async () => {
    const source = readFileSync('../Samples/SampleMD+mermaid.md', 'utf8')
    const { editor } = await mount(source)
    act(() => { editor.commands.insertContentAt(1, 'Corpus edit ') })
    const expected = editor.getJSON()
    const serialized = useAppStore.getState().currentDocument!.content
    act(() => { editor.commands.setContent(toWysiwygHtml(serialized), { emitUpdate: false }) })
    expect(editor.getJSON()).toEqual(expected)
  })

  it('retains a newly inserted empty WYSIWYG table across a mode round-trip', async () => {
    const { ref, editor } = await mount('')
    act(() => ref.current!.insertTable!(3, 3))
    expect(editor.getJSON().content?.some(node => node.type === 'table')).toBe(true)
    await markdown(ref)
    expect(ref.current!.getMarkdown()).toContain('| --- | --- | --- |')
    await wysiwyg(ref)
    expect(document.querySelectorAll('.tiptap table tr')).toHaveLength(3)
    expect(document.querySelectorAll('.tiptap table th')).toHaveLength(3)
  })

  it('inserts a table through the same toolbar API in Markdown mode', async () => {
    const { ref } = await mount('')
    await markdown(ref)
    act(() => ref.current!.insertTable!(3, 3))
    const doc = new DOMParser().parseFromString(toWysiwygHtml(ref.current!.getMarkdown()), 'text/html')
    expect(doc.querySelectorAll('table tr')).toHaveLength(3)
    expect(doc.querySelectorAll('th')).toHaveLength(3)
  })

  it('deletes WYSIWYG selections through the Cut API without creating empty text nodes', async () => {
    const { ref, editor } = await mount('Selected text')
    act(() => ref.current!.selectAll())
    expect(() => act(() => ref.current!.insertText(''))).not.toThrow()
    expect(editor.getText().trim()).toBe('')
  })

  it('preserves literal multiline paste through a WYSIWYG round-trip', async () => {
    const { ref, editor } = await mount('')
    act(() => ref.current!.insertText('<b>literal</b>\nSecond line'))
    const serialized = ref.current!.getMarkdown()
    act(() => { editor.commands.setContent(toWysiwygHtml(serialized), { emitUpdate: false }) })
    expect(editor.getText().trim()).toBe('<b>literal</b>\nSecond line')
  })

  it('applies task and strike formatting in Markdown mode', async () => {
    const { ref } = await mount('Task text')
    await markdown(ref)
    act(() => ref.current!.toggleTask!())
    expect(ref.current!.getMarkdown()).toBe('- [ ] Task text')
    act(() => ref.current!.toggleTask!())
    expect(ref.current!.getMarkdown()).toBe('Task text')
    act(() => { ref.current!.selectAll(); ref.current!.toggleStrike!() })
    expect(ref.current!.getMarkdown()).toBe('~~Task text~~')
  })

  it('retains completed tasks when adding task formatting to mixed Markdown lines', async () => {
    const { ref } = await mount('- [x] Done\nPlain\n- Bullet')
    await markdown(ref)
    act(() => { ref.current!.selectAll(); ref.current!.toggleTask!() })
    expect(ref.current!.getMarkdown()).toBe('- [x] Done\n- [ ] Plain\n- [ ] Bullet')
  })

  it('cancels a pending WYSIWYG transition when Markdown is requested again', async () => {
    const { ref } = await mount()
    await markdown(ref)
    act(() => { ref.current!.setMode('wysiwyg'); ref.current!.setMode('markdown') })
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)) })
    expect(document.querySelector('.cm-content')).toBeVisible()
    expect(document.querySelector('.tiptap')).not.toBeVisible()
    expect(ref.current!.getMarkdown()).toBe(fixture)
  })

})
