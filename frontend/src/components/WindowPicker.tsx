import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listEditorWindows, type EditorWindow } from '../lib/windowWorkspace'
import { Modal } from './Modal'

export function WindowPicker({ move = false, onChoose, onClose }: {
  move?: boolean
  onChoose: (label?: string) => void
  onClose: () => void
}) {
  const currentLabel = getCurrentWindow().label
  const [windows, setWindows] = useState<EditorWindow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false, request = 0
    let stop: (() => void) | undefined
    const refresh = async () => {
      const sequence = ++request
      try {
        const items = await listEditorWindows()
        if (!disposed && sequence === request) { setWindows(items); setError('') }
      } catch (failure) {
        if (!disposed && sequence === request) setError(`Could not list windows: ${String(failure)}`)
      }
    }
    void refresh()
    void listen('editor-windows-changed', () => void refresh()).then(unlisten => {
      if (disposed) unlisten()
      else { stop = unlisten; void refresh() }
    }).catch(() => { /* Initial list is still available. */ })
    return () => { disposed = true; stop?.() }
  }, [])

  const choices = windows?.filter(window => !move || window.label !== currentLabel)
  return <Modal title={move ? 'Move Tab to Window' : 'Windows'} onClose={onClose}>
    {error && <p role="alert">{error}</p>}
    {!windows && !error && <p role="status">Loading windows…</p>}
    <ul className="window-list">
      {choices?.map(window => <li key={window.label}>
        <button aria-current={window.label === currentLabel ? 'true' : undefined}
          onClick={() => onChoose(window.label)}>{window.title}</button>
      </li>)}
      {move && <li><button onClick={() => onChoose()}>New Window</button></li>}
    </ul>
    <div className="dialog-actions"><button onClick={onClose}>{move ? 'Cancel' : 'Close'}</button></div>
  </Modal>
}
