import { useEffect, useRef, type ReactNode } from 'react'
import './Workspace.css'

export function Modal({ title, onClose, fallbackFocus, children }: {
  title: string
  onClose: () => void
  fallbackFocus?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const focusIfTriggerGone = useRef(fallbackFocus)
  focusIfTriggerGone.current = fallbackFocus
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true })
      else if (document.activeElement === document.body) focusIfTriggerGone.current?.()
    }
  }, [])
  return <dialog ref={ref} className="workspace-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:enabled, input:enabled, select:enabled, textarea:enabled, [tabindex="0"]') ?? [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <h2>{title}</h2>{children}
  </dialog>
}
