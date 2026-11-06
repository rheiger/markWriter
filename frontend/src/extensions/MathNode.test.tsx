import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorView, type EditorViewRef } from '../components/EditorView'
import { mathRenderer } from '../lib/mathRenderer'
import { useAppStore } from '../store/useAppStore'

it('routes live math source Undo/Redo to document history and protects technical input', async () => {
  const spy = vi.spyOn(mathRenderer, 'render').mockResolvedValue({ html: '<span>math</span>', release: () => {} })
  try {
    useAppStore.setState({ documents: [], currentDocument: null, error: null })
    const source = 'Before\n\n```math\nx^2\n```\n'
    useAppStore.getState().setCurrentDocument({ id: 'math-test', title: 'Math', content: source, isDirty: false, mode: 'wysiwyg', lastModified: new Date() })
    const ref = createRef<EditorViewRef>()
    const view = render(<EditorView ref={ref} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit math source' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Edit math source' }))
    const input = screen.getByRole('textbox', { name: 'Math source' }) as HTMLTextAreaElement
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText' }))).toBe(false)
    expect(input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText' }))).toBe(true)
    expect(input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', isComposing: true }))).toBe(true)
    fireEvent.change(input, { target: { value: String.raw`\alpha+1` } })
    expect(ref.current!.getMarkdown()).toContain(String.raw`\alpha+1`)
    fireEvent.keyDown(input, { key: 'z', metaKey: true })
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain('```math\nx^2\n```'))
    fireEvent.keyDown(input, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain(String.raw`\alpha+1`))
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain('```math\nx^2\n```'))
    fireEvent.keyDown(input, { key: 'y', ctrlKey: true })
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain(String.raw`\alpha+1`))
    act(() => useAppStore.getState().setCurrentDocument({ id: 'other', title: 'Other', content: '', isDirty: false, lastModified: new Date() }))
    expect(useAppStore.getState().documents.find(doc => doc.id === 'math-test')?.content).toContain(String.raw`\alpha+1`)
    view.unmount()
  } finally { spy.mockRestore() }
})
