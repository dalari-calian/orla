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
    if (open && !dialog.open) {
      dialog.showModal()
      // O showModal foca o primeiro botão (o X); o campo principal pede foco com data-autofocus.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // A animação só existe na abertura: ao fechar, quem usa o Sheet já desmontou o
      // conteúdo, e uma saída animada mostraria por um instante só o título e o X.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none flex-col overflow-hidden open:flex translate-y-0 rounded-t-sheet bg-surface text-text opacity-100 open:transition-all open:transition-discrete open:duration-300 open:ease-ios backdrop:bg-black/40 open:backdrop:transition-opacity open:backdrop:duration-300 starting:open:translate-y-full starting:open:backdrop:opacity-0 lg:m-auto lg:max-h-[88dvh] lg:max-w-md lg:rounded-card lg:starting:open:translate-y-4 lg:starting:open:opacity-0"
    >
      {/* Cabeçalho fixo; só o conteúdo rola (a barra fina fica longe dos cantos arredondados). */}
      <div
        className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-text-3 lg:hidden"
        aria-hidden
      />
      <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-1 lg:pt-5">
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
      <div className="pb-safe min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="px-5 pt-2 pb-6">{children}</div>
      </div>
    </dialog>
  )
}
