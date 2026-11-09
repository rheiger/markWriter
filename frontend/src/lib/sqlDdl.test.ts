import { describe, expect, it } from 'vitest'
import { convertSqlDdl } from './sqlDdl'

describe('bounded SQL DDL import', () => {
  it('gives actionable errors for common unsupported inputs without echoing source', () => {
    const cases = [
      ['# Private notes\n```sql\nCREATE TABLE t(id int);\n```', /Markdown.*\.sql/i],
      ['-- comment\nPRAGMA foreign_keys = ON;', /PRAGMA.*line 2.*supported/i],
      ['CREATE TABLE t(id INTEGER CHECK(id > 0));', /CHECK.*line 1.*supported/i],
      ['CREATE TABLE t(id INTEGER PRIMARY KEY AUTOINCREMENT);', /AUTOINCREMENT.*line 1.*supported/i],
      ['CREATE VIEW secret AS SELECT * FROM t;', /VIEW.*line 1.*supported/i],
    ] as const
    for (const [input, message] of cases) {
      try { convertSqlDdl(input, 'sqlite'); throw new Error('unexpected success') }
      catch (error) { expect(String(error)).toMatch(message); expect(String(error)).not.toContain('secret') }
    }
  })
  it('preserves ordered PostgreSQL keys and qualified foreign keys', () => {
    const result = convertSqlDdl(`CREATE TABLE accounting.customers (id integer, region text, PRIMARY KEY (region,id));
CREATE TABLE orders (region text, customer_id integer, UNIQUE(region, customer_id), FOREIGN KEY (region, customer_id) REFERENCES accounting.customers(region,id));`, 'postgresql')
    expect(result.dbml).toContain('(region, id) [pk]')
    expect(result.dbml).toContain('Ref: accounting.customers.(region, id) - public.orders.(region, customer_id)')
    expect(result.dbml).toContain('id integer [not null]')
  })
  it('retains SQLite nullable composite keys and resolves ASCII case', () => {
    const result = convertSqlDdl('CREATE TABLE Parent (A INT, B TEXT NOT NULL, PRIMARY KEY(A,B)); CREATE TABLE child (x INT, y TEXT, FOREIGN KEY(x,y) REFERENCES parent(a,b));', 'sqlite')
    expect(result.dbml).toContain('A INT [null]')
    expect(result.dbml).toContain('Ref: main.child.(x, y) > main.Parent.(A, B)')
  })
  it('rejects trailing DML, unterminated comments and lossy constructs', () => {
    for (const input of ['CREATE TABLE t (x INT); INSERT INTO t VALUES (1);', 'CREATE TABLE t (x INT) /* unclosed', 'CREATE TABLE t (x serial);', 'CREATE TABLE t (x INT CHECK(x > 0));', 'CREATE TABLE t (x INT); /* outer /* inner */ INSERT INTO t VALUES (1); -- */']) {
      expect(() => convertSqlDdl(input, 'sqlite')).toThrow()
    }
  })
  it('rejects unresolved references and malformed source', () => {
    expect(() => convertSqlDdl('CREATE TABLE a (x int REFERENCES absent(id));', 'postgresql')).toThrow()
    expect(() => convertSqlDdl('CREATE TABLE a (x int) garbage;', 'postgresql')).toThrow()
  })
})

