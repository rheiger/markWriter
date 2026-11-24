import { useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useAppStore } from '../store/useAppStore'
import { defaultConfig, type AppConfig } from '../lib/preferences'
import { applyPreferences } from '../lib/persistence'
import { encodeSettingsProfile, parseSettingsProfile } from '../lib/settingsProfile'
import { Modal } from './Modal'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ ...useAppStore.getState().config }))
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const operation = useRef<symbol | null>(null)
  useEffect(() => () => { operation.current = null }, [])
  const close = () => { if (!operation.current) onClose() }

  const run = async (action: 'import' | 'export' | 'apply') => {
    if (operation.current) return
    const token = Symbol()
    operation.current = token
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (action === 'import') {
        const profile = await invoke<unknown>('import_settings_profile')
        if (operation.current === token && profile !== null) {
          setDraft(parseSettingsProfile(profile))
          setStatus('Settings loaded. Review them and select Apply to commit.')
        }
      } else if (action === 'export') {
        const exported = await invoke<boolean>('export_settings_profile', { profile: encodeSettingsProfile(draft) })
        if (operation.current === token && exported) setStatus('Settings exported.')
      } else {
        await applyPreferences(draft)
        if (operation.current === token) onClose()
      }
    } catch (cause) {
      if (operation.current === token) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (operation.current === token) {
        operation.current = null
        setBusy(false)
      }
    }
  }

  const field = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => setDraft(current => ({ ...current, [key]: value }))
  const size = (key: 'fontSize' | 'renderedFontSize', label: string) => <label>{label}<select value={draft[key]} onChange={e => field(key, Number(e.target.value))}>
    {Array.from({ length: 23 }, (_, i) => i + 10).map(n => <option key={n} value={n}>{n}px</option>)}
  </select></label>
  return <Modal title="Settings" onClose={close}>
    <fieldset className="settings-fields" disabled={busy}>
      <label>Theme<select value={draft.theme} onChange={e => field('theme', e.target.value as AppConfig['theme'])}>
        <option value="system">Auto (System)</option><option value="light">Light</option><option value="dark">Dark</option>
      </select></label>
      <label>Source font<input value={draft.fontFamily} maxLength={200} onChange={e => field('fontFamily', e.target.value)} /></label>
      {size('fontSize', 'Source text size')}
      <label>Rendered font<input value={draft.renderedFontFamily} maxLength={200} onChange={e => field('renderedFontFamily', e.target.value)} /></label>
      {size('renderedFontSize', 'Rendered text size')}
      <label>Rendered line spacing<input type="number" min="1" max="2.5" step="0.1" value={draft.renderedLineHeight} onChange={e => field('renderedLineHeight', Number(e.target.value))} /></label>
      <label>Source tab width<select value={draft.tabWidth} onChange={e => field('tabWidth', Number(e.target.value))}>
        {[2, 4, 8].map(n => <option key={n} value={n}>{n} spaces</option>)}
      </select></label>
      <label><input type="checkbox" checked={draft.wordWrap} onChange={e => field('wordWrap', e.target.checked)} />Wrap source lines</label>
      <label><input type="checkbox" checked={draft.syncPreview} onChange={e => field('syncPreview', e.target.checked)} />Synchronize Markdown and Preview scrolling, caret and selection</label>
      <label><input type="checkbox" checked={draft.wrapContinuation} onChange={e => field('wrapContinuation', e.target.checked)} />Show soft-wrap continuation markers</label>
      <label><input type="checkbox" checked={draft.collapseSource} onChange={e => field('collapseSource', e.target.checked)} />Collapse diagram and embedded-image source by default</label>
      <label><input type="checkbox" checked={draft.restoreSession} onChange={e => field('restoreSession', e.target.checked)} />Restore tabs on startup</label>
      {isTauri() && <label><input type="checkbox" checked={draft.automaticUpdateChecks}
        onChange={e => field('automaticUpdateChecks', e.target.checked)} />Check for updates automatically</label>}
    </fieldset>
    <p className="settings-note">Recovery copies stay on this device. Original files are written only when you save.</p>
    {isTauri() && <div className="settings-profile-actions">
      <button disabled={busy} onClick={() => void run('import')}>Import Settings…</button>
      <button disabled={busy} onClick={() => void run('export')}>Export Settings…</button>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="dialog-actions">
      <button disabled={busy} onClick={() => setDraft({ ...defaultConfig })}>Reset to Defaults</button>
      <button disabled={busy} onClick={close}>Cancel</button>
      <button disabled={busy} onClick={() => void run('apply')}>Apply</button>
    </div>
  </Modal>
}
