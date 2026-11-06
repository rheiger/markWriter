import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { version as buildVersion } from '../../package.json'
import appIcon from '../../../assets/markwriter-icon.svg'
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
      <div className="about-heading">
        <img className="about-icon" src={appIcon} alt="" aria-hidden="true" />
        <div><h2 id="about-title">About MarkWriter</h2><p className="about-version">Version {version}</p></div>
      </div>
      <p className="about-intro">For words, code and the ideas in between.</p>
      <p>Write in Markdown or shape your document visually, with live preview, tables, syntax highlighting and offline Mermaid and DOT diagrams.</p>
      <p>From a quick note to a detailed specification, your Markdown files stay at the heart of the work. Tabs, search, flexible themes and self-contained HTML export help you keep ideas moving.</p>
      <p>This program was completely built using vibe coding under the direction of 'Richie'.</p>
      <p className="about-credits">Built with Rust, Tauri, React, CodeMirror and Tiptap, with gratitude to the open-source contributors who make MarkWriter possible.</p>
      <p className="about-license">MIT License</p>
      <div className="about-actions"><button ref={closeButton} type="button" onClick={() => dialog.current?.close()}>Close</button></div>
    </dialog>
  )
}
