import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ChipOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon | undefined
  /** Cor do ícone/realce (ex.: cor da categoria). */
  color?: string | undefined
}

/**
 * Grupo de chips de escolha única (grupo de rádios acessível). No celular rola na
 * horizontal; no desktop quebra linha.
 */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  allowClear = false,
  error,
  trailing,
}: {
  label: string
  options: readonly ChipOption<T>[]
  value: T | null
  onChange: (value: T | null) => void
  /** Tocar no chip escolhido desmarca. */
  allowClear?: boolean
  error?: string | undefined
  trailing?: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-footnote font-medium text-text-2">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
      >
        {options.map((option) => {
          const selected = option.value === value
          const Icon = option.icon
          const color = option.color ?? 'var(--accent)'
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected && allowClear ? null : option.value)}
              className={cn(
                'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium whitespace-nowrap press',
                selected ? 'text-white' : 'bg-surface-2 text-text hover:bg-separator',
              )}
              style={selected ? { backgroundColor: color } : undefined}
            >
              {Icon && (
                <Icon
                  className="size-4"
                  aria-hidden
                  style={selected ? undefined : { color }}
                  strokeWidth={2.25}
                />
              )}
              {option.label}
            </button>
          )
        })}
        {trailing}
      </div>
      {error && (
        <p role="alert" className="px-1 text-footnote text-negative">
          {error}
        </p>
      )}
    </div>
  )
}
