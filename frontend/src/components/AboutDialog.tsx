import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { version as buildVersion } from '../../package.json'
import './AboutDialog.css'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [version, setVersion] = useState(buildVersion)
  useEffect(() => {
    // Native modal semantics provide focus containment, Escape and an inert backdrop.
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
    dialog.current?.showModal()
    let cancelled = false
    if (isTauri()) {
      void getVersion().then(value => { if (!cancelled) setVersion(value) }).catch(() => {
        // Bundled package metadata remains available if the native lookup fails.
      })
    }
    return () => { cancelled = true }
  }, [])
  return (
    <dialog ref={dialog} className="about-dialog" aria-labelledby="about-title" onClose={onClose}
      onKeyDown={event => {
        // Close is the dialog's only interactive control.
        if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus() }
      }}>
      <h2 id="about-title">About MarkWriter</h2>
      <p className="about-version">Version {version}</p>
      <p>A Markdown editor with live preview, WYSIWYG editing, Mermaid diagrams and tables.</p>
      <p className="about-license">MIT License</p>
      <div className="about-actions"><button ref={closeButton} type="button" onClick={() => dialog.current?.close()}>Close</button></div>
    </dialog>
  )
}
