// Synthetic SQL: independently meaningful INSERTs rather than whitespace padding.
// Compatible with verifyLongCode in long-code-acceptance.mjs.
export function sqlHighlightFixture() {
  const marker = 'sql_first_sentinel'
  const finalMarker = 'sql_final_sentinel'
  const rows = Array.from({ length: 1170 }, (_, n) =>
    `INSERT INTO records VALUES (${n}, 'representative value ${'x'.repeat(38)}');`)
  const code = `SELECT '${marker}';\n` + rows.join('\n') +
    `\n/* a multiline comment\nSELECT remains_comment */\nSELECT '${finalMarker}';`
  const blocks = [{ language: 'sql', marker, finalMarker, code }]
  return { blocks, source: '# Large SQL highlighting\n\n```sql\n' + code + '\n```\n' }
}
