import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const PLANTUML_DOCUMENT_LIMITS = { blocks: 4, inputBytes: 16_384 } as const

// Stop counting once the document budget is exceeded. Avoid encoding a huge
// attacker-controlled string merely to discover it is already over budget.
export function addPlantUmlBytes(total: number, source: string): number {
  const remaining = PLANTUML_DOCUMENT_LIMITS.inputBytes - total
  if (remaining < 0 || source.length > remaining) return PLANTUML_DOCUMENT_LIMITS.inputBytes + 1
  return total + new TextEncoder().encode(source).length
}

const cache = new WeakMap<ProseMirrorNode, Map<number, boolean>>()
export function plantUmlNodeWithinBudget(doc: ProseMirrorNode, position: number | undefined): boolean {
  if (position === undefined) return false
  let allowed = cache.get(doc)
  if (!allowed) {
    allowed = new Map<number, boolean>()
    let blocks = 0, bytes = 0
    doc.descendants((node, pos) => {
      if (node.type.name !== 'plantuml') return
      blocks++; bytes = addPlantUmlBytes(bytes, typeof node.attrs.chart === 'string' ? node.attrs.chart : '')
      allowed!.set(pos, blocks <= PLANTUML_DOCUMENT_LIMITS.blocks && bytes <= PLANTUML_DOCUMENT_LIMITS.inputBytes)
    })
    cache.set(doc, allowed)
  }
  return allowed.get(position) ?? false
}
