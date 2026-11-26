import { Node, mergeAttributes, type NodeViewProps } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { PlantUmlRenderer } from '../components/PlantUmlRenderer'
import { useAppStore } from '../store/useAppStore'

function PlantUmlView({ node, extension }: NodeViewProps) {
  const id = extension.options.documentId as string
  const doc = useAppStore(state => state.documents.find(item => item.id === id))
  const active = useAppStore(state => state.currentDocument?.id === id)
  return <NodeViewWrapper data-type="plantuml" contentEditable={false} className="dot-node">
    <PlantUmlRenderer chart={node.attrs.chart} owner={`${id}:${doc?.revision ?? 0}`} active={active && doc?.mode === 'wysiwyg'} />
    <div className="dot-source-hint">PlantUML · Edit source in Markdown</div>
  </NodeViewWrapper>
}
export const PlantUmlNode = Node.create({
  name: 'plantuml', group: 'block', atom: true, selectable: true, defining: true,
  addOptions() { return { documentId: '' } },
  addAttributes() {
    return Object.fromEntries([['chart', 'data-chart', ''], ['notation', 'data-notation', 'plantuml'], ['sourceFence', 'data-source-fence', '']].map(([key, attr, fallback]) => [key, {
      default: fallback, parseHTML: (element: HTMLElement) => element.getAttribute(attr) ?? fallback,
      renderHTML: (attributes: Record<string, string>) => ({ [attr]: attributes[key] }),
    }]))
  },
  parseHTML() { return [{ tag: 'div[data-type="plantuml"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'plantuml' }), HTMLAttributes['data-chart'] || '```plantuml\n\n```'] },
  addNodeView() { return ReactNodeViewRenderer(PlantUmlView) },
})
