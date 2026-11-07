import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { verifyDesktopIconSources, icoImages, pngDimensions } from './icon-integrity.mjs'

test('configured desktop icon set has complete native sizes', async () => {
  const icons = await verifyDesktopIconSources(resolve(import.meta.dirname, '..'))
  assert.equal(icons.length, 7)
  assert.ok(icons.every(icon => /^[a-f0-9]{64}$/.test(icon.sha256)))
})

test('ICO payloads preserve all required Windows resolutions and reject truncated images', async () => {
  const data = await readFile(new URL('../src-tauri/icons/icon.ico', import.meta.url))
  const images = icoImages(data)
  assert.deepEqual(images.map(image => image.width), [32, 16, 24, 48, 64, 256])
  assert.throws(() => icoImages(data.subarray(0, data.length - 1)), /ICO image bounds/)
  assert.throws(() => pngDimensions(Buffer.from('not PNG')), /PNG/)
})
