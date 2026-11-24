import { useEffect, useState } from 'react'
import type { AvailableUpdate, UpdateCheckResult } from '../lib/useUpdateChecks'
import { Modal } from './Modal'

type State = { kind: 'checking' } | UpdateCheckResult | { kind: 'error' }

export function UpdateDialog({ check, initialUpdate, onAvailable, openLink, onClose }: {
  check: () => Promise<UpdateCheckResult>
  initialUpdate?: AvailableUpdate
  onAvailable?: (update: AvailableUpdate) => void
  openLink: (version: string, url: string) => Promise<void>
  onClose: () => void
}) {
  const [state, setState] = useState<State>(initialUpdate ?? { kind: 'checking' })
  const [opening, setOpening] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)

  useEffect(() => {
    if (initialUpdate) return
    let cancelled = false
    setState({ kind: 'checking' })
    void check().then(result => {
      if (cancelled) return
      setState(result)
      if (result.kind === 'available') onAvailable?.(result)
    }).catch(() => {
      if (!cancelled) setState({ kind: 'error' })
    })
    return () => { cancelled = true }
  }, [check, initialUpdate, onAvailable])

  const handOff = async (update: AvailableUpdate) => {
    setOpening(true)
    setOpenFailed(false)
    try {
      await openLink(update.version, update.installer.kind === 'available' ? update.installer.url : update.releasePageUrl)
    } catch {
      setOpenFailed(true)
    } finally {
      setOpening(false)
    }
  }

  return <Modal title="Check for Updates" onClose={onClose}>
    <div role="status" aria-live="polite">
      {state.kind === 'checking' && <p>Checking for updates…</p>}
      {state.kind === 'current' && <p>Version {state.version} is up to date.</p>}
      {state.kind === 'available' && <>
        <p>Version {state.version} is available (installed: {state.currentVersion}).</p>
        {state.installer.kind === 'unavailable' && <p>{state.installer.reason === 'unsupportedPlatform'
          ? 'Installer matching is unavailable for this platform.'
          : 'This release has no matching installer for this platform.'}</p>}
      </>}
      {state.kind === 'networkUnavailable' && <p>Could not reach the release service. Check your connection and try again.</p>}
      {state.kind === 'unsupported' && <p>Updates are unavailable: {state.reason}</p>}
      {state.kind === 'error' && <p>Could not check for updates. Try again later.</p>}
    </div>
    {openFailed && <p role="alert">Could not open the browser. Try again.</p>}
    <div className="dialog-actions">
      <button type="button" onClick={onClose}>Close</button>
      {state.kind === 'available' && <button type="button" disabled={opening} onClick={() => void handOff(state)}>
        {state.installer.kind === 'available' ? 'Open installer download' : 'Open release page'}
      </button>}
    </div>
  </Modal>
}
