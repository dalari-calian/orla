import { addMonths, parseCompetenceMonth } from '@orla/core'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { FieldShell } from './Field'
import { attachedCorners, attachedPanelClass, useAnchoredPopover } from './popover'

const NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

function label(month: string): string {
  const { year, month: m } = parseCompetenceMonth(month)
  return `${NAMES[m - 1] ?? ''} ${year}`
}

function toMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * Grade de meses (Jan…Dez) com troca de ano — o calendário de mês do app, usado no
 * campo de mês e no `MonthSwitcher` (o `type="month"` nativo é feio e não existe no Firefox).
 */
export function MonthGrid({
  value,
  initialYear,
  onPick,
}: {
  value: string | null
  initialYear: number
  onPick: (month: string) => void
}) {
  const [year, setYear] = useState(initialYear)
  const selected = value ? parseCompetenceMonth(value) : null
  const today = new Date()
  const arrow =
    'press flex size-9 items-center justify-center rounded-full text-accent hover:bg-accent/10'
  return (
    <div className="p-1">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          className={arrow}
          onClick={() => setYear(year - 1)}
          aria-label="Ano anterior"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span key={year} className="animate-fade-in text-headline font-semibold tabular">
          {year}
        </span>
        <button
          type="button"
          className={arrow}
          onClick={() => setYear(year + 1)}
          aria-label="Próximo ano"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {NAMES.map((name, index) => {
          const isSelected = selected?.year === year && selected.month === index + 1
          const isToday = today.getFullYear() === year && today.getMonth() === index
          return (
            <button
              key={name}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${name} de ${year}`}
              onClick={() => onPick(toMonth(year, index + 1))}
              className={cn(
                'press min-h-11 rounded-[10px] text-subhead font-medium',
                isSelected
                  ? 'bg-accent text-white'
                  : isToday
                    ? 'text-accent hover:bg-text/[0.06]'
                    : 'text-text hover:bg-text/[0.06]',
              )}
            >
              {name.slice(0, 3)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Campo de mês: ◀ Novembro 2026 ▶, e tocar no nome abre a grade de meses colada no campo.
 * Com `automatic`, o campo pode ficar "no automático" (vazio) mostrando o mês calculado.
 */
export function MonthField({
  label: fieldLabel,
  value,
  onChange,
  hint,
  error,
  automatic,
  clearable = false,
  placeholder = 'Escolher mês',
  className,
}: {
  label: string
  /** `YYYY-MM`, ou '' quando automático/não informado. */
  value: string
  onChange: (month: string) => void
  hint?: ReactNode
  error?: string | undefined
  /** Valor vazio = automático: mostra este mês com o selo "Automático" e um botão para voltar a ele. */
  automatic?: { month: string; note?: string } | undefined
  /** Mostra um X para deixar o campo vazio (ex.: "termina em" opcional). */
  clearable?: boolean
  placeholder?: string
  className?: string | undefined
}) {
  const id = useId()
  const { panelId, anchorRef, panelRef, open, placement, hide } = useAnchoredPopover({
    maxHeight: 280,
    contentHeight: 260,
  })
  const shownMonth = value || automatic?.month || ''
  const isAuto = !value && Boolean(automatic)
  const [gridKey, setGridKey] = useState(0)

  const arrow =
    'press flex size-10 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent/10 disabled:opacity-40'

  return (
    <FieldShell label={fieldLabel} hint={hint} error={error} htmlFor={id} className={className}>
      <div
        ref={anchorRef}
        className={cn(
          'flex min-h-12 items-center gap-1 rounded-field bg-surface-2 px-1 transition-[border-radius] duration-200',
          error && 'ring-2 ring-negative/70',
          attachedCorners(open, placement),
        )}
      >
        <button
          type="button"
          className={arrow}
          aria-label="Mês anterior"
          disabled={!shownMonth}
          onClick={() => onChange(addMonths(shownMonth, -1))}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          id={id}
          type="button"
          popoverTarget={panelId}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setGridKey((key) => key + 1)}
          className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] px-2 text-body font-medium"
        >
          {shownMonth ? (
            <span key={shownMonth} className="animate-fade-in truncate">
              {label(shownMonth)}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-text-3">
              <CalendarDays className="size-4" aria-hidden />
              {placeholder}
            </span>
          )}
        </button>
        {value && (automatic || clearable) ? (
          <button
            type="button"
            className={arrow}
            aria-label={automatic ? 'Voltar para o automático' : 'Limpar'}
            onClick={() => onChange('')}
          >
            <X className="size-4.5" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className={arrow}
          aria-label="Próximo mês"
          disabled={!shownMonth}
          onClick={() => onChange(addMonths(shownMonth, 1))}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      {automatic && (
        <p className="flex items-start gap-1.5 px-1 text-footnote text-text-2">
          <span
            className={cn(
              'mt-px shrink-0 rounded-full px-1.5 text-caption font-semibold',
              isAuto ? 'bg-accent/12 text-accent' : 'bg-text/[0.08] text-text-2',
            )}
          >
            {isAuto ? 'Automático' : 'Manual'}
          </span>
          <span>
            {isAuto ? automatic.note : 'Escolhido por você. O X volta para o automático.'}
          </span>
        </p>
      )}

      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label={`Escolher ${fieldLabel.toLocaleLowerCase('pt-BR')}`}
        className={attachedPanelClass}
      >
        <MonthGrid
          key={gridKey}
          value={shownMonth || null}
          initialYear={
            shownMonth ? parseCompetenceMonth(shownMonth).year : new Date().getFullYear()
          }
          onPick={(month) => {
            onChange(month)
            hide()
          }}
        />
      </div>
    </FieldShell>
  )
}
