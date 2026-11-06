import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { DotRenderer } from '../components/DotRenderer'
import { useAppStore } from '../store/useAppStore'

function DotView({ node, extension }: NodeViewProps) {
  const id = extension.options.documentId as string
  const doc = useAppStore(state => state.documents.find(item => item.id === id))
  const active = useAppStore(state => state.currentDocument?.id === id)
  const owner = `${id}:${doc?.revision ?? 0}`
  return <NodeViewWrapper data-type="dot" contentEditable={false} className="dot-node">
    <DotRenderer chart={node.attrs.chart} owner={owner} active={active && doc?.mode === 'wysiwyg'} />
    <div className="dot-source-hint">DOT · Edit source in Markdown</div>
  </NodeViewWrapper>
}
export const DotNode = Node.create({
  name: 'dot', group: 'block', atom: true, selectable: true, defining: true,
  addOptions() { return { documentId: '' } },
  addAttributes() {
    return Object.fromEntries([['chart', 'data-chart', ''], ['notation', 'data-notation', 'dot'], ['sourceFence', 'data-source-fence', '']].map(([key, attr, fallback]) => [key, {
      default: fallback, parseHTML: (element: HTMLElement) => element.getAttribute(attr) ?? fallback,
      renderHTML: (attributes: Record<string, string>) => ({ [attr]: attributes[key] }),
    }]))
  },
  parseHTML() { return [{ tag: 'div[data-type="dot"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'dot' }), HTMLAttributes['data-chart'] || '```dot\n\n```'] },
  addNodeView() { return ReactNodeViewRenderer(DotView) },
})
