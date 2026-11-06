import { useEffect, useState } from 'react'
import type { AppConfig } from './preferences'

// CSS handles Auto appearance directly; non-CSS editor/diagram themes need the same live signal.
export function useResolvedDark(theme: AppConfig['theme']) {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const changed = () => setSystemDark(query.matches)
    changed(); query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  return theme === 'dark' || theme === 'system' && systemDark
}
