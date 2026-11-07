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
