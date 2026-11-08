// Deterministic inputs for editor and standalone Quick Look acceptance.
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

function tomlDocument(rows, valueLength, prefix) {
  const lines = [
    '# Déploiement Zürich — 日本語 configuration',
    `${prefix}_start = "near-start sentinel"`,
    'title = "MarkWriter fixture — café ☕"',
    'enabled = true',
    'created = 2026-11-08T10:30:00Z',
    '[service]',
    'ports = [8000, 8001, 8002]',
    'metadata = { region = "eu-central", owner = "Richie" }',
  ]
  const phrase = 'configuration für Zürich — service settings; '
  const value = phrase.repeat(Math.ceil(valueLength / phrase.length)).slice(0, valueLength)
  for (let n = 0; n < rows; n++) {
    lines.push(`setting_${String(n).padStart(4, '0')} = "${value}"`)
  }
  lines.push(`${prefix}_final = "final sentinel"`)
  return lines.join('\n')
}

export function tomlEditorFixture() {
  const marker = 'editor_toml_start', finalMarker = 'editor_toml_final'
  const code = tomlDocument(85, 115, 'editor_toml')
  const blocks = [{ language: 'toml', marker, finalMarker, code }]
  const source = `# Technical notes\n\nA **strong** claim with *emphasis* and a [reference](https://example.com/docs).\n\n| Setting | Value |\n| --- | --- |\n| Region | Zürich |\n| Mode | Offline |\n\n## Configuration\n\n\`\`\`toml\n${code}\n\`\`\`\n\n`
  return { blocks, source }
}

export function tomlStandaloneFixture() {
  return tomlDocument(125, 820, 'standalone_toml')
}

export function fixtureFiles() {
  const { source } = tomlEditorFixture()
  const richSource = source + '\n## Workflow\n\n```mermaid\ngraph LR\n  A[Source] --> B[Preview]\n```\n\n```dot\ndigraph workflow { source -> preview; }\n```\n'
  const standalone = tomlStandaloneFixture()
  const records = Array.from({ length: 200 }, (_, n) => ({ id: n + 1, label: `record-${n + 1}`, active: n % 2 === 0 }))
  const compact = JSON.stringify({ title: 'Compact JSON', entries: Array.from({ length: 930 }, (_, n) => ({ id: n, name: `entry-${n}`, note: 'Unicode Zürich and deterministic content '.repeat(2) })) })
  return {
    'editor-rich.md': richSource,
    'standalone.toml': standalone,
    'malformed-xss.toml': 'title = "unterminated\nprobe = "<script>globalThis.fixtureXss = true</script>"\nhtml = "<img src=x onerror=alert(1)>"',
    'oversized.toml': `oversized_start = true\n#${'x'.repeat(1024 * 1024)}\noversized_final = true`,
    'compact.json': compact,
    'records.jsonl': records.map(record => JSON.stringify(record)).join('\n'),
    'mixed.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<article>Before <em>mixed</em> content &amp; after <link href="https://example.com">reference</link>.</article>',
  }
}

async function main() {
  const directory = process.argv[2]
  if (!directory || !isAbsolute(directory) || process.argv.length !== 3) throw new Error('Provide one absolute path to an existing disposable directory')
  const files = fixtureFiles(), summary = {}
  // Exclusive creation refuses existing paths; never replace user data.
  for (const [name, content] of Object.entries(files)) {
    const bytes = Buffer.from(content, 'utf8')
    await writeFile(join(directory, name), bytes, { flag: 'wx' })
    summary[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
