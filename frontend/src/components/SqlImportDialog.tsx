import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'

type Dialect = 'postgresql' | 'sqlite'
type ImportResult = { dbml: string; warnings: string[] }

export function SqlImportDialog({ onSelectFile, onInsert, onClose }: {
  onSelectFile: (dialect: Dialect, signal: AbortSignal) => Promise<ImportResult | null>
  onInsert: (dbml: string, signal: AbortSignal) => Promise<void> | void
  onClose: () => void
}) {
  const [dialect, setDialect] = useState<Dialect | ''>('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const closed = useRef(false)
  const submitting = useRef(false)

  useEffect(() => {
    closed.current = false
    return () => { closed.current = true; request.current?.abort() }
  }, [])
  const cancelRequest = () => { request.current?.abort(); request.current = null }
  const close = () => {
    closed.current = true
    cancelRequest()
    onClose()
  }
  const chooseFile = async () => {
    if (!dialect || request.current || submitting.current || closed.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setResult(null); setError('')
    try {
      const next = await onSelectFile(dialect, controller.signal)
      if (!closed.current && request.current === controller && !controller.signal.aborted) setResult(next)
    } catch (cause) {
      if (!closed.current && request.current === controller && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not import the SQL file.')
      }
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false) }
    }
  }
  const insert = async () => {
    if (!result || !result.dbml.trim() || submitting.current || closed.current) return
    submitting.current = true; setInserting(true); setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      await onInsert(result.dbml, controller.signal)
      if (!closed.current && !controller.signal.aborted) { closed.current = true; onClose() }
    } catch (cause) {
      if (!closed.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not append the DBML.')
    } finally {
      submitting.current = false
      if (request.current === controller) request.current = null
      if (!closed.current) setInserting(false)
    }
  }

  return <Modal title="Import SQL as DBML" onClose={close}>
    <p>Select the dialect that produced the schema, then choose a local UTF-8 .sql file up to 64 KiB. A matching dialect does not guarantee that every SQL feature is supported.</p>
    <p>Review the generated keys and relationships before appending. Diagrams can omit defaults and foreign-key actions. Unsupported SQL stops the import.</p>
    <label>SQL dialect{' '}
      <select value={dialect} disabled={inserting} onChange={event => {
        cancelRequest(); setLoading(false); setResult(null); setError('')
        setDialect(event.target.value as Dialect | '')
      }}>
        <option value="">Select a dialect</option>
        <option value="postgresql">PostgreSQL</option>
        <option value="sqlite">SQLite</option>
      </select>
    </label>{' '}
    <button type="button" disabled={!dialect || loading || inserting} onClick={chooseFile}>Choose SQL file…</button>
    {loading && <p role="status">Reading and converting SQL…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p>Conversion may be incomplete. Review and edit the DBML, especially keys and relationships, before appending it to the end of the document.</p>
      {result.warnings.length > 0 && <><p>Conversion warnings</p><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></>}
      <label>DBML preview<br />
        <textarea rows={12} cols={60} style={{ maxWidth: '100%', color: 'var(--text-primary)', background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} value={result.dbml} disabled={inserting} onChange={event => setResult({ ...result, dbml: event.target.value })} />
      </label>
    </>}
    <div className="dialog-actions">
      <button type="button" onClick={close}>Cancel</button>
      {result && <button type="button" disabled={inserting || !result.dbml.trim()} onClick={insert}>Append DBML</button>}
    </div>
  </Modal>
}
