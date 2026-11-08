import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { DbmlRenderer } from '../components/DbmlRenderer'
import { useAppStore } from '../store/useAppStore'

function DbmlView({ node, extension }: NodeViewProps) {
  const id = extension.options.documentId as string
  const doc = useAppStore(state => state.documents.find(item => item.id === id))
  const active = useAppStore(state => state.currentDocument?.id === id)
  return <NodeViewWrapper data-type="dbml" contentEditable={false} className="dot-node">
    <DbmlRenderer chart={node.attrs.chart} owner={`${id}:${doc?.revision ?? 0}`} active={active && doc?.mode === 'wysiwyg'} />
    <div className="dot-source-hint">DBML · Edit source in Markdown</div>
  </NodeViewWrapper>
}
export const DbmlNode = Node.create({
  name: 'dbml', group: 'block', atom: true, selectable: true, defining: true,
  addOptions() { return { documentId: '' } },
  addAttributes() {
    return Object.fromEntries([['chart', 'data-chart', ''], ['notation', 'data-notation', 'dbml'], ['sourceFence', 'data-source-fence', '']].map(([key, attr, fallback]) => [key, {
      default: fallback, parseHTML: (element: HTMLElement) => element.getAttribute(attr) ?? fallback,
      renderHTML: (attributes: Record<string, string>) => ({ [attr]: attributes[key] }),
    }]))
  },
  parseHTML() { return [{ tag: 'div[data-type="dbml"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'dbml' }), HTMLAttributes['data-chart'] || '```dbml\n\n```'] },
  addNodeView() { return ReactNodeViewRenderer(DbmlView) },
})
