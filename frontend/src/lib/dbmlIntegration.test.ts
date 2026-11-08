import { EditorState } from '@codemirror/state'
import { expect, it } from 'vitest'
import { fromWysiwygHtml, renderMappedMarkdown, toWysiwygHtml } from './markdown'
import { findEmbeddedSource } from './sourceFolds'

const source = 'Before\r\n\r\n~~~~dbml\r\nTable "顧客<&" {\r\n  id int [pk]\r\n}\r\n~~~~\r\n\r\nAfter'

it('retains the escaped DBML fence through the rendered codec and uses block correspondence', () => {
  const map = renderMappedMarkdown(source, { documentId: 'model', revision: 3, generation: 1 })
  const doc = new DOMParser().parseFromString(map.html, 'text/html')
  const atom = doc.querySelector('[data-type="dbml"]')
  expect(atom?.getAttribute('data-chart')).toBe('Table "顧客<&" {\n  id int [pk]\n}\n')
  expect(atom?.closest('[data-mw-block]')).not.toBeNull()
  expect(atom?.querySelector('[data-mw-text]')).toBeNull()
  const rendered = toWysiwygHtml(source)
  const edit = rendered.replace('<p>Before</p>', '<p>Edited</p>')
  expect(fromWysiwygHtml(edit)).toContain('~~~~dbml\r\nTable "顧客<&" {\r\n  id int [pk]\r\n}\r\n~~~~')
  expect(fromWysiwygHtml(edit)).toContain('Edited')
  const state = EditorState.create({ doc: source })
  expect(findEmbeddedSource(state)).toMatchObject([{ kind: 'DBML' }])
})

it.each([
  '  ~~~~dbml\r\n  Table t { id int }\r\n  ~~~~',
  '> ~~~~dbml\r\n> Table t { id int }\r\n> ~~~~',
  '1. Schema\r\n\r\n   ~~~~dbml\r\n   Table t { id int }\r\n   ~~~~',
])('preserves a DBML fence in its Markdown container after unrelated edits', block => {
  const original = 'Before\r\n\r\n' + block + '\r\n\r\nAfter'
  const edit = toWysiwygHtml(original).replace('<p>Before</p>', '<p>Edited</p>')
  const output = fromWysiwygHtml(edit)
  expect(output).toContain(block.startsWith('1.') ? block.split('\r\n\r\n')[1] : block)
  expect(output).toContain('Edited')
  expect(output).toContain('After')
})

it('validates raw DBML metadata in context before restoring it', () => {
  const raw = JSON.stringify({ raw: '~~~~dbml\nTable t { id int }\n~~~~\n\nInjected paragraph' })
  const doc = new DOMParser().parseFromString(toWysiwygHtml('~~~~dbml\nTable t { id int }\n~~~~'), 'text/html')
  doc.querySelector('[data-type="dbml"]')?.setAttribute('data-source-fence', raw)
  const output = fromWysiwygHtml(doc.body.innerHTML)
  expect(output).not.toContain('Injected paragraph')
  expect(output).toContain('Table t { id int }')
})
