import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Duração máxima da saída; se o `transitionend` não vier (aba em segundo plano), fecha mesmo assim. */
const EXIT_FALLBACK_MS = 400

/**
 * Bottom sheet no mobile e dialog central no desktop (≥1024px), usando o <dialog>
 * nativo (foco preso, Esc fecha, acessível) — sem dependência extra.
 *
 * Entrada e saída animadas: ao fechar, o sheet desce (mobile) ou some (desktop) e só
 * depois o <dialog> fecha. Como quem usa o Sheet costuma desmontar o conteúdo junto
 * (`{open && <Form />}`), o último título e conteúdo abertos ficam congelados durante
 * a saída — senão desceria um sheet vazio.
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

  // Último quadro aberto, mostrado enquanto o sheet desce (padrão "estado do render anterior").
  const [previous, setPrevious] = useState({ open, title, children })
  const [frozen, setFrozen] = useState<{ title: string; children: ReactNode } | null>(null)
  if (previous.open !== open || previous.title !== title || previous.children !== children) {
    if (previous.open && !open) setFrozen({ title: previous.title, children: previous.children })
    if (open && frozen) setFrozen(null)
    setPrevious({ open, title, children })
  }

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      // Reabriu no meio da saída: só cancela a descida.
      delete dialog.dataset.closing
      if (!dialog.open) {
        dialog.showModal()
        // O showModal foca o primeiro botão (o X); o campo principal pede foco com data-autofocus.
        dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
      }
      return
    }
    if (!dialog.open) return

    const finish = () => {
      if (dialog.dataset.closing === undefined) return
      delete dialog.dataset.closing
      dialog.close()
      setFrozen(null)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.dataset.closing = ''
      finish()
      return
    }
    dialog.dataset.closing = ''
    const onEnd = (event: TransitionEvent) => {
      if (event.target === dialog) finish()
    }
    dialog.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(finish, EXIT_FALLBACK_MS)
    return () => {
      dialog.removeEventListener('transitionend', onEnd)
      window.clearTimeout(timer)
    }
  }, [open])

  const shownTitle = open ? title : (frozen?.title ?? title)
  const shownChildren = open ? children : (frozen?.children ?? children)

  return (
    <dialog
      ref={ref}
      aria-label={shownTitle}
      // Esc: em vez do fechamento seco do navegador, fecha pelo mesmo caminho animado.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // Fechou por fora (ex.: <form method="dialog">) sem passar pelo `open`: avisa quem usa.
      onClose={() => {
        if (open) onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none flex-col overflow-hidden open:flex translate-y-0 rounded-t-sheet bg-surface text-text opacity-100 open:transition-all open:transition-discrete open:duration-300 open:ease-ios backdrop:bg-black/40 open:backdrop:transition-opacity open:backdrop:duration-300 starting:open:translate-y-full starting:open:backdrop:opacity-0 data-closing:pointer-events-none data-closing:translate-y-full data-closing:duration-250 data-closing:ease-in data-closing:backdrop:opacity-0 data-closing:backdrop:duration-250 lg:m-auto lg:max-h-[88dvh] lg:max-w-md lg:rounded-card lg:starting:open:translate-y-4 lg:starting:open:opacity-0 lg:data-closing:translate-y-4 lg:data-closing:opacity-0"
    >
      {/* Cabeçalho fixo; só o conteúdo rola (a barra fina fica longe dos cantos arredondados). */}
      <div
        className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-text-3 lg:hidden"
        aria-hidden
      />
      <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-1 lg:pt-5">
        <h2 className="text-headline font-semibold">{shownTitle}</h2>
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
        <div className="px-5 pt-2 pb-6">{shownChildren}</div>
      </div>
    </dialog>
  )
}
