import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { defaultConfig, type AppConfig } from '../lib/preferences'
import { applyPreferences } from '../lib/persistence'
import { Modal } from './Modal'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ ...useAppStore.getState().config }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const field = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => setDraft(current => ({ ...current, [key]: value }))
  const size = (key: 'fontSize' | 'renderedFontSize', label: string) => <label>{label}<select value={draft[key]} onChange={e => field(key, Number(e.target.value))}>
    {Array.from({ length: 23 }, (_, i) => i + 10).map(n => <option key={n} value={n}>{n}px</option>)}
  </select></label>
  return <Modal title="Settings" onClose={() => { if (!busy) onClose() }}>
    <div className="settings-fields">
      <label>Theme<select value={draft.theme} onChange={e => field('theme', e.target.value as AppConfig['theme'])}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
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
    </div>
    <p className="settings-note">Recovery copies stay on this device. Original files are written only when you save.</p>
    {error && <p role="alert">{error}</p>}
    <div className="dialog-actions">
      <button disabled={busy} onClick={() => setDraft({ ...defaultConfig })}>Reset to Defaults</button>
      <button disabled={busy} onClick={onClose}>Cancel</button>
      <button disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await applyPreferences(draft); onClose() } catch (error) { setError(String(error)) } finally { setBusy(false) }
      }}>Apply</button>
    </div>
  </Modal>
}
