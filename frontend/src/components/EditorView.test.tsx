import { foldedRanges } from '@codemirror/language'
import { EditorView as CMView } from '@codemirror/view'
import { SearchQuery, setSearchQuery, findNext, openSearchPanel } from '@codemirror/search'
import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
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

  it('keeps live math source edits across mode/tab navigation and supports Undo', async () => {
    const {mathRenderer}=await import('../lib/mathRenderer')
    const spy=vi.spyOn(mathRenderer,'render').mockImplementation(async()=>({html:'<span class="katex">ready</span>',release:()=>{}}))
    try {
      const source='Before\r\n\r\n~~~~math\r\nE=mc^2\r\n~~~~\r\n'
      const {ref,editor,container}=await mount(source)
      await waitFor(()=>expect(container.querySelector('.math-node .katex')).not.toBeNull())
      const model=editor.getJSON()
      fireEvent.click(screen.getByRole('button',{name:'Edit math source'}))
      expect(ref.current!.getMarkdown()).toBe(source)
      expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
      fireEvent.click(screen.getByRole('button',{name:'Done',exact:true}))
      expect(editor.getJSON()).toEqual(model)
      fireEvent.click(screen.getByRole('button',{name:'Edit math source'}))
      fireEvent.change(screen.getByRole('textbox',{name:'Math source'}),{target:{value:'\\frac{1}{2}'}})
      expect(ref.current!.getMarkdown()).toContain('\\frac{1}{2}')
      expect(useAppStore.getState().currentDocument?.isDirty).toBe(true)
      await markdown(ref)
      expect(ref.current!.getMarkdown()).toContain('\\frac{1}{2}')
      await wysiwyg(ref)
      expect(editor.state.doc.content.toString()).toContain('math')
      act(()=>useAppStore.getState().setCurrentDocument({id:'other',title:'Other',content:'Other',isDirty:false,lastModified:new Date()}))
      act(()=>useAppStore.getState().activateDocument('doc-1'))
      await wysiwyg(ref)
      expect(ref.current!.getMarkdown()).toContain('\\frac{1}{2}')
      act(()=>ref.current!.undo())
      expect(editor.getJSON()).toEqual(model)
      expect(ref.current!.getMarkdown()).toContain('~~~~math\r\nE=mc^2\r\n~~~~')
    } finally {spy.mockRestore()}
  })

  it('preserves actual inline code whitespace through rendered edits, source sync and Undo', async () => {
    const source = 'Prose  normalizes. ` a  b ` and `a\tb` and `   `\n\n`  tail  `'
    const { ref, editor } = await mount(source)
    const codes = () => { const result: string[] = []; editor.state.doc.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'code')) result.push(node.text!)}); return result }
    expect(codes()).toEqual(['a  b','a\tb','   ',' tail '])
    const original = editor.getJSON()
    act(() => editor.commands.insertContentAt(1, 'Edited '))
    const saved = ref.current!.getMarkdown()
    expect(toWysiwygHtml(saved)).toContain('a  b')
    await markdown(ref)
    await wysiwyg(ref)
    expect(codes()).toEqual(['a  b','a\tb','   ',' tail '])
    act(() => ref.current!.undo())
    expect(editor.getJSON()).toEqual(original)
    expect(ref.current!.getMarkdown()).not.toContain('Edited ')
  })

  it('keeps source synchronization out of rendered Undo history', async () => {
    let historyTime = Date.now()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => historyTime)
    const source = '# History\n\nBefore paragraph.\n\n```js\nconst value = 42;\n```\n'
    const { ref, editor } = await mount(source)
    try {
      await markdown(ref)
      act(() => {
        const cm = ref.current!.getEditorView()!
        cm.dispatch({ selection: { anchor: cm.state.doc.length } })
        ref.current!.insertText('Source history probe.')
      })
      await wysiwyg(ref)
      await waitFor(() => expect(editor.getText()).toContain('Source history probe.'))
      historyTime += 1000 // Separate first sync; second sync and user input share one history window.
      await markdown(ref)
      act(() => ref.current!.undo())
      expect(ref.current!.getMarkdown()).toBe(source)
      await wysiwyg(ref)
      await waitFor(() => expect(editor.getText()).not.toContain('Source history probe.'))
      const before = editor.getJSON()
      let position = 0
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && node.textContent === 'Before paragraph.') position = pos + 1
      })
      act(() => editor.view.dispatch(editor.state.tr.insertText('Edited ', position)))
      expect(editor.getText()).toContain('Edited Before paragraph.')
      act(() => {
        useAppStore.getState().updateConfig({ syntaxHighlighting: false })
        useAppStore.getState().updateConfig({ syntaxHighlighting: true })
      })
      act(() => ref.current!.undo())
      expect(editor.getJSON()).toEqual(before)
      expect(ref.current!.getMarkdown()).not.toContain('Source history probe.')
    } finally { clock.mockRestore() }
  })

  it('updates Auto editor themes when the OS appearance changes without document writes', async () => {
    const prior = useAppStore.getState().config
    const listeners = new Set<() => void>()
    const media = { matches: false, addEventListener: (_event: string, fn: () => void) => listeners.add(fn), removeEventListener: (_event: string, fn: () => void) => listeners.delete(fn) }
    const originalMatchMedia = window.matchMedia
    window.matchMedia = query => query === '(prefers-color-scheme: dark)' ? media as unknown as MediaQueryList : originalMatchMedia(query)
    useAppStore.getState().updateConfig({ theme: 'system' })
    const { ref, unmount } = await mount('```js\nconst value = 42;\n```')
    try {
      await markdown(ref)
      const cm = ref.current!.getEditorView()!
      expect(cm.state.facet(CMView.darkTheme)).toBe(false)
      act(() => { media.matches = true; listeners.forEach(fn => fn()) })
      await waitFor(() => expect(cm.state.facet(CMView.darkTheme)).toBe(true))
      act(() => useAppStore.getState().updateConfig({ theme: 'light' }))
      expect(cm.state.facet(CMView.darkTheme)).toBe(false)
      expect(ref.current!.getMarkdown()).toBe('```js\nconst value = 42;\n```')
      expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
    } finally { unmount(); window.matchMedia = originalMatchMedia; useAppStore.setState({ config: prior }) }
  })

  it('projects fenced syntax tokens across quote/list chunks without coloring prefixes', async () => {
    useAppStore.getState().updateConfig({ syntaxHighlighting: true })
    const source = '> - ```js\n>   const first = 1;\n>   const second = 2;\n>   ```'
    const { ref, container } = await mount(source)
    await markdown(ref)
    await waitFor(() => expect(Array.from(container.querySelectorAll('.cm-content .hljs-keyword'), span => span.textContent)).toEqual(['const','const']))
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it('toggles both real code engines and Preview without source, history, selection or fold mutations', async () => {
    useAppStore.getState().updateConfig({ syntaxHighlighting: true, collapseSource: true })
    const source = '```js\r\nconst value = "😀<tag>";\r\n```\r\n\r\n```mermaid\r\nflowchart TD\r\n A --> B\r\n```\r\n'
    const { ref, editor, container } = await mount(source)
    expect(container.querySelector('.tiptap .hljs-keyword')).not.toBeNull()
    const json = editor.getJSON()
    act(() => useAppStore.getState().updateConfig({ syntaxHighlighting: false }))
    await waitFor(() => expect(container.querySelector('.tiptap [class*=hljs-]')).toBeNull())
    expect(editor.getJSON()).toEqual(json)
    await markdown(ref)
    const cm = ref.current!.getEditorView()!
    act(() => cm.dispatch({ selection: { anchor: 12, head: 17 } }))
    const selection = cm.state.selection, folds = foldedRanges(cm.state).size
    act(() => useAppStore.getState().updateConfig({ syntaxHighlighting: true }))
    await waitFor(() => expect(container.querySelector('.cm-content .hljs-keyword')).not.toBeNull())
    await waitFor(() => expect(container.querySelector('.markwriter-preview .hljs-keyword')).not.toBeNull())
    expect(cm.state.selection.eq(selection)).toBe(true)
    expect(foldedRanges(cm.state).size).toBe(folds)
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
    act(() => { ref.current!.insertText('edited'); ref.current!.undo() })
    expect(ref.current!.getMarkdown()).toBe(source)
    await wysiwyg(ref)
    expect(editor.getJSON()).toEqual(json)
    act(() => { editor.commands.insertContentAt(editor.state.doc.content.size, '<p>Edited</p>'); editor.commands.undo() })
    // Real rendered edits use the existing serializer; Undo must restore the document model.
    // Exact original CRLF bytes above are required for all view-only operations.
    expect(editor.getJSON()).toEqual(json)
  })

  it('completes DOT Preview for a clean opened document whose initial revision is implicit zero', async () => {
    const { dotRenderer } = await import('../lib/dotRenderer')
    const spy = vi.spyOn(dotRenderer, 'render').mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>ready</text></svg>')
    try {
      const source = '```dot\ndigraph {a -> b}\n```\n'
      const { ref, container } = await mount(source)
      await markdown(ref)
      await waitFor(() => expect(container.querySelector('.markwriter-preview [data-type="dot"] svg')).not.toBeNull())
      expect(screen.getByText('(1 diagram)')).toBeVisible()
      expect(ref.current!.getMarkdown()).toBe(source)
      expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
    } finally { spy.mockRestore() }
  })

  it('selects the DOT source block when its SVG is clicked after selecting Preview text', async () => {
    const { dotRenderer }=await import('../lib/dotRenderer')
    const spy=vi.spyOn(dotRenderer,'render').mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>ready</text></svg>')
    try {
      const source='Select this paragraph.\n\n```dot\ndigraph {a -> b}\n```\n'
      const {ref,container}=await mount(source)
      await markdown(ref)
      await waitFor(()=>expect(container.querySelector('.markwriter-preview [data-type=dot] svg')).not.toBeNull())
      const paragraph=container.querySelector('.markwriter-preview [data-mw-text]')!.firstChild!
      const range=document.createRange();range.setStart(paragraph,0);range.setEnd(paragraph,6)
      window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range)
      const svg=container.querySelector('.markwriter-preview [data-type=dot] svg')!
      fireEvent.pointerDown(svg);fireEvent.pointerUp(svg)
      expect(ref.current!.getEditorView()!.state.selection.main.from).toBe(source.indexOf('```dot'))
      expect(ref.current!.getMarkdown()).toBe(source)
      expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
    } finally { window.getSelection()?.removeAllRanges();spy.mockRestore() }
  })

  it('retains an unmatched fence during view changes but safely closes it before a new rendered paragraph', async () => {
    const source='Before\n\n~~~~graphviz\ndigraph {a -> b}\n'
    const {ref,editor}=await mount(source)
    await markdown(ref);await wysiwyg(ref)
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
    act(()=>editor.commands.insertContentAt(editor.state.doc.content.size,'<p>After diagram.</p>'))
    const doc=new DOMParser().parseFromString(toWysiwygHtml(ref.current!.getMarkdown()),'text/html')
    expect(doc.querySelector('[data-type=dot]')?.getAttribute('data-chart')).toBe('digraph {a -> b}\n')
    expect(Array.from(doc.querySelectorAll('p')).map(p=>p.textContent)).toContain('After diagram.')
  })

  it('opens oversized unmatched DOT with many backtick runs as a recoverable error without rewriting source', async () => {
    const source='```dot\n'+'`a'.repeat(150000)
    const {ref,container}=await mount(source)
    await markdown(ref)
    await waitFor(()=>expect(container.querySelector('.markwriter-preview [data-type=dot]')?.textContent).toContain('64 KiB'))
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
  })

  it('formats selected source list lines without deleting text or inserting a marker below the line', async () => {
    const { ref } = await mount('first\nsecond\nuntouched')
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    act(() => view.dispatch({ selection: { anchor: 12, head: 0 } }))
    act(() => ref.current!.toggleBulletList())
    expect(ref.current!.getMarkdown()).toBe('- first\n- second\nuntouched')
    expect(view.state.selection.main.empty).toBe(true)
    expect(view.state.selection.main.head).toBe(16)
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe('first\nsecond\nuntouched')
    act(() => view.dispatch({ selection: { anchor: 0, head: 12 } }))
    act(() => ref.current!.toggleOrderedList())
    expect(ref.current!.getMarkdown()).toBe('1. first\n2. second\nuntouched')
  })

  it('sets Body inside safe fenced or indented source code with one undo', async () => {
    const source = '````lang\nwith ``` inside\n````\n\ntail'
    const { ref } = await mount(source)
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    act(() => view.dispatch({ selection: { anchor: 15 } }))
    act(() => ref.current!.setHeadingLevel(0))
    expect(ref.current!.getMarkdown()).toBe('with ``` inside\n\ntail')
    expect(view.state.selection.main.head).toBe(15)
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe(source)
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '    first\n    second\n\ntail' }, selection: { anchor: 7 } }))
    act(() => ref.current!.setHeadingLevel(0))
    expect(ref.current!.getMarkdown()).toBe('first\nsecond\n\ntail')
  })

  it('searches folded canonical source without changing selection, replaces all once, and keeps queries tab-local', async () => {
    const { ref } = await mount('same same\n\n```mermaid\nflowchart TD\n A[same]\n```')
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    const source = ref.current!.getMarkdown()
    const initial = view.state.selection.main.anchor
    act(() => ref.current!.openFind(true))
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'same' } })
    expect(screen.getByText('3 matches · wraps')).toBeVisible()
    expect(view.state.selection.main.anchor).toBe(initial)
    expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(foldedRanges(view.state).size).toBe(0)
    fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace All', exact: true }))
    expect(ref.current!.getMarkdown()).toBe(source.replaceAll('same', 'other'))
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe(source)
    act(() => useAppStore.getState().setCurrentDocument({ id: 'B', title: 'B', content: 'other', isDirty: false, lastModified: new Date() }))
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    act(() => useAppStore.getState().activateDocument('doc-1'))
    expect(screen.getByLabelText('Find')).toHaveValue('same')
    fireEvent.keyDown(view.contentDOM, { key: 'Escape' })
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('replaces rendered marked and table text without searching diagram internals', async () => {
    const { ref, editor } = await mount('sa**me**\n\n| same | H |\n|---|---|\n| same | other |\n\n```mermaid\nflowchart TD\n A[same]\n```')
    act(() => ref.current!.openFind(true))
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'same' } })
    expect(screen.getByText('3 matches · wraps')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace All', exact: true }))
    expect(editor.getText()).toContain('new')
    expect(editor.getHTML()).toContain('<table')
    expect(ref.current!.getMarkdown()).toContain('A[same]')
    act(() => ref.current!.undo())
    expect(editor.getHTML()).toContain('<strong>me</strong>')
  })

  it('uses regex captures in both real editors with atomic undo and ignores stale workers', async () => {
    const { executeRegex } = await import('../lib/regexSearch')
    const jobs: { request: Parameters<typeof executeRegex>[0]; send: () => void; terminated: boolean }[] = []
    class WorkerStub {
      onmessage: ((event: { data: ReturnType<typeof executeRegex> }) => void) | null = null
      onerror = null
      postMessage(request: Parameters<typeof executeRegex>[0]) {
        const job = { request, terminated: false, send: () => this.onmessage?.({ data: executeRegex(request) }) }
        jobs.push(job)
      }
      terminate() { const job = jobs.find(j => j.send && !j.terminated); if (job) job.terminated = true }
    }
    vi.stubGlobal('Worker', WorkerStub)
    try {
      const source = 'ab ab'
      const { ref, editor } = await mount(source)
      await markdown(ref)
      act(() => ref.current!.openFind(true))
      fireEvent.click(screen.getByLabelText('Regex'))
      fireEvent.change(screen.getByLabelText('Find'), { target: { value: '(a)(b)' } })
      const old = jobs[jobs.length - 1]
      fireEvent.change(screen.getByLabelText('Find'), { target: { value: '(b)' } })
      act(() => old.send())
      expect(screen.getByText('Searching…')).toBeVisible()
      fireEvent.change(screen.getByLabelText('Find'), { target: { value: '(a)(b)' } })
      act(() => jobs[jobs.length - 1].send())
      expect(screen.getByText('2 matches · wraps')).toBeVisible()
      expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
      fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: '$2$1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Replace All' }))
      expect(ref.current!.getMarkdown()).toBe('ba ba')
      act(() => ref.current!.undo())
      expect(ref.current!.getMarkdown()).toBe(source)
      await wysiwyg(ref)
      act(() => jobs[jobs.length - 1].send())
      fireEvent.click(screen.getByRole('button', { name: 'Replace All' }))
      expect(editor.getText()).toBe('ba ba')
      act(() => ref.current!.undo())
      expect(editor.getText()).toBe(source)
      fireEvent.change(screen.getByLabelText('Find'), { target: { value: '(ab)' } })
      const staleRevision = jobs[jobs.length - 1]
      act(() => editor.commands.insertContentAt(1, 'x'))
      act(() => staleRevision.send())
      expect(screen.getByText('Searching…')).toBeVisible()
      const staleTab = jobs[jobs.length - 1]
      act(() => useAppStore.getState().setCurrentDocument({ id: 'B', title: 'B', content: 'untouched', isDirty: false, lastModified: new Date() }))
      act(() => staleTab.send())
      expect(useAppStore.getState().currentDocument?.content).toBe('untouched')
    } finally { vi.unstubAllGlobals() }
  })

  it('restores the rendered regex edit model with normalized final LF after one Undo', async () => {
    const search = await import('../lib/regexSearch')
    const spy = vi.spyOn(search, 'startRegex').mockImplementation((request, complete) => { complete(search.executeRegex(request)); return () => {} })
    try {
      const source = '# Regex acceptance\n\n😀 same same\n'
      const { ref, editor } = await mount(source)
      const model = editor.getJSON()
      act(() => ref.current!.openFind(true))
      fireEvent.click(screen.getByLabelText('Regex'))
      fireEvent.change(screen.getByLabelText('Find'), { target: { value: '(?<outer>s(?<inner>a))me' } })
      await waitFor(() => expect(screen.getByText('2 matches · wraps')).toBeVisible())
      fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: '$<inner>-$1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Replace All' }))
      expect(editor.getText()).toContain('😀 a-sa a-sa')
      act(() => ref.current!.undo())
      expect(editor.getJSON()).toEqual(model)
      expect(ref.current!.getMarkdown()).toBe('# Regex acceptance\n\n😀 same same')
    } finally { spy.mockRestore() }
  })

  it('rejects oversized replacement output without modifying either editor', async () => {
    const search = await import('../lib/regexSearch')
    const spy = vi.spyOn(search, 'startRegex').mockImplementation((request, complete) => { complete(search.executeRegex(request)); return () => {} })
    try {
      const source = 'x '.repeat(300)
      const { ref, editor } = await mount(source)
      const originalModel = editor.getJSON()
      for (const isMarkdown of [true, false]) {
        if (isMarkdown) await markdown(ref); else await wysiwyg(ref)
        act(() => ref.current!.openFind(true))
        if (!(screen.getByLabelText('Regex') as HTMLInputElement).checked) fireEvent.click(screen.getByLabelText('Regex'))
        fireEvent.change(screen.getByLabelText('Find'), { target: { value: '(x)' } })
        await waitFor(() => expect(screen.getByText('300 matches · wraps')).toBeVisible())
        fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: 'z'.repeat(64_000) } })
        fireEvent.click(screen.getByRole('button', { name: 'Replace All' }))
        expect(screen.getByRole('alert')).toHaveTextContent(/output exceeds/)
        expect(ref.current!.getMarkdown()).toBe(source)
        expect(useAppStore.getState().currentDocument!.isDirty).toBe(false)
        if (!isMarkdown) expect(editor.getJSON()).toEqual(originalModel)
        fireEvent.click(screen.getByRole('button', { name: 'Close Find' }))
      }
    } finally { spy.mockRestore() }
  })

  it('starts fresh source at zero and toggles multiline code with safe fences and one undo', async () => {
    const { ref } = await mount('first\nwith ``` inside\nlast\nnext')
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    expect(view.state.selection.main.head).toBe(0)
    act(() => view.dispatch({ selection: { anchor: 25, head: 0 } }))
    const original = ref.current!.getMarkdown()
    act(() => ref.current!.toggleCodeBlock())
    expect(ref.current!.getMarkdown()).toBe('````\nfirst\nwith ``` inside\nlast\n````\nnext')
    expect(view.state.selection.main.empty).toBe(true)
    act(() => ref.current!.toggleCodeBlock())
    expect(ref.current!.getMarkdown()).toBe(original)
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toContain('````')
  })

  it('joins selected rendered paragraphs as one code block and collapses inline formatting at its content end', async () => {
    const { ref, editor } = await mount('one\n\ntwo\n\nend')
    act(() => editor.commands.setTextSelection({ from: 1, to: 9 }))
    act(() => ref.current!.toggleCodeBlock())
    expect(editor.getJSON().content!.filter(n => n.type === 'codeBlock')).toHaveLength(1)
    expect(editor.getJSON().content![0].content![0].text).toBe('one\ntwo')
    act(() => ref.current!.undo())
    act(() => editor.commands.setTextSelection({ from: 4, to: 1 }))
    act(() => ref.current!.toggleBold())
    expect(editor.state.selection.empty).toBe(true)
    expect(editor.state.selection.head).toBe(4)
    expect(editor.getHTML()).toContain('<strong>one</strong>')
  })

  it('keeps literal extension delimiters and Markdown prefixes literal after paste, serialize and reopen', async () => {
    const { ref } = await mount('')
    const literal = '# heading\n> quote\n- list\n1. item\n```\n**bold** ++under++ ~~strike~~ [link](url)'
    act(() => ref.current!.insertText(literal))
    const saved = ref.current!.getMarkdown()
    expect(toWysiwygHtml(saved)).not.toMatch(/<h1|<blockquote|<ul|<ol|<strong|<ins|<s>|<a /)
    const doc = new DOMParser().parseFromString(toWysiwygHtml(saved), 'text/html')
    expect(doc.body.textContent).toContain('++under++')
    expect(doc.body.textContent).toContain('~~strike~~')
    expect(doc.body.textContent).toContain('# heading')
  })

  it('reports source formatting from its own selection rather than the retained rendered caret', async () => {
    const { ref } = await mount('# Heading\n\nplain **bold** and ++under++\n\n| H |\n|---|\n| cell |')
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    act(() => view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('bold') + 2 } }))
    expect(ref.current!.getFormattingState!()).toMatchObject({ blockLabel: 'Body', bold: true, underline: false })
    act(() => view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('under') + 2 } }))
    expect(ref.current!.getFormattingState!()).toMatchObject({ blockLabel: 'Body', bold: false, underline: true })
    act(() => view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('cell') + 2 } }))
    expect(ref.current!.getFormattingState!().blockLabel).toBe('Table')
  })

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

  it('retains fold choices across a WYSIWYG edit and re-synchronization', async () => {
    const { ref, editor } = await mount(fixture)
    await markdown(ref)
    expect(foldedRanges(ref.current!.getEditorView()!.state).size).toBe(1)
    await wysiwyg(ref)
    act(() => editor.commands.insertContentAt(1, 'Edited '))
    await markdown(ref)
    expect(foldedRanges(ref.current!.getEditorView()!.state).size).toBe(1)
  })

  it('copies complete folded source and expands a search match without dirtying text', async () => {
    const { ref } = await mount(fixture)
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    expect(foldedRanges(view.state).size).toBe(1)
    act(() => ref.current!.selectAll())
    expect(ref.current!.getSelection()).toBe(fixture)
    act(() => { openSearchPanel(view) })
    act(() => view.dispatch({ selection: { anchor: 0 }, effects: setSearchQuery.of(new SearchQuery({ search: 'finish' })) }))
    act(() => { findNext(view) })
    expect(foldedRanges(view.state).size).toBe(0)
    expect(useAppStore.getState().currentDocument).toMatchObject({ content: fixture, isDirty: false })
  })

  it('keeps exact source clean for table view attributes that do not change Markdown', async () => {
    const { editor } = await mount(fixture)
    let position = 0
    editor.state.doc.descendants((node, pos) => { if (!position && node.type.name === 'tableCell') position = pos + 2 })
    act(() => editor.commands.setTextSelection(position))
    act(() => editor.commands.updateAttributes('tableCell', { colwidth: [120] }))
    expect(useAppStore.getState().currentDocument?.content).toBe(fixture)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
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

  it('inserts a valid DOT block within source prose without absorbing surrounding text and undoes once', async () => {
    const {dotTemplate}=await import('../lib/templates')
    const {ref}=await mount('Before after')
    await markdown(ref)
    act(()=>ref.current!.getEditorView()!.dispatch({selection:{anchor:7}}))
    act(()=>ref.current!.insertMarkdown(dotTemplate))
    const html=new DOMParser().parseFromString(toWysiwygHtml(ref.current!.getMarkdown()),'text/html')
    expect(html.querySelectorAll('[data-type=dot]')).toHaveLength(1)
    expect(html.querySelector('[data-type=dot]')!.getAttribute('data-chart')).not.toContain('after')
    expect(html.body.textContent).toContain('Before')
    expect(html.body.textContent).toContain('after')
    act(()=>ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe('Before after')
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

describe('technical text correction boundaries', () => {
  const source = 'Prose before.\n\n```js\nconst teh_block = "😀";\n```\n\nProse with `teh_inline` here.\n\n> teh_quote\n\nProse after.\n'
  const attributes = { autocorrect: 'off', spellcheck: 'false', autocapitalize: 'off', writingsuggestions: 'false' }
  const contexts = ['codeBlock', 'inlineCode', 'blockquote', 'storedCode'] as const
  beforeEach(() => useAppStore.setState({ documents: [], currentDocument: null, error: null }))

  function position(editor: Editor, text: string) {
    let found = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text?.includes(text)) found = pos + node.text.indexOf(text)
    })
    expect(found).toBeGreaterThanOrEqual(0)
    return found
  }
  function selectContext(editor: Editor, context: typeof contexts[number], verify?: () => void) {
    const text = { codeBlock: 'teh_block', inlineCode: 'teh_inline', blockquote: 'teh_quote', storedCode: 'Prose after.' }[context]
    act(() => {
      editor.commands.setTextSelection(position(editor, text) + 2)
      if (context === 'storedCode') editor.commands.setMark('code')
      verify?.()
    })
  }
  function beforeInput(element: HTMLElement, inputType = 'insertReplacementText', data = 'the', isComposing = false, cancelable = true) {
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable, inputType, data, isComposing })
    act(() => { element.dispatchEvent(event) })
    return event
  }

  it('synchronously scopes rendered host correction attributes to selection and stored inline-code marks without writes or Undo entries', async () => {
    const { editor, ref, container } = await mount(source)
    const host = container.querySelector<HTMLElement>('.tiptap')!
    for (const context of contexts) {
      selectContext(editor, context, () => {
        for (const [name, value] of Object.entries(attributes)) expect(host).toHaveAttribute(name, value)
      })
      act(() => {
        editor.commands.setTextSelection(position(editor, 'Prose after.') + 2)
        for (const [name, value] of Object.entries(attributes)) expect(host.getAttribute(name)).not.toBe(value)
      })
    }
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
    let undone = true
    act(() => { undone = editor.commands.undo() })
    expect(undone).toBe(false)
    expect(ref.current!.getMarkdown()).toBe(source)
  })

  it('protects technical nodes explicitly and nested block code through ancestor and editing-host policies', async () => {
    const { container, editor, ref } = await mount(source)
    act(() => editor.commands.setTextSelection(position(editor, 'Prose before.') + 2))
    const nodes = container.querySelectorAll('.tiptap pre, .tiptap p code, .tiptap blockquote')
    expect(nodes).toHaveLength(3)
    for (const node of nodes) for (const [name, value] of Object.entries(attributes)) expect(node).toHaveAttribute(name, value)
    const host = container.querySelector<HTMLElement>('.tiptap')!, innerCode = host.querySelector('pre code')!
    // Spellcheck/writing suggestions inherit the nearest explicit ancestor policy.
    // Autocorrection/capitalization for an editable region use its editing host.
    // https://html.spec.whatwg.org/multipage/interaction.html#editing-2
    expect(innerCode.closest('[spellcheck]')).toHaveAttribute('spellcheck', 'false')
    expect(innerCode.closest('[writingsuggestions]')).toHaveAttribute('writingsuggestions', 'false')
    expect(innerCode.closest('[contenteditable]')).toBe(host)
    selectContext(editor, 'codeBlock', () => {
      expect(host).toHaveAttribute('autocorrect', 'off')
      expect(host).toHaveAttribute('autocapitalize', 'off')
    })
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it.each(contexts)('cancels cancelable noncomposing replacement input in rendered %s', async context => {
    const { container, editor, ref } = await mount(source)
    selectContext(editor, context)
    const event = beforeInput(container.querySelector<HTMLElement>('.tiptap')!)
    expect(event.defaultPrevented).toBe(true)
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it.each(contexts)('allows typing, Unicode, paste and composition input in rendered %s', async context => {
    const { container, editor, ref } = await mount(source)
    selectContext(editor, context)
    const host = container.querySelector<HTMLElement>('.tiptap')!
    for (const [type, data, composing] of [
      ['insertText', 'ordinary', false], ['insertText', '😀漢', false], ['insertFromPaste', 'literal <&> 😀', false],
      ['insertCompositionText', '漢', true], ['insertReplacementText', '漢', true],
    ] as const) expect(beforeInput(host, type, data, composing).defaultPrevented).toBe(false)
    expect(beforeInput(host, 'insertReplacementText', 'the', false, false).defaultPrevented).toBe(false)
    // Synthetic beforeinput has no OS editing default: this checks only local cancellation.
    expect(ref.current!.getMarkdown()).toBe(source)
  })

  it.each(['pre code', 'p code', 'blockquote'])('cancels a replacement targeting %s after the caret moved back to prose', async selector => {
    const { container, editor, ref } = await mount(source)
    act(() => editor.commands.setTextSelection(position(editor, 'Prose after.') + 2))
    const host = container.querySelector<HTMLElement>('.tiptap')!
    const walker = document.createTreeWalker(host.querySelector(selector)!, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode() as Text | null
    while (text && !text.data.includes('teh_')) text = walker.nextNode() as Text | null
    expect(text).not.toBeNull()
    const range = document.createRange(), from = text!.data.indexOf('teh_')
    range.setStart(text!, from); range.setEnd(text!, from + 3)
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: 'the' })
    Object.defineProperty(event, 'getTargetRanges', { value: () => [range] })
    act(() => { host.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it('leaves ordinary rendered prose replacement input available', async () => {
    const { container, editor, ref } = await mount(source)
    act(() => editor.commands.setTextSelection(position(editor, 'Prose after.') + 2))
    expect(beforeInput(container.querySelector<HTMLElement>('.tiptap')!).defaultPrevented).toBe(false)
    expect(ref.current!.getMarkdown()).toBe(source)
  })

  it('keeps the source editing host correction attributes off across technical and prose selections', async () => {
    const { ref } = await mount(source)
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    for (const text of ['teh_block', 'teh_inline', 'teh_quote', 'Prose after.']) {
      act(() => view.dispatch({ selection: { anchor: source.indexOf(text) + 2 } }))
      for (const [name, value] of Object.entries(attributes)) expect(view.contentDOM).toHaveAttribute(name, value)
    }
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })

  it('cancels source replacement input without blocking ordinary input or changing its model/history', async () => {
    const { ref } = await mount(source)
    await markdown(ref)
    const view = ref.current!.getEditorView()!
    act(() => view.dispatch({ selection: { anchor: source.indexOf('teh_block') + 2 } }))
    expect(beforeInput(view.contentDOM).defaultPrevented).toBe(true)
    for (const [type, data, composing] of [
      ['insertText', 'ordinary', false], ['insertText', '😀漢', false], ['insertFromPaste', 'literal <&> 😀', false],
      ['insertCompositionText', '漢', true], ['insertReplacementText', '漢', true],
    ] as const) expect(beforeInput(view.contentDOM, type, data, composing).defaultPrevented).toBe(false)
    expect(view.state.doc.toString()).toBe(source)
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe(source)
    expect(useAppStore.getState().currentDocument?.isDirty).toBe(false)
  })
})

describe('canonical CRLF source editing', () => {
  it('copies and edits source without normalizing unaffected newlines', async () => {
    const { ref } = await mount('😀 first\r\nsecond\r\nlast')
    await markdown(ref)
    act(() => ref.current!.selectAll())
    expect(ref.current!.getSelection()).toBe('😀 first\r\nsecond\r\nlast')
    const view = ref.current!.getEditorView()!
    const from = view.state.doc.toString().indexOf('second')
    act(() => view.dispatch({ changes: { from, to: from + 6, insert: 'new' } }))
    expect(ref.current!.getMarkdown()).toBe('😀 first\r\nnew\r\nlast')
    act(() => ref.current!.undo())
    expect(ref.current!.getMarkdown()).toBe('😀 first\r\nsecond\r\nlast')
  })
})

describe('restored view state', () => {
  it('restores source range without resetting existing tabs or dirtying source', async () => {
    useAppStore.setState({ documents: [], currentDocument: null })
    useAppStore.getState().setCurrentDocument({ id: 'restore', title: 'Restore', content: 'one\ntwo\nthree', isDirty: false, lastModified: new Date(), viewState: { sourceAnchor: 8, sourceHead: 4 } })
    const ref = createRef<EditorViewRef>()
    render(<EditorView ref={ref} />)
    await markdown(ref)
    expect(ref.current!.getEditorView()!.state.selection.main).toMatchObject({ anchor: 8, head: 4 })
    expect(useAppStore.getState().currentDocument).toMatchObject({ isDirty: false, content: 'one\ntwo\nthree' })
    act(() => useAppStore.getState().rememberView('restore', { sourceScroll: 20 }))
    expect(useAppStore.getState().currentDocument!.revision).toBeUndefined()
  })
})
