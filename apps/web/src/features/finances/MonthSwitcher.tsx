import { addMonths } from '@orla/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { MonthGrid } from '@/components/ui/MonthField'
import { floatingPanelClass, useAnchoredPopover } from '@/components/ui/popover'
import { monthLabel } from './labels'

/**
 * ◀ Novembro 2026 ▶ (docs/09). Tocar no nome abre a grade de meses;
 * no celular, deslizar para os lados troca o mês.
 */
export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string
  onChange: (month: string) => void
}) {
  const { panelId, anchorRef, panelRef, open, hide } = useAnchoredPopover({
    maxHeight: 300,
    contentHeight: 270,
    width: 340,
    gap: 8,
  })
  const touchStart = useRef<number | null>(null)

  const arrowClass =
    'press flex size-11 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent/10 active:bg-accent/15'

  return (
    <div
      ref={anchorRef}
      className="flex items-center justify-between gap-2 rounded-card bg-surface px-1 py-1 shadow-card"
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        const end = event.changedTouches[0]?.clientX
        touchStart.current = null
        if (start === null || end === undefined) return
        const delta = end - start
        if (Math.abs(delta) > 60) onChange(addMonths(month, delta < 0 ? 1 : -1))
      }}
    >
      <button
        type="button"
        className={arrowClass}
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-6" aria-hidden />
      </button>

      <button
        type="button"
        popoverTarget={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${monthLabel(month)}. Escolher outro mês`}
        className="press min-h-11 min-w-0 flex-1 rounded-field text-center hover:bg-text/[0.04]"
      >
        <span
          key={month}
          className="inline-block animate-fade-in text-headline font-semibold"
          aria-live="polite"
        >
          {monthLabel(month)}
        </span>
      </button>

      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Escolher mês"
        className={floatingPanelClass}
      >
        <MonthGrid
          key={month}
          value={month}
          initialYear={Number(month.slice(0, 4))}
          onPick={(next) => {
            onChange(next)
            hide()
          }}
        />
      </div>

      <button
        type="button"
        className={arrowClass}
        onClick={() => onChange(addMonths(month, 1))}
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-6" aria-hidden />
      </button>
    </div>
  )
}
