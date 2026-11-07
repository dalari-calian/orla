import { CATEGORY_ICONS, PALETTE, type CategoryIcon } from '@orla/core'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { categoryIcons } from './CategoryIcon'

/** Escolha de cor na paleta do design system (um rádio por cor). */
export function ColorPicker({
  label,
  value,
  onChange,
  colors = PALETTE,
}: {
  label: string
  value: string
  onChange: (color: string) => void
  colors?: readonly string[]
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="px-1 text-footnote font-medium text-text-2">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const selected = color.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Cor ${color}`}
              onClick={() => onChange(color)}
              className={cn(
                'flex size-11 items-center justify-center rounded-full transition-transform active:scale-95',
                selected && 'ring-2 ring-text ring-offset-2 ring-offset-surface',
              )}
              style={{ backgroundColor: color }}
            >
              {selected && <Check className="size-5 text-white" strokeWidth={3} aria-hidden />}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Grade de ícones do catálogo de categorias. */
export function IconPicker({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: CategoryIcon
  onChange: (icon: CategoryIcon) => void
  color: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="px-1 text-footnote font-medium text-text-2">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-2 sm:grid-cols-9">
        {CATEGORY_ICONS.map((name) => {
          const Icon = categoryIcons[name]
          const selected = name === value
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              onClick={() => onChange(name)}
              className={cn(
                'flex aspect-square min-h-11 items-center justify-center rounded-field transition-colors',
                selected ? 'text-white' : 'bg-surface-2 text-text-2 hover:text-text',
              )}
              style={selected ? { backgroundColor: color } : undefined}
            >
              <Icon className="size-5" aria-hidden />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
