import { useEffect, useRef, useState } from 'react'
import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { MathRenderer } from '../components/MathRenderer'
import { acquireMathBudget, type MathBudget } from '../lib/mathRenderer'
import { cancelAutomaticReplacement } from '../lib/technicalInput'
import { useAppStore } from '../store/useAppStore'

function MathView({ node, extension, updateAttributes, editor, getPos }: NodeViewProps) {
  const id = extension.options.documentId as string
  const doc = useAppStore(state => state.documents.find(item => item.id === id))
  const active = useAppStore(state => state.currentDocument?.id === id) && doc?.mode === 'wysiwyg'
  const owner = `${id}:${doc?.revision ?? 0}`
  const chart = node.attrs.chart as string
  const [shared, setShared] = useState<{ owner: string; budget: MathBudget }>()
  const [editing, setEditing] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!active) return
    const acquired = acquireMathBudget(owner)
    setShared({ owner, budget: acquired.budget })
    return acquired.release
  }, [active, owner])
  useEffect(() => { if (!active) setEditing(false) }, [active])
  useEffect(() => {
    const target = textarea.current
    if (!target) return
    const preventReplacement = (event: InputEvent) => { cancelAutomaticReplacement(event) }
    target.addEventListener('beforeinput', preventReplacement)
    return () => target.removeEventListener('beforeinput', preventReplacement)
  }, [editing])
  const isCurrent = () => {
    const current = useAppStore.getState(), position = getPos()
    return current.currentDocument?.id === id && current.documents.find(item => item.id === id)?.mode === 'wysiwyg' &&
      typeof position === 'number' && editor.state.doc.nodeAt(position)?.type.name === 'math'
  }
  return <NodeViewWrapper data-type="math" data-chart={chart} contentEditable={false} className="math-node">
    {shared?.owner === owner && <MathRenderer chart={chart} owner={owner} budget={shared.budget} active={active} />}
    {editing ? <div className="math-source-editor">
      <textarea ref={textarea} aria-label="Math source" value={chart} spellCheck={false} autoCorrect="off" autoCapitalize="off"
        {...{ writingsuggestions: 'false' }}
        onChange={event => {
          if (!isCurrent()) return
          updateAttributes({ chart: event.target.value, sourceFence: '' })
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); setEditing(false) }
          if (event.nativeEvent.isComposing || event.altKey || !isCurrent()) return
          const key = event.key.toLowerCase()
          const undo = (event.metaKey || event.ctrlKey) && key === 'z' && !event.shiftKey
          const redo = ((event.metaKey || event.ctrlKey) && key === 'z' && event.shiftKey) ||
            (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'y')
          if (undo || redo) {
            event.preventDefault(); event.stopPropagation()
            if (undo) editor.commands.undo(); else editor.commands.redo()
          }
        }} />
      <div className="math-source-actions">
        <button type="button" onClick={() => setEditing(false)}>Done</button>
      </div>
    </div> : <button type="button" onClick={() => setEditing(true)}>Edit math source</button>}
  </NodeViewWrapper>
}

export const MathNode = Node.create({
  name: 'math', group: 'block', atom: true, selectable: true, defining: true,
  addOptions() { return { documentId: '' } },
  addAttributes() {
    return Object.fromEntries([['chart', 'data-chart', ''], ['sourceFence', 'data-source-fence', '']].map(([key, attr, fallback]) => [key, {
      default: fallback, parseHTML: (element: HTMLElement) => element.getAttribute(attr) ?? fallback,
      renderHTML: (attributes: Record<string, string>) => ({ [attr]: attributes[key] }),
    }]))
  },
  parseHTML() { return [{ tag: 'div[data-type="math"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math' }), HTMLAttributes['data-chart'] || '```math\n\n```'] },
  addNodeView() { return ReactNodeViewRenderer(MathView) },
})
