import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertSqlDdl } from './sqlDdl'
import { dbmlToDot } from './dbml'
import { workflowSchema } from '../../../tools/fixtures/sql-import/workflow-schema.mjs'

const fixture = (name: string) => readFileSync('../tools/fixtures/sql-import/' + name + '.sql', 'utf8')
describe('representative SQL import schemas', () => {
  it.each(['postgresql', 'sqlite'] as const)('converts over 100 KiB of workflow DDL in %s', dialect => {
    const sql = workflowSchema()
    expect(Buffer.byteLength(sql, 'utf8')).toBeGreaterThan(100 * 1024)
    const result = convertSqlDdl(sql, dialect)
    const dot = dbmlToDot(result.dbml)
    expect(dot.match(/shape=box/g)).toHaveLength(20)
    expect(dot).toContain('PK (id)')
    expect(result.dbml).toMatch(/training \{[\s\S]*summary "varchar\(255\)" \[not null\]/i)
    expect(result.warnings).toHaveLength(380)
    expect(result.warnings.at(-1)).toMatch(/training.summary: DEFAULT/)
  })
  it('preserves the retail migration relationship graph, and reports omitted behavior', () => {
    const result = convertSqlDdl(fixture('postgresql-retail'), 'postgresql')
    const dot = dbmlToDot(result.dbml)
    expect(dot.match(/shape=box/g)).toHaveLength(5)
    expect(dot.match(/ -> /g)).toHaveLength(5)
    expect(dot).toContain('PK (account_id, purchase_id, line_no)')
    expect(dot).toContain('UK (account_id, email)')
    expect(dot).toContain('retail.purchase (account_id, customer_id) > retail.customer (account_id, customer_id)')
    expect(dot).toContain('Étiquette')
    expect(result.warnings.join('\n')).toMatch(/product.*active.*default/i)
    expect(result.warnings.join('\n')).toMatch(/purchase_line.*ON DELETE/i)
  })
  it('resolves SQLite declaration spelling and warns about checkpoint cardinality', () => {
    const result = convertSqlDdl(fixture('sqlite-notes'), 'sqlite')
    const dot = dbmlToDot(result.dbml)
    expect(dot.match(/shape=box/g)).toHaveLength(5)
    expect(dot.match(/ -> /g)).toHaveLength(5)
    expect(dot).toContain('PK (workspace_id, note_id, tag_id)')
    expect(result.warnings.join('\n')).toMatch(/affinity/i)
    expect(dot).toContain('sync_checkpoint (workspace_id)')
    expect(dot).toContain('Note (workspace_id,')
    expect(result.warnings.join('\n')).toMatch(/Note.*title.*default/i)
  })
})
