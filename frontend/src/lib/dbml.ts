// Strict single-fence DBML subset. No imports, expressions, aliases or resources.
// Grammar reference: https://dbml.dbdiagram.io/docs/
export const DBML_LIMITS = { inputBytes: 32768, tables: 40, columns: 400, refs: 100, tokenLength: 256, parseMs: 1000, concurrent: 4 } as const
interface Token { value: string; line: number; quoted?: boolean }
interface Column { name: string; type: string; flags: string[] }
interface Table { schema: string; name: string; columns: Column[]; keys: { names: string[]; kind: string }[] }
interface Endpoint { schema: string; table: string; columns: string[] }
interface Ref { left: Endpoint; right: Endpoint; op: string; inline: boolean }
const identity = (schema: string, table: string) => JSON.stringify([schema, table])
const display = (text: string) => /^[\p{L}\p{N}_$]+$/u.test(text) ? text : JSON.stringify(text)
const label = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')
function tokenize(source: string): Token[] {
  if (!source.trim()) throw new Error('DBML source is empty')
  if (source.length > DBML_LIMITS.inputBytes || new TextEncoder().encode(source).length > DBML_LIMITS.inputBytes) throw new Error('DBML exceeds 32 KiB input limit')
  const tokens: Token[] = []; let line = 1
  for (let i = 0; i < source.length;) {
    const c = source[i]
    if (c === '\n') { tokens.push({ value: '\n', line: line++ }); i++; continue }
    if (/\s/.test(c)) { i++; continue }
    if (source.startsWith('//', i)) { while (i < source.length && source[i] !== '\n') i++; continue }
    if (c === '"') {
      let value = ''; const start = line; let closed = false; i++
      while (i < source.length) { const n = source[i++]; if (n === '"') { closed = true; break } if (n === '\n' || n === '\r') throw new Error(`Invalid quoted identifier at line ${line}`); if (n === '\\') { const next = source[i++]; if (next !== '"' && next !== '\\') throw new Error(`Unsupported escape at line ${line}`); value += next } else value += n }
      if (!closed || !value || value.length > DBML_LIMITS.tokenLength) throw new Error(`Invalid quoted identifier at line ${start}`)
      tokens.push({ value, line: start, quoted: true }); continue
    }
    if ('{}[](),.:<>-'.includes(c)) { const value = source.startsWith('<>', i) ? '<>' : c; tokens.push({value, line}); i += value.length; continue }
    const match = /^[\p{L}\p{N}_$]+/u.exec(source.slice(i))
    if (!match || match[0].length > DBML_LIMITS.tokenLength) throw new Error(`Unsupported DBML syntax at line ${line}`)
    tokens.push({value: match[0], line}); i += match[0].length
  }
  return tokens
}
export function dbmlToDot(source: string): string {
  const tokens = tokenize(source); let pos = 0; let count = 0
  const fail = (message: string): never => { throw new Error(`${message} at line ${tokens[pos]?.line ?? tokens.at(-1)?.line ?? 1}`) }
  const peek = () => tokens[pos]?.value
  const take = (value: string) => { if (peek() !== value) fail(`Expected ${value}`); pos++ }
  const skip = () => { while (peek() === '\n') pos++ }
  const name = () => { const t = tokens[pos]; if (!t || (!t.quoted && !/^[\p{L}\p{N}_$]+$/u.test(t.value))) return fail('Expected identifier'); pos++; return t.value }
  const names = () => { const a: string[] = []; if (peek() === '(') { take('('); a.push(name()); while (peek() === ',') { take(','); a.push(name()) } take(')') } else a.push(name()); return a }
  const tables: Table[] = []; const refs: Ref[] = []
  const endpoint = (): Endpoint => { const parts = [name()]; take('.'); if (peek() === '(') return {schema:'public', table:parts[0], columns:names()}; parts.push(name()); if (peek() === '.') { take('.'); return {schema:parts[0], table:parts[1], columns:names()} } return {schema:'public', table:parts[0], columns:[parts[1]]} }
  const op = () => { const v = peek(); if (v !== '<' && v !== '>' && v !== '-' && v !== '<>') return fail('Expected relationship operator'); pos++; return v }
  while (pos < tokens.length) {
    skip(); if (pos === tokens.length) break
    const keyword = name().toLowerCase()
    if (keyword === 'table') {
      let schema = 'public', tableName = name(); if (peek() === '.') { take('.'); schema = tableName; tableName = name() }
      if (tables.length >= DBML_LIMITS.tables) fail('DBML table limit exceeded')
      const table: Table = {schema, name:tableName, columns:[], keys:[]}; tables.push(table); take('{'); skip()
      while (peek() !== '}') {
        if (!peek()) fail('Unclosed table')
        const first = name()
        if (first.toLowerCase() === 'indexes' && peek() === '{') {
          take('{'); skip(); while (peek() !== '}') { const columns = names(); take('['); const setting = name().toLowerCase(); if (setting !== 'pk' && setting !== 'unique') fail('Unsupported index setting'); take(']'); table.keys.push({names:columns,kind:setting === 'pk' ? 'PK' : 'UK'}); if (peek() !== '\n' && peek() !== '}') fail('Unsupported index syntax'); skip() } take('}'); if (peek() !== '\n' && peek() !== '}') fail('Unsupported syntax after indexes'); skip(); continue
        }
        const type = name(); let fullType = type
        if (peek() === '(') { take('('); const args = [name()]; while (peek() === ',') {take(','); args.push(name())} take(')'); fullType += `(${args.join(',')})` }
        const column: Column = {name:first,type:fullType,flags:[]}; if (++count > DBML_LIMITS.columns) fail('DBML column limit exceeded'); table.columns.push(column)
        if (peek() === '[') { take('['); do { if (peek() === ',') take(','); const setting = name().toLowerCase(); if (setting === 'pk' || setting === 'unique' || setting === 'null') column.flags.push(setting === 'pk' ? 'PK' : setting === 'unique' ? 'UK' : 'NULL'); else if (setting === 'primary') { if (name().toLowerCase() !== 'key') fail('Expected key'); column.flags.push('PK') } else if (setting === 'not') { if (name().toLowerCase() !== 'null') fail('Expected null'); column.flags.push('NOT NULL') } else if (setting === 'ref') { take(':'); const relation = op(); refs.push({left:{schema,table:tableName,columns:[first]},right:endpoint(),op:relation,inline:true}) } else fail('Unsupported column setting'); } while (peek() === ','); take(']') }
        if (peek() !== '\n' && peek() !== '}') fail('Unsupported column syntax'); skip()
      } take('}'); if (peek() !== '\n' && pos < tokens.length) fail('Unsupported table syntax'); skip()
    } else if (keyword === 'ref') { take(':'); const left = endpoint(); const relation = op(); const right = endpoint(); refs.push({left,right,op:relation,inline:false}); if (peek() !== '\n' && pos < tokens.length) fail('Unsupported relationship syntax'); skip() }
    else fail('Unsupported DBML construct')
  }
  if (!tables.length) fail('DBML has no tables')
  if (refs.length > DBML_LIMITS.refs) fail('DBML relationship limit exceeded')
  const map = new Map<string, number>(); tables.forEach((t,i) => { const key = identity(t.schema,t.name); if (map.has(key)) fail('Duplicate table'); map.set(key,i); if (!t.columns.length) fail('Empty table'); const seen = new Set<string>(); for (const c of t.columns) { if (seen.has(c.name)) fail('Duplicate column'); seen.add(c.name); if (new Set(c.flags).size !== c.flags.length || (c.flags.includes('NULL') && c.flags.includes('NOT NULL'))) fail('Conflicting column settings') } for (const k of t.keys) if (new Set(k.names).size !== k.names.length || k.names.some(n => !seen.has(n))) fail('Unknown or duplicate key column') })
  const lookup = (e: Endpoint) => { const index = map.get(identity(e.schema,e.table)); if (index === undefined) return fail('Unknown table in relationship'); if (new Set(e.columns).size !== e.columns.length || e.columns.some(n => !tables[index].columns.some(c => c.name === n))) fail('Unknown or duplicate relationship column'); return index }
  const endpointText = (e: Endpoint) => `${e.schema === 'public' ? '' : display(e.schema) + '.'}${display(e.table)} (${e.columns.map(display).join(', ')})`
  const lines = ['digraph schema {', 'rankdir=LR;']
  tables.forEach((t,i) => { const lines1 = [`${t.schema === 'public' ? '' : display(t.schema) + '.'}${display(t.name)}`, ...t.columns.map(c => `${display(c.name)} : ${display(c.type)}${c.flags.length ? ' [' + c.flags.join(', ') + ']' : ''}`), ...t.keys.map(k => `${k.kind} (${k.names.map(display).join(', ')})`)]; lines.push(`t${i} [shape=box label="${lines1.map(label).join('\\n')}"];`) })
  refs.forEach(r => { const left = lookup(r.left), right = lookup(r.right); if (r.left.columns.length !== r.right.columns.length) fail('Relationship column counts differ'); const cardinality = r.op === '>' ? 'many to one' : r.op === '<' ? 'one to many' : r.op === '<>' ? 'many to many' : 'one to one'; const fk = r.op === '>' ? endpointText(r.left) : r.op === '<' ? endpointText(r.right) : r.op === '-' ? endpointText(r.inline ? r.left : r.right) : 'many-to-many'; lines.push(`t${left} -> t${right} [label="${label(`${endpointText(r.left)} ${r.op} ${endpointText(r.right)} | ${cardinality} | FK: ${fk}`)}"];`) })
  lines.push('}'); return lines.join('\n')
}
