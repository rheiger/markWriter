import { useEffect, useRef, type ReactNode } from 'react'
import './Workspace.css'

export function Modal({ title, onClose, children }: { title: string, onClose: () => void, children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => previous?.focus()
  }, [])
  return <dialog ref={ref} className="workspace-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex="0"]') ?? [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <h2>{title}</h2>{children}
  </dialog>
}
