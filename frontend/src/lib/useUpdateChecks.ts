import { useCallback, useEffect, useRef, useState } from 'react'

import { useAppStore } from '../store/useAppStore'

export const updateInterval = 24 * 60 * 60 * 1000

export type AvailableUpdate = {
  kind: 'available'
  currentVersion: string
  version: string
  releasePageUrl: string
  installer:
    | { kind: 'available'; url: string }
    | { kind: 'unavailable'; reason: 'unsupportedPlatform' | 'missingInstaller' }
}

export type UpdateCheckResult =
  | AvailableUpdate
  | { kind: 'current'; version: string }
  | { kind: 'networkUnavailable' }
  | { kind: 'unsupported'; reason: string }

export function useUpdateChecks(enabled: boolean, discover: () => Promise<UpdateCheckResult>) {
  const inFlight = useRef<Promise<UpdateCheckResult> | null>(null)
  const announced = useRef(new Map<string, number>())
  const [notice, setNotice] = useState<AvailableUpdate | null>(null)

  const check = useCallback(() => {
    if (inFlight.current) return inFlight.current
    const request = Promise.resolve().then(discover).finally(() => { inFlight.current = null })
    inFlight.current = request
    return request
  }, [discover])

  const markSeen = useCallback((update: AvailableUpdate) => {
    announced.current.set(update.version, Date.now())
    setNotice(current => current?.version === update.version ? null : current)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setNotice(null)
      return
    }
    let stopped = false
    let timer: ReturnType<typeof window.setTimeout>
    let nextRegularCheck = Date.now() + updateInterval
    const schedule = () => {
      window.clearTimeout(timer)
      const now = Date.now()
      let next = nextRegularCheck
      for (const choice of Object.values(useAppStore.getState().updateChoices)) {
        if (choice.kind === 'remind' && choice.until > now) next = Math.min(next, choice.until)
      }
      timer = window.setTimeout(refresh, Math.max(0, next - now))
    }
    function refresh() {
      const now = Date.now()
      if (now >= nextRegularCheck) nextRegularCheck = now + updateInterval
      schedule()
      void check().then(update => {
        if (stopped) return
        if (update.kind === 'current') setNotice(null)
        if (update.kind !== 'available') return
        const choice = useAppStore.getState().updateChoices[update.version]
        const now = Date.now()
        if (choice?.kind === 'skip' || (choice?.kind === 'remind' && choice.until > now)) {
          setNotice(null)
          return
        }
        const seenAt = announced.current.get(update.version)
        const seen = seenAt !== undefined && (choice?.kind !== 'remind' || seenAt >= choice.until)
        if (!seen) announced.current.set(update.version, now)
        setNotice(current => !seen || current?.version === update.version ? update : null)
      }).catch(() => {
        // Background discovery leaves editing uninterrupted when the service is unavailable.
      })
    }
    const stopWatching = useAppStore.subscribe((state, prior) => {
      if (state.updateChoices !== prior.updateChoices) schedule()
    })
    refresh()
    return () => {
      stopped = true
      stopWatching()
      window.clearTimeout(timer)
    }
  }, [enabled, check])

  return { check, notice, markSeen, dismissNotice: () => setNotice(null) }
}
