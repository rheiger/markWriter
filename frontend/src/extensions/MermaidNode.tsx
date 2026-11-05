import React from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import MermaidRenderer from '../components/MermaidRenderer'

export interface MermaidAttrs {
  chart: string
}

const MermaidView: React.FC<any> = ({ node }) => {
  const chart: string = node?.attrs?.chart || ''
  const id = React.useMemo(() => Math.random().toString(36).slice(2), [])
  return (
    <NodeViewWrapper as="div" data-type="mermaid" data-chart={chart} contentEditable={false} style={{ display: 'block' }}>
      <MermaidRenderer chart={chart} id={id} />
    </NodeViewWrapper>
  )
}

export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      chart: {
        default: '',
        parseHTML: (element) => {
          const el = element as HTMLElement
          return el.getAttribute('data-chart') || el.textContent || ''
        },
        renderHTML: (attributes) => {
          return { 'data-chart': attributes.chart }
        }
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
      },
      {
        tag: 'div.mermaid',
        getAttrs: (element) => {
          const el = element as HTMLElement
          return { chart: el.textContent || el.getAttribute('data-chart') || '' }
        }
      },
      {
        tag: 'pre',
        getAttrs: (element) => {
          const el = element as HTMLElement
          const code = el.querySelector('code.language-mermaid') as HTMLElement | null
          if (!code) return false
          return { chart: code.textContent || '' }
        }
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid' })]
  },

  addCommands() {
    return {
      insertMermaid:
        (chart: string) => ({ commands }: { commands: any }) =>
          commands.insertContent({ type: this.name, attrs: { chart } })
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidView)
  },
})

export default MermaidNode


