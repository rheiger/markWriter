import { useEffect, useState } from 'react'
import { Modal } from './Modal'

// The checker returns a bounded release-discovery decision, not install authorization.
// Its result does not authenticate an update artifact.
export type UpdateCheckResult =
  | { kind: 'current'; version: string }
  | { kind: 'available'; currentVersion: string; version: string }
  | { kind: 'networkUnavailable' }
  | { kind: 'unsupported'; reason: string }

type State = { kind: 'checking' } | UpdateCheckResult | { kind: 'error' }

export function UpdateDialog({ check, onClose }: {
  check: () => Promise<UpdateCheckResult>
  onClose: () => void
}) {
  const [state, setState] = useState<State>({ kind: 'checking' })
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'checking' })
    check().then(result => {
      if (!cancelled) setState(result)
    }).catch(() => {
      if (!cancelled) setState({ kind: 'error' })
    })
    return () => { cancelled = true }
  }, [check])
  return <Modal title="Check for Updates" onClose={onClose}>
    <div role="status" aria-live="polite">
      {state.kind === 'checking' && <p>Checking for updates…</p>}
      {state.kind === 'current' && <p>Version {state.version} is up to date.</p>}
      {state.kind === 'available' && <p>Version {state.version} is available (installed: {state.currentVersion}). Installation is not yet available.</p>}
      {state.kind === 'networkUnavailable' && <p>Could not reach the release service. Check your connection and try again.</p>}
      {state.kind === 'unsupported' && <p>Updates are unavailable: {state.reason}</p>}
      {state.kind === 'error' && <p>Could not check for updates. Try again later.</p>}
    </div>
    <button type="button" onClick={onClose}>Close</button>
  </Modal>
}
