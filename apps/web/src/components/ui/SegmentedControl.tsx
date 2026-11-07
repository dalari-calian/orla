import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Option<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

/** Controle segmentado estilo iOS (grupo de rádios acessível). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-0.5 rounded-field bg-surface-2 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 text-subhead font-medium transition-all duration-200 ease-ios',
              selected ? 'bg-surface text-text shadow-card' : 'text-text-2 hover:text-text',
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
