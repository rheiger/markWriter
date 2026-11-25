import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Code from '@tiptap/extension-code'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { MermaidNode } from '../extensions/MermaidNode'
import { DotNode } from '../extensions/DotNode'
import { DbmlNode } from '../extensions/DbmlNode'
import { MathNode } from '../extensions/MathNode'
import { HighlightedCodeBlock } from './editorCodeHighlight'
import { literalInputAttributes, technicalInput } from './technicalInput'
import { renderedSearchDecorations } from './editorSearch'

export function renderedEditorExtensions(documentId: string | undefined, highlighting: boolean) {
  return [
    StarterKit.configure({
      codeBlock: false,
      // Disable to avoid duplicate extensions; we add our own below
      bulletList: false,
      orderedList: false,
      listItem: false,
      heading: false,
      blockquote: false,
      hardBreak: false,
      horizontalRule: false,
      code: false,
      strike: false,
      underline: false,
      link: false,
    }),
    renderedSearchDecorations,
    technicalInput,
    HighlightedCodeBlock.configure({ highlighting, HTMLAttributes: literalInputAttributes }),
    Placeholder.configure({ placeholder: 'Start writing…' }),
    BulletList,
    OrderedList,
    ListItem,
    Heading.configure({ levels: [1,2,3,4,5,6] }),
    Blockquote.configure({ HTMLAttributes: literalInputAttributes }),
    HardBreak,
    HorizontalRule,
    Code.configure({ HTMLAttributes: literalInputAttributes }),
    Strike,
    Underline,
    Link.configure({ autolink: false, linkOnPaste: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextAlign.configure({ types: ['tableCell', 'tableHeader'] }),
    MermaidNode,
    DotNode.configure({ documentId }),
    DbmlNode.configure({ documentId }),
    MathNode.configure({ documentId }),
    Image.configure({ inline: true, allowBase64: true }),
  ]
}
