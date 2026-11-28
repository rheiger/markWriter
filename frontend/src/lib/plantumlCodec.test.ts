import { expect, it } from 'vitest'
import { fromWysiwygHtml, renderMappedMarkdown, toWysiwygHtml } from './markdown'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { PlantUmlNode } from '../extensions/PlantUmlNode'

it('keeps the exact PlantUML fence when unrelated rendered content is edited', () => {
  const source = 'Before\n\n~~~~plantuml\n@startuml\nAlice -> Bob : request\n@enduml\n~~~~\n\nAfter'
  const doc = new DOMParser().parseFromString(toWysiwygHtml(source), 'text/html')
  expect(doc.querySelector('[data-type="plantuml"]')?.getAttribute('data-chart')).toBe('@startuml\nAlice -> Bob : request\n@enduml\n')
  doc.querySelector('p')!.textContent = 'Edited'
  const saved = fromWysiwygHtml(doc.body.innerHTML)
  expect(saved).toContain('~~~~plantuml\n@startuml\nAlice -> Bob : request\n@enduml\n~~~~')
  expect(saved).toContain('Edited')
})

it('preserves the opaque node through a real rendered-editor transaction', () => {
  const fence = '~~~~plantuml\r\n@startuml\r\nactor Alice\r\nparticipant Bob\r\nAlice -> Bob : hello\r\n@enduml\r\n~~~~'
  const editor = new Editor({ extensions: [StarterKit, PlantUmlNode], content: toWysiwygHtml('# Before\r\n\r\n' + fence) })
  expect(editor.state.doc.lastChild?.type.name).toBe('plantuml')
  editor.commands.insertContentAt(2, 'edit')
  expect(fromWysiwygHtml(editor.getHTML())).toContain(fence)
  editor.commands.undo()
  expect(fromWysiwygHtml(editor.getHTML())).toContain(fence)
  editor.destroy()
})

it('does not duplicate surrounding quote markers after an unrelated edit', () => {
  const source = 'Before\n\n> ~~~~plantuml\n> @startuml\n> Alice -> Bob\n> @enduml\n> ~~~~\n'
  const editor = new Editor({ extensions: [StarterKit, PlantUmlNode], content: toWysiwygHtml(source) })
  editor.commands.insertContentAt(1, 'Edited ')
  const doc = new DOMParser().parseFromString(toWysiwygHtml(fromWysiwygHtml(editor.getHTML())), 'text/html')
  expect(doc.querySelectorAll('blockquote')).toHaveLength(1)
  expect(doc.querySelector('blockquote [data-type="plantuml"]')?.getAttribute('data-chart')).toBe('@startuml\nAlice -> Bob\n@enduml\n')
  editor.destroy()
})

it('maps a rendered PlantUML diagram as a block, not exact text', () => {
  const source = '```plantuml\n@startuml\nAlice -> Bob\n@enduml\n```\n'
  const mapped = renderMappedMarkdown(source, { documentId: 'doc', revision: 1, generation: 1 })
  const doc = new DOMParser().parseFromString(mapped.html, 'text/html')
  expect(doc.querySelector('[data-type="plantuml"]')).not.toBeNull()
  expect(doc.querySelector('[data-mw-text]')).toBeNull()
})
