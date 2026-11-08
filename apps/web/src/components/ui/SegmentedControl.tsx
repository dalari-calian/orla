import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Option<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

/**
 * Controle segmentado estilo iOS (grupo de rádios acessível). O fundo branco do item
 * escolhido desliza até o novo item (doc 09 › Movimento).
 */
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
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative isolate flex rounded-field bg-surface-2 p-0.5"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 -z-10 rounded-[10px] bg-surface shadow-card transition-transform duration-300 ease-ios"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
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
              'press flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-[10px] px-2 text-subhead font-medium transition-colors duration-200 ease-ios',
              selected ? 'text-text' : 'text-text-2 hover:text-text',
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
