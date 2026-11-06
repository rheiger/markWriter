import { elementFromString } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser, Fragment, Slice, type Node as ProseMirrorNode, type ParseOptions, type Schema } from '@tiptap/pm/model'

// Use one private-use character more times than it appears anywhere in the
// input. The parser can drop DOM nodes and join their text; a marker absent
// merely as a substring could otherwise be formed by that joining.
function unusedMarker(root: globalThis.Node): string {
  const bmpSize = 0x1900, supplementarySize = 0xFFFE
  const counts = new Uint32Array(bmpSize + 2 * supplementarySize)
  const collect = (value: string) => {
    for (const character of value) {
      const point = character.codePointAt(0)!
      const index = point >= 0xE000 && point <= 0xF8FF ? point - 0xE000 :
        point >= 0xF0000 && point <= 0xFFFFD ? bmpSize + point - 0xF0000 :
          point >= 0x100000 && point <= 0x10FFFD ? bmpSize + supplementarySize + point - 0x100000 : -1
      if (index >= 0 && index < counts.length) counts[index]++
    }
  }
  collect(root.textContent ?? '')
  if (root.nodeType === Node.ELEMENT_NODE) {
    for (const attribute of Array.from((root as Element).attributes)) collect(attribute.value)
  }
  if ('querySelectorAll' in root) {
    for (const element of (root as ParentNode).querySelectorAll('*')) {
      for (const attribute of Array.from(element.attributes)) collect(attribute.value)
    }
  }
  let best = 0
  for (let index = 1; index < counts.length && counts[best] > 0; index++) {
    if (counts[index] < counts[best]) best = index
  }
  const point = best < bmpSize ? 0xE000 + best : best < bmpSize + supplementarySize ?
    0xF0000 + best - bmpSize : 0x100000 + best - bmpSize - supplementarySize
  return String.fromCodePoint(point).repeat(counts[best] + 1)
}

function protectInlineCode(dom: globalThis.Node): { root: globalThis.Node, marker: string, values: string[] } {
  const root = dom.cloneNode(true)
  const marker = unusedMarker(root)
  const values: string[] = []
  if ('querySelectorAll' in root) {
    for (const code of (root as ParentNode).querySelectorAll('code')) {
      if (code.closest('pre')) continue
      const walker = code.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        // CommonMark code spans replace line endings with spaces, but retain tabs.
        const text = (node.nodeValue ?? '').replace(/\r\n?|\n/g, ' ')
        if (!/[ \t]/.test(text)) continue
        node.nodeValue = `${marker}v${values.length.toString(36)};`
        values.push(text)
      }
    }
  }
  return { root, marker, values }
}

function restoreNode(node: ProseMirrorNode, tokens: RegExp, values: string[]): ProseMirrorNode {
  if (node.isText) {
    const text = node.text!.replace(tokens, (token, index: string) => values[parseInt(index, 36)] ?? token)
    return text === node.text ? node : node.type.schema.text(text, node.marks)
  }
  if (node.isLeaf) return node
  const children: ProseMirrorNode[] = []
  let changed = false
  node.content.forEach(child => {
    const restored = restoreNode(child, tokens, values)
    children.push(restored)
    changed ||= restored !== child
  })
  return changed ? node.copy(Fragment.fromArray(children)) : node
}

function restoreSlice(slice: Slice, tokens: RegExp, values: string[]): Slice {
  const children: ProseMirrorNode[] = []
  slice.content.forEach(child => children.push(restoreNode(child, tokens, values)))
  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
}

function tokenPattern(marker: string): RegExp { return new RegExp(`${marker}v([0-9a-z]+);`, 'g') }

/** Parse rendered HTML with Tiptap's ordinary prose whitespace behavior. */
export function parseInlineCodeDocument(html: string, schema: Schema): ProseMirrorNode {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
  const { root, marker, values } = protectInlineCode(body)
  // Apply Tiptap's own HTML cleanup after code is protected, so newline-only
  // code is not mistaken for layout whitespace.
  const clean = elementFromString((root as HTMLElement).innerHTML)
  return restoreNode(ProseMirrorDOMParser.fromSchema(schema).parse(clean), tokenPattern(marker), values)
}

/** Clipboard-only parser: live DOM reconciliation relies on node identities. */
export function createInlineCodeClipboardParser(schema: Schema): ProseMirrorDOMParser {
  const base = ProseMirrorDOMParser.fromSchema(schema)
  return new class extends ProseMirrorDOMParser {
    constructor() { super(schema, base.rules) }

    parse(dom: globalThis.Node, options?: ParseOptions): ProseMirrorNode {
      const { root, marker, values } = protectInlineCode(dom)
      return restoreNode(super.parse(root, options), tokenPattern(marker), values)
    }

    parseSlice(dom: globalThis.Node, options?: ParseOptions): Slice {
      const { root, marker, values } = protectInlineCode(dom)
      return restoreSlice(super.parseSlice(root, options), tokenPattern(marker), values)
    }
  }()
}
