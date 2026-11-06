import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export function pngDimensions(data) {
  assert.ok(data.length >= 33 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature')
  assert.equal(data.toString('ascii', 12, 16), 'IHDR', 'PNG header')
  assert.equal(data[24], 8, 'PNG 8-bit channels')
  assert.equal(data[25], 6, 'PNG RGBA color type')
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

export function icoImages(data) {
  assert.ok(data.length >= 6 && data.readUInt16LE(0) === 0 && data.readUInt16LE(2) === 1, 'ICO header')
  const count = data.readUInt16LE(4)
  assert.ok(count && 6 + count * 16 <= data.length, 'ICO directory')
  return Array.from({ length: count }, (_, i) => {
    const at = 6 + i * 16, size = data.readUInt32LE(at + 8), offset = data.readUInt32LE(at + 12)
    assert.ok(size && offset >= 6 + count * 16 && offset + size <= data.length, 'ICO image bounds')
    return { width: data[at] || 256, height: data[at + 1] || 256, data: data.subarray(offset, offset + size) }
  })
}

export async function verifyDesktopIconSources(root) {
  const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  const paths = ['icons/32x32.png', 'icons/64x64.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.png', 'icons/icon.icns', 'icons/icon.ico']
  assert.deepEqual(config.bundle.icon, paths, 'Complete configured desktop icon set')
  assert.equal(config.bundle.macOS.signingIdentity, '-', 'Whole-bundle ad-hoc signing required')
  const icons = []
  for (const path of paths) {
    const data = await readFile(join(root, 'src-tauri', path))
    const entry = { path, sha256: createHash('sha256').update(data).digest('hex') }
    if (path.endsWith('.png')) {
      const size = { 'icons/32x32.png': 32, 'icons/64x64.png': 64, 'icons/128x128.png': 128, 'icons/128x128@2x.png': 256, 'icons/icon.png': 512 }[path]
      entry.dimensions = pngDimensions(data)
      assert.deepEqual(entry.dimensions, [size, size], path)
    } else if (path.endsWith('.ico')) {
      const images = icoImages(data)
      assert.deepEqual(images.map(image => [image.width, image.height]), [32, 16, 24, 48, 64, 256].map(size => [size, size]), 'Windows ICO layers, 32px first')
      entry.sizes = images.map(image => image.width)
    } else {
      assert.equal(data.toString('ascii', 0, 4), 'icns', 'ICNS header')
      assert.equal(data.readUInt32BE(4), data.length, 'ICNS size')
      const layers = []
      for (let offset = 8; offset < data.length;) {
        assert.ok(offset + 8 <= data.length, 'ICNS layer header')
        const size = data.readUInt32BE(offset + 4)
        assert.ok(size >= 8 && offset + size <= data.length, 'ICNS layer bounds')
        layers.push(data.toString('ascii', offset, offset + 4)); offset += size
      }
      assert.ok(['ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'].every(layer => layers.includes(layer)), 'Complete macOS 1x/2x layers')
      entry.layers = layers
    }
    icons.push(entry)
  }
  return icons
}
