import { expect, it } from 'vitest'
import sequence from './fixtures/plantuml-sequence.svg?raw'
import klass from './fixtures/plantuml-class.svg?raw'
import { sanitizePlantUmlSvg } from './plantumlSvg'

it.each([sequence, klass])('preserves bounded geometry and text from a real runtime SVG', raw => {
  const clean = sanitizePlantUmlSvg(raw)
  const original = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  expect(doc.querySelector('text')?.textContent).toBeTruthy()
  expect(doc.documentElement.getAttribute('width')).toBeTruthy()
  expect(doc.querySelector('text[style="white-space: pre"]')).not.toBeNull()
  expect(doc.querySelector('[data-qualified-name]')).toBeNull()
  const geometry = (d: Document) => Array.from(d.querySelectorAll('path,line,rect,polygon,circle,text'), element => ({
    type: element.localName,
    attrs: Array.from(element.attributes).filter(attr => !/^(id|class|data-)/.test(attr.name)).map(attr => [attr.name, attr.value]).sort(),
    text: element.textContent,
  }))
  expect(geometry(doc)).toEqual(geometry(original))
})

it('rejects external image, unknown styling, declarations and script instead of rendering a partial diagram', () => {
  for (const body of ['<image href="file:///tmp/canary"/>', '<text style="fill:url(http://127.0.0.1/x)">x</text>', '<script/>']) {
    expect(() => sanitizePlantUmlSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`)).toThrow()
  }
  expect(() => sanitizePlantUmlSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///tmp/canary">]><svg/>')).toThrow()
})
