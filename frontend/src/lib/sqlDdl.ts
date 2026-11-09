import { dbmlToDot } from './dbml'
import { validateDot } from './dotSafety'

export type SqlDialect = 'postgresql' | 'sqlite'
export type SqlImportResult = { dbml: string; warnings: string[] }
export const SQL_DDL_MAX_BYTES = 65536

type Token = { value: string; kind: 'word' | 'quoted' | 'string' | 'symbol'; line: number }
type Key = { columns: string[]; primary: boolean }
type ForeignKey = { columns: string[]; target: string[]; targetColumns: string[] }
type Table = { path: string[]; columns: { name: string; type: string; nullable: boolean | null }[]; keys: Key[]; refs: ForeignKey[] }
const quote = (s: string) => JSON.stringify(s)
const renderName = (s: string) => /^[\p{L}\p{N}_$]+$/u.test(s) ? s : quote(s)
const equalTuple = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// Tokenize every source character. SQL strings and quoted identifiers are kept distinct
// from syntax, and comments follow the selected dialect's nesting rules.
function lex(source: string, dialect: SqlDialect): Token[] {
  const out: Token[] = []; let i = 0; let line = 1
  const fail = (message: string): never => { throw new Error(`${message} at line ${line}`) }
  while (i < source.length) {
    const c = source[i]
    if (' \t\r\n\f'.includes(c) || (i === 0 && c === '\ufeff')) { if (c === '\n' || (c === '\r' && source[i + 1] !== '\n')) line++; i++; continue }
    if (source.startsWith('--', i)) { while (i < source.length && source[i] !== '\n' && (dialect !== 'postgresql' || source[i] !== '\r')) i++; continue }
    if (source.startsWith('/*', i)) {
      i += 2; let depth = 1
      while (i < source.length && depth) {
        if (dialect === 'postgresql' && source.startsWith('/*', i)) { depth++; i += 2 }
        else if (source.startsWith('*/', i)) { depth--; i += 2 }
        else { if (source[i] === '\n') line++; i++ }
      }
      if (depth) fail('Unclosed comment')
      continue
    }
    if (c === '"' || c === "'") {
      const start = line; let value = ''; let closed = false; i++
      while (i < source.length) {
        const n = source[i++]
        if (n === c) { if (source[i] === c) { value += c; i++ } else { closed = true; break } }
        else { if (n === '\n') line++; value += n }
      }
      if (!closed || (c === '"' && !value) || [...value].some(ch => ch.charCodeAt(0) < 32) || (c === "'" && dialect === 'postgresql' && value.includes('\\')) || value.length > 256) fail('Invalid quoted token')
      out.push({ value, kind: c === '"' ? 'quoted' : 'string', line: start }); continue
    }
    // Recognize comparison symbols so unsupported CHECK and PRAGMA syntax can
    // be diagnosed by the parser. They are not accepted by the grammar.
    if ('(),.;+-=<>*'.includes(c)) { out.push({ value: c, kind: 'symbol', line }); i++; continue }
    const match = /^[\p{L}_][\p{L}\p{N}_$]*|^[0-9]+/u.exec(source.slice(i))
    if (!match || match[0].length > 256) fail('Unsupported SQL character or token; use a supported DDL excerpt and check the selected dialect')
    if (/^\d/u.test(match![0]) && /^[\p{L}_$]/u.test(source.slice(i + match![0].length))) fail('Invalid numeric token')
    out.push({ value: match![0], kind: 'word', line }); i += match![0].length
  }
  return out
}

