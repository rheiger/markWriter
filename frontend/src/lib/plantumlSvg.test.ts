import { expect, it } from 'vitest'
import sequence from './fixtures/plantuml-sequence.svg?raw'
import klass from './fixtures/plantuml-class.svg?raw'
import { sanitizePlantUmlSvg } from './plantumlSvg'

it.each([sequence, klass])('preserves bounded geometry and text from a real runtime SVG', raw => {
  const clean = sanitizePlantUmlSvg(raw)
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  expect(doc.querySelector('text')?.textContent).toBeTruthy()
  expect(doc.documentElement.getAttribute('width')).toBeTruthy()
  expect(doc.querySelector('text[style="white-space: pre"]')).not.toBeNull()
  expect(doc.querySelector('[data-qualified-name]')).toBeNull()
})

it('rejects external image, unknown styling, declarations and script instead of rendering a partial diagram', () => {
  for (const body of ['<image href="file:///tmp/canary"/>', '<text style="fill:url(http://127.0.0.1/x)">x</text>', '<script/>']) {
    expect(() => sanitizePlantUmlSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`)).toThrow()
  }
  expect(() => sanitizePlantUmlSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///tmp/canary">]><svg/>')).toThrow()
})