describe('SQL grammar boundaries', () => {
  it('handles ALTER constraints, escaped identifiers and delimited omissions', () => {
    const result = convertSqlDdl(`\ufeffCREATE TABLE public."A""B" (id INTEGER PRIMARY KEY, title VARCHAR(40) DEFAULT 'x');
      CREATE TABLE items (id INT PRIMARY KEY, owner INTEGER REFERENCES public."A""B"(id) ON DELETE CASCADE);
      ALTER TABLE public.items ADD CONSTRAINT uq UNIQUE(owner);`, 'postgresql')
    expect(result.dbml).toContain(JSON.stringify('A"B'))
    expect(result.dbml).toContain('"VARCHAR(40)"')
    expect(result.warnings.join(' ')).toContain('DEFAULT')
    expect(result.warnings.join(' ')).toContain('ON DELETE')
    expect(result.dbml).toContain(' - public.items.(owner)')
  })
  it('handles SQLite rowid and explicitly warns about its semantics', () => {
    const result = convertSqlDdl('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT DEFAULT \'\');', 'sqlite')
    expect(result.dbml).toContain('id INTEGER [not null]')
    expect(result.warnings.join(' ')).toContain('rowid')
  })
  it('rejects unsupported structures and duplicate or unsafe declarations', () => {
    for (const sql of [
      'CREATE TABLE t (id int); CREATE INDEX ix ON t(id);',
      'CREATE TABLE t (id int); CREATE TABLE T (x int);',
      'CREATE TABLE t (id int, id text);',
      'CREATE TABLE t (id int, PRIMARY KEY(missing));',
      'CREATE TABLE t (id int DEFAULT now());',
      'CREATE TABLE t (id int); DROP TABLE t;',
      'CREATE TABLE t (id int REFERENCES t(id));',
      'CREATE TABLE t (id int); /* unclosed',
      'CREATE TABLE t (id int) WITHOUT ROWID;',
      'CREATE TABLE t (id INTEGER PRIMARY KEY DESC);',
      'CREATE TABLE t (id int CONSTRAINT stray);',
      'CREATE TABLE t (id int DEFAULT \'unterminated);',
      'CREATE TABLE t (id int REFERENCES t(id) ON DELETE MAGIC);',
    ]) expect(() => convertSqlDdl(sql, 'sqlite'), sql).toThrow()
  })
  it('does not treat an identifier containing a period as a schema', () => {
    const result = convertSqlDdl('CREATE TABLE "main.t" ("a.b" INT PRIMARY KEY);', 'sqlite')
    expect(result.dbml).toContain('main."main.t"')
    expect(result.dbml).toContain('"a.b"')
  })
  it('respects nested PostgreSQL comments and preserves non-ASCII identifier case', () => {
    const result = convertSqlDdl('/* outer /* inner */ outer */ CREATE TABLE Ä (X INT PRIMARY KEY);', 'postgresql')
    expect(result.dbml).toContain('public.Ä')
    expect(result.dbml).toContain('x INT')
  })
  it('does not hide a PostgreSQL statement after a bare carriage return in a line comment', () => {
    expect(() => convertSqlDdl('CREATE TABLE t (id INTEGER); -- comment\rINSERT INTO t VALUES (1);', 'postgresql')).toThrow(/Unsupported SQL statement/)
  })
  it('rejects embedded NUL even inside comments', () => {
    expect(() => convertSqlDdl('CREATE TABLE t(id int); -- ignored\0\nCREATE TABLE u(id int);', 'postgresql')).toThrow(/NUL/)
  })
  it('rejects generated DOT that exceeds the downstream layout limit', () => {
    const name = '\\'.repeat(60)
    const foreign = Array.from({ length: 85 }, () => `FOREIGN KEY ("${name}") REFERENCES parent("${name}")`).join(',')
    const sql = `CREATE TABLE parent ("${name}" INT PRIMARY KEY); CREATE TABLE child ("${name}" INT, ${foreign});`
    expect(() => convertSqlDdl(sql, 'sqlite')).toThrow(/limit/i)
  })
  it('enforces UTF-8 byte limit', () => {
    expect(() => convertSqlDdl(' '.repeat(65537), 'sqlite')).toThrow(/64 KiB/)
  })
})

describe('dialect-specific source validity', () => {
  it('rejects schema-qualified SQLite references and columns following table constraints', () => {
    expect(() => convertSqlDdl('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (pid INTEGER REFERENCES main.parent(id));', 'sqlite')).toThrow()
    expect(() => convertSqlDdl('CREATE TABLE t (x INTEGER, UNIQUE(x), y INTEGER);', 'sqlite')).toThrow()
  })
  it('does not infer SQLite one-to-one relationships from child uniqueness', () => {
    const result = convertSqlDdl('CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(pid TEXT UNIQUE REFERENCES p(id));', 'sqlite')
    expect(result.dbml).toContain('Ref: main.c.(pid) > main.p.(id)')
    expect(result.warnings.join(' ')).toContain('affinity')
  })
  it('preserves the SQLite main schema in declarations and references', () => {
    const result = convertSqlDdl('CREATE TABLE main.p (id INT PRIMARY KEY); CREATE TABLE c (pid INT REFERENCES p(id));', 'sqlite')
    expect(result.dbml).toContain('Table main.p')
    expect(result.dbml).toContain('Ref: main.c.(pid) > main.p.(id)')
  })
  it('rejects SQLite numeric junk and reserved table names', () => {
    expect(() => convertSqlDdl('CREATE TABLE t (x INT DEFAULT 1NULL);', 'sqlite')).toThrow()
    expect(() => convertSqlDdl('CREATE TABLE "SQLite_internal" (x INT);', 'sqlite')).toThrow()
  })
  it('does not infer one-to-one for PostgreSQL foreign keys with different declared types', () => {
    const result = convertSqlDdl('CREATE TABLE p(id DOUBLE PRECISION PRIMARY KEY); CREATE TABLE c(pid BIGINT UNIQUE REFERENCES p(id));', 'postgresql')
    expect(result.dbml).toContain('Ref: public.c.(pid) > public.p.(id)')
    expect(result.warnings.join(' ')).toContain('type')
  })
  it('rejects PostgreSQL numeric junk, invalid types and reserved identifiers', () => {
    for (const sql of ['CREATE TABLE t (x INT DEFAULT 1NULL);', 'CREATE TABLE t (x DOUBLE);', 'CREATE TABLE t (x VARCHAR(0));', 'CREATE TABLE from (x INT);']) {
      expect(() => convertSqlDdl(sql, 'postgresql'), sql).toThrow()
    }
  })
})