export function convertSqlDdl(source: string, dialect: SqlDialect): SqlImportResult {
  if (dialect !== 'postgresql' && dialect !== 'sqlite') throw new Error('Unsupported SQL dialect')
  if (source.includes('\0')) throw new Error('SQL contains a NUL character')
  if (source.length > SQL_DDL_MAX_BYTES || new TextEncoder().encode(source).length > SQL_DDL_MAX_BYTES) throw new Error('SQL exceeds 64 KiB limit')
  if (/^\ufeff?\s*(?:#{1,6}\s|`{3,}|~{3,})/u.test(source)) throw new Error('This looks like Markdown, not SQL DDL. Choose a .sql file containing supported CREATE TABLE statements.')
  const tokens = lex(source, dialect); let pos = 0
  const warnings: string[] = []; const tables: Table[] = []
  const fail = (message: string): never => { throw new Error(tokens[pos] ? `${message} at line ${tokens[pos].line}` : message) }
  const unsupported = (feature: string): never => { throw new Error(`${feature} is not supported${tokens[pos] ? ` at line ${tokens[pos].line}` : ''}. Use an excerpt containing supported table DDL and check the selected dialect.`) }
  const dialectName = dialect === 'sqlite' ? 'SQLite' : 'PostgreSQL'
  const dialectError = (message: string, line?: number): never => { throw new Error(`${message}${line ? ` at line ${line}` : ''}. Check the selected dialect; this syntax may also be outside the supported subset.`) }
  const is = (s: string) => tokens[pos]?.kind !== 'quoted' && tokens[pos]?.kind !== 'string' && tokens[pos]?.value.toUpperCase() === s
  const take = (s: string) => { if (!is(s)) fail(`Expected ${s}`); pos++ }
  const maybe = (s: string) => { if (is(s)) { pos++; return true } return false }
  const reserved = new Set(['CREATE','TABLE','ALTER','ADD','CONSTRAINT','PRIMARY','KEY','UNIQUE','FOREIGN','REFERENCES','NOT','NULL','DEFAULT','CHECK','ON','DELETE','UPDATE','INSERT','SELECT','INDEX','IF','EXISTS','ALL','ANALYSE','ANALYZE','AND','ANY','ARRAY','AS','ASC','ASYMMETRIC','AUTHORIZATION','BETWEEN','BINARY','BOTH','CASE','CAST','COLLATE','COLLATION','COLUMN','CONCURRENTLY','CROSS','CURRENT_CATALOG','CURRENT_DATE','CURRENT_ROLE','CURRENT_SCHEMA','CURRENT_TIME','CURRENT_TIMESTAMP','CURRENT_USER','DEFERRABLE','DESC','DISTINCT','DO','ELSE','END','EXCEPT','FALSE','FETCH','FOR','FROM','FULL','GRANT','GROUP','HAVING','ILIKE','IN','INITIALLY','INNER','INTERSECT','INTO','IS','ISNULL','JOIN','LATERAL','LEADING','LEFT','LIKE','LIMIT','LOCALTIME','LOCALTIMESTAMP','NATURAL','NOTNULL','OFFSET','ONLY','OR','ORDER','OUTER','OVERLAPS','PLACING','RETURNING','RIGHT','SESSION_USER','SIMILAR','SOME','SYMMETRIC','TABLESAMPLE','THEN','TO','TRAILING','TRUE','UNION','USER','USING','VARIADIC','VERBOSE','WHEN','WHERE','WINDOW','WITH'])
  const name = () => {
    const t = tokens[pos]
    if (!t || (t.kind !== 'word' && t.kind !== 'quoted') || (t.kind === 'word' && (!/^[\p{L}_]/u.test(t.value) || reserved.has(t.value.toUpperCase())))) return fail('Expected identifier')
    pos++
    const value = dialect === 'postgresql' && t.kind === 'word' ? t.value.replace(/[A-Z]/g, c => c.toLowerCase()) : t.value
    if (dialect === 'postgresql' && new TextEncoder().encode(value).length > 63) fail('PostgreSQL identifier exceeds 63 bytes')
    return value
  }
  const path = () => { const first = name(); return maybe('.') ? [first, name()] : [dialect === 'postgresql' ? 'public' : 'main', first] }
  const names = () => { take('('); const result = [name()]; while (maybe(',')) result.push(name()); take(')'); return result }
  const fold = (s: string) => dialect === 'sqlite' ? s.replace(/[A-Z]/g, c => c.toLowerCase()) : s
  const pathKey = (p: string[]) => JSON.stringify(p.map(fold))
  const warn = (context: string, what: string) => warnings.push(`${context}: ${what} is omitted from the diagram`)
  const actions = (context: string) => {
    const seen = new Set<string>()
    while (maybe('ON')) {
      const action = is('DELETE') ? 'DELETE' : is('UPDATE') ? 'UPDATE' : fail('Expected DELETE or UPDATE'); pos++
      if (seen.has(action)) fail('Duplicate foreign key action'); seen.add(action)
      if (maybe('NO')) take('ACTION')
      else if (maybe('SET')) { if (!maybe('NULL') && !maybe('DEFAULT')) fail('Expected NULL or DEFAULT') }
      else if (!maybe('CASCADE') && !maybe('RESTRICT')) fail('Unsupported foreign key action')
      warn(context, `ON ${action} action`)
    }
  }
  const foreign = (table: Table, columns: string[], context: string) => { take('REFERENCES'); const target = dialect === 'sqlite' ? ['main', name()] : path(); if (dialect === 'sqlite' && is('.')) fail('SQLite references cannot qualify a schema'); const targetColumns = names(); actions(context); table.refs.push({ columns, target, targetColumns }) }
  const constraint = (table: Table) => {
    if (maybe('CONSTRAINT')) name()
    if (is('CHECK')) unsupported('CHECK constraints')
    if (maybe('PRIMARY')) { take('KEY'); table.keys.push({ columns: names(), primary: true }) }
    else if (maybe('UNIQUE')) table.keys.push({ columns: names(), primary: false })
    else if (maybe('FOREIGN')) { take('KEY'); const cols = names(); foreign(table, cols, table.path.join('.')) }
    else fail('Unsupported table constraint')
  }
  const typeNames = new Set(['INT','INTEGER','SMALLINT','BIGINT','TEXT','VARCHAR','CHAR','CHARACTER','BOOLEAN','BOOL','REAL','DOUBLE','FLOAT','NUMERIC','DECIMAL','DATE','TIME','TIMESTAMP','UUID','BLOB','BYTEA'])
  const column = (table: Table) => {
    const colName = name(); const typeToken = tokens[pos]
    if (!typeToken || typeToken.kind !== 'word' || !typeNames.has(typeToken.value.toUpperCase())) dialectError(`Unsupported ${dialectName} column type`, typeToken?.line)
    if (dialect === 'postgresql' && typeToken.value.toUpperCase() === 'BLOB') dialectError('Unsupported PostgreSQL column type', typeToken.line)
    pos++; let type = typeToken.value
    if (maybe('PRECISION')) { if (type.toUpperCase() !== 'DOUBLE') fail('Unsupported type modifier'); type += ' precision' }
    else if (dialect === 'postgresql' && type.toUpperCase() === 'DOUBLE') fail('Expected PRECISION after DOUBLE')
    if (maybe('VARYING')) { if (type.toUpperCase() !== 'CHARACTER') fail('Unsupported type modifier'); type += ' varying' }
    if (is('(') && dialect === 'postgresql' && !['VARCHAR','CHAR','CHARACTER','CHARACTER VARYING','NUMERIC','DECIMAL','FLOAT','TIME','TIMESTAMP'].includes(type.toUpperCase())) fail('Unsupported PostgreSQL type arguments')
    if (maybe('(')) { const args: string[] = []; do { const t = tokens[pos]; if (!t || t.kind !== 'word' || !/^\d+$/u.test(t.value)) fail('Expected numeric type argument'); args.push(t.value); pos++ } while (maybe(',')); if (args.length > 2 || (dialect === 'postgresql' && args.length > 1 && !['NUMERIC','DECIMAL'].includes(type.toUpperCase()))) fail('Too many type arguments'); take(')'); if (dialect === 'postgresql' && ['VARCHAR','CHAR','CHARACTER','CHARACTER VARYING','NUMERIC','DECIMAL','FLOAT'].includes(type.toUpperCase()) && Number(args[0]) === 0) fail('Type precision must be positive'); type += `(${args.join(',')})` }
    const col = { name: colName, type, nullable: null as boolean | null }; table.columns.push(col)
    let primary = false; let unique = false; let ref = false; let hasDefault = false
    while (!is(',') && !is(')') && pos < tokens.length) {
      if (is('CHECK')) unsupported('CHECK constraints')
      if (is('AUTOINCREMENT')) unsupported('AUTOINCREMENT')
      if (maybe('CONSTRAINT')) { name(); if (!['NOT','NULL','PRIMARY','UNIQUE','REFERENCES','DEFAULT'].some(is)) fail('Expected column constraint') }
      if (maybe('NOT')) { take('NULL'); if (col.nullable !== null) fail('Duplicate nullability'); col.nullable = false }
      else if (maybe('NULL')) { if (col.nullable !== null) fail('Duplicate nullability'); col.nullable = true }
      else if (maybe('PRIMARY')) { take('KEY'); if (primary) fail('Duplicate primary key'); primary = true; table.keys.push({ columns: [colName], primary: true }) }
      else if (maybe('UNIQUE')) { if (unique) fail('Duplicate unique constraint'); unique = true; table.keys.push({ columns: [colName], primary: false }) }
      else if (is('REFERENCES')) { if (ref) fail('Duplicate reference'); ref = true; foreign(table, [colName], `${table.path.join('.')}.${colName}`) }
      else if (maybe('DEFAULT')) {
        if (hasDefault) fail('Duplicate default'); hasDefault = true
        const signed = is('+') || is('-'); if (signed) pos++
        const t = tokens[pos]; if (!t || !(t.kind === 'string' || (t.kind === 'word' && (/^\d+$/u.test(t.value) || ['NULL','TRUE','FALSE'].includes(t.value.toUpperCase()))))) fail('Unsupported default expression')
        if (signed && !/^\d+$/u.test(t!.value)) fail('Invalid signed default')
        pos++; warn(`${table.path.join('.')}.${colName}`, 'DEFAULT')
      } else fail('Unsupported column constraint')
    }
  }
  while (pos < tokens.length) {
    if (is('PRAGMA')) unsupported('PRAGMA statements')
    const statementLine = tokens[pos]?.line
    if (maybe('CREATE')) {
      if (is('VIEW')) unsupported('CREATE VIEW')
      take('TABLE'); const table: Table = { path: path(), columns: [], keys: [], refs: [] }; tables.push(table)
      if (tables.length > 40) fail('Table limit exceeded')
      take('(')
      let sawConstraint = false
      do { if (is('CONSTRAINT') || is('PRIMARY') || is('UNIQUE') || is('FOREIGN')) { sawConstraint = true; constraint(table) } else { if (dialect === 'sqlite' && sawConstraint) fail('SQLite columns must precede table constraints'); column(table) } } while (maybe(','))
      take(')')
    } else if (maybe('ALTER')) {
      if (dialect !== 'postgresql') dialectError('SQLite ALTER TABLE is not supported; ALTER TABLE is supported only for PostgreSQL', statementLine)
      take('TABLE'); const p = path(); const table = tables.find(t => pathKey(t.path) === pathKey(p)); if (!table) fail('ALTER TABLE target must already be declared')
      take('ADD'); constraint(table!)
    } else fail('Unsupported SQL statement')
    if (pos < tokens.length) take(';')
  }
  if (!tables.length) fail('No tables found')
  const tableMap = new Map<string, Table>()
  for (const table of tables) {
    const id = pathKey(table.path); if (tableMap.has(id)) fail('Duplicate table'); tableMap.set(id, table)
    if (dialect === 'sqlite' && fold(table.path[1]).startsWith('sqlite_')) fail('SQLite table names beginning sqlite_ are reserved')
    if (dialect === 'sqlite' && fold(table.path[0]) !== 'main') fail('Only the SQLite main schema is supported')
    const cols = new Set<string>(); for (const c of table.columns) { const id = fold(c.name); if (cols.has(id)) fail('Duplicate column'); cols.add(id) }
    let primary = 0
    for (const key of table.keys) {
      key.columns = key.columns.map(n => table.columns.find(c => fold(c.name) === fold(n))?.name ?? fail('Unknown key column'))
      if (new Set(key.columns.map(fold)).size !== key.columns.length) fail('Duplicate key column')
      if (key.primary && ++primary > 1) fail('Multiple primary keys')
      if (key.primary) for (const n of key.columns) {
        const c = table.columns.find(v => v.name === n)!
        const sqliteRowid = dialect === 'sqlite' && key.columns.length === 1 && c.type.toUpperCase() === 'INTEGER'
        if (dialect === 'postgresql' || sqliteRowid) { if (c.nullable === true) fail('Primary key conflicts with NULL'); c.nullable = false }
        if (dialect === 'sqlite' && !sqliteRowid && c.nullable === null) c.nullable = true
        if (sqliteRowid) warn(`${table.path.join('.')}.${n}`, 'SQLite rowid behavior')
      }
    }
  }
  const dbPath = (p: string[]) => (dialect === 'sqlite' ? ['main', p[1]] : p).map(renderName).join('.')
  const endpoint = (p: string[], cols: string[]) => `${dbPath(p)}.(${cols.map(renderName).join(', ')})`
  const lines: string[] = []
  for (const table of tables) {
    lines.push(`Table ${dbPath(table.path)} {`)
    for (const c of table.columns) lines.push(`  ${renderName(c.name)} ${renderName(c.type)}${c.nullable === null ? '' : c.nullable ? ' [null]' : ' [not null]'}`)
    if (table.keys.length) { lines.push('  indexes {'); for (const k of table.keys) lines.push(`    (${k.columns.map(renderName).join(', ')}) [${k.primary ? 'pk' : 'unique'}]`); lines.push('  }') }
    lines.push('}')
  }
  for (const table of tables) for (const ref of table.refs) {
    const target = tableMap.get(pathKey(ref.target)); if (!target) fail('Unresolved referenced table')
    ref.columns = ref.columns.map(n => table.columns.find(c => fold(c.name) === fold(n))?.name ?? fail('Unknown foreign key column'))
    ref.targetColumns = ref.targetColumns.map(n => target!.columns.find(c => fold(c.name) === fold(n))?.name ?? fail('Unknown referenced column'))
    if (ref.columns.length !== ref.targetColumns.length || new Set(ref.columns).size !== ref.columns.length || new Set(ref.targetColumns).size !== ref.targetColumns.length) fail('Invalid foreign key tuple')
    if (!target!.keys.some(k => equalTuple(k.columns, ref.targetColumns))) fail('Referenced columns must be an ordered declared key')
    const uniqueChild = table.keys.some(k => k.columns.every(c => ref.columns.includes(c)))
    if (dialect === 'sqlite' && uniqueChild) warnings.push(`${table.path.join('.')}: relationship is shown as many-to-one because SQLite affinity can make unique child values compare equal to the same parent`)
    const matchingTypes = ref.columns.every((column, i) => table.columns.find(c => c.name === column)!.type.toUpperCase() === target!.columns.find(c => c.name === ref.targetColumns[i])!.type.toUpperCase())
    if (dialect === 'postgresql' && uniqueChild && !matchingTypes) warnings.push(`${table.path.join('.')}: relationship is shown as many-to-one because foreign key types differ`)
    const one = dialect === 'postgresql' && uniqueChild && matchingTypes
    lines.push(one ? `Ref: ${endpoint(target!.path, ref.targetColumns)} - ${endpoint(table.path, ref.columns)}` : `Ref: ${endpoint(table.path, ref.columns)} > ${endpoint(target!.path, ref.targetColumns)}`)
  }
  const dbml = lines.join('\n') + '\n'; validateDot(dbmlToDot(dbml))
  return { dbml, warnings }
}
