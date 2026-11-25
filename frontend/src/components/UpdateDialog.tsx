import { useEffect, useRef, useState } from 'react'
import type { AvailableUpdate, UpdateCheckResult } from '../lib/useUpdateChecks'
import type { UpdateChoiceAction } from '../lib/preferences'
import { Modal } from './Modal'

type State = { kind: 'checking' } | UpdateCheckResult | { kind: 'error' }

export function UpdateDialog({ check, initialUpdate, onAvailable, onChoice, openLink, onClose, fallbackFocus }: {
  check: () => Promise<UpdateCheckResult>
  initialUpdate?: AvailableUpdate
  onAvailable?: (update: AvailableUpdate) => void
  onChoice?: (update: AvailableUpdate, action: UpdateChoiceAction) => Promise<void>
  openLink: (version: string, url: string) => Promise<void>
  onClose: () => void
  fallbackFocus?: () => void
}) {
  const [state, setState] = useState<State>(initialUpdate ?? { kind: 'checking' })
  const [pending, setPending] = useState<'download' | 'choice' | null>(null)
  const operation = useRef<typeof pending>(null)
  const [actionError, setActionError] = useState('')

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

  const run = async (kind: NonNullable<typeof pending>, action: () => Promise<void>) => {
    if (operation.current) return
    operation.current = kind
    setPending(kind)
    setActionError('')
    try {
      await action()
      if (kind === 'choice') onClose()
    } catch {
      setActionError(kind === 'choice'
        ? 'Could not save your update choice. Try again.'
        : 'Could not open the browser. Try again.')
    } finally {
      operation.current = null
      setPending(null)
    }
  }
  const handOff = (update: AvailableUpdate) => run('download', () =>
    openLink(update.version, update.installer.kind === 'available' ? update.installer.url : update.releasePageUrl))
  const close = () => { if (operation.current !== 'choice') onClose() }

  return <Modal title="Check for Updates" onClose={close} fallbackFocus={fallbackFocus}>
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
    {actionError && <p role="alert">{actionError}</p>}
    <div className="dialog-actions update-dialog-actions">
      <button type="button" disabled={pending === 'choice'} onClick={close}>Close</button>
      {state.kind === 'available' && onChoice && <>
        <button type="button" disabled={pending !== null} onClick={() => void run('choice', () => onChoice(state, 'skip'))}>
          Skip This Release
        </button>
        <button type="button" disabled={pending !== null} onClick={() => void run('choice', () => onChoice(state, 'remind'))}>
          Remind Me Later
        </button>
      </>}
    </div>
    {state.kind === 'available' && <div className="dialog-actions">
      <button type="button" disabled={pending !== null} onClick={() => void handOff(state)}>
        {state.installer.kind === 'available' ? 'Open installer download' : 'Open release page'}
      </button>
    </div>}
  </Modal>
}
