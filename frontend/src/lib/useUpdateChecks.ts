import { useCallback, useEffect, useRef, useState } from 'react'

const updateInterval = 24 * 60 * 60 * 1000

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
  const announced = useRef(new Set<string>())
  const [notice, setNotice] = useState<AvailableUpdate | null>(null)

  const check = useCallback(() => {
    if (inFlight.current) return inFlight.current
    const request = Promise.resolve().then(discover).finally(() => { inFlight.current = null })
    inFlight.current = request
    return request
  }, [discover])

  const markSeen = useCallback((update: AvailableUpdate) => {
    announced.current.add(update.version)
    setNotice(current => current?.version === update.version ? null : current)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setNotice(null)
      return
    }
    let stopped = false
    const refresh = () => {
      void check().then(update => {
        if (stopped) return
        if (update.kind === 'current') setNotice(null)
        if (update.kind !== 'available') return
        const seen = announced.current.has(update.version)
        announced.current.add(update.version)
        setNotice(current => !seen || current?.version === update.version ? update : null)
      }).catch(() => {
        // Background discovery leaves editing uninterrupted when the service is unavailable.
      })
    }
    refresh()
    const timer = window.setInterval(refresh, updateInterval)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [enabled, check])

  return { check, notice, markSeen, dismissNotice: () => setNotice(null) }
}
