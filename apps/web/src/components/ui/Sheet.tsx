import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Bottom sheet no mobile e dialog central no desktop (≥1024px), usando o <dialog>
 * nativo (foco preso, Esc fecha, acessível) — sem dependência extra.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="pb-safe m-0 mt-auto w-full max-w-none translate-y-0 rounded-t-sheet bg-surface text-text opacity-100 transition-all transition-discrete duration-300 ease-ios backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-300 starting:open:translate-y-full starting:open:backdrop:opacity-0 lg:m-auto lg:max-w-md lg:rounded-card lg:starting:open:translate-y-4 lg:starting:open:opacity-0"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-text-3 lg:hidden" aria-hidden />
      <div className="flex items-center justify-between px-5 pt-3 lg:pt-5">
        <h2 className="text-headline font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="-mr-2 flex size-11 items-center justify-center rounded-full text-text-2 hover:bg-surface-2"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="px-5 pt-2 pb-6">{children}</div>
    </dialog>
  )
}
