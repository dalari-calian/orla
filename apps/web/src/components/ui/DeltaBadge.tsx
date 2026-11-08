import { formatBRL } from '@orla/core/money'
import { cn } from '@/lib/cn'

/**
 * ▲ R$ 50 / ▼ R$ 20 contra o período anterior. `goodWhen` diz se subir é bom (entradas,
 * sobra) ou ruim (gastos) — a cor segue isso, não a direção.
 */
export function DeltaBadge({
  deltaCents,
  goodWhen,
  className,
}: {
  deltaCents: number
  goodWhen: 'up' | 'down'
  className?: string
}) {
  if (deltaCents === 0) {
    return <span className={cn('text-caption text-text-2', className)}>= igual</span>
  }
  const up = deltaCents > 0
  const good = up === (goodWhen === 'up')
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-caption font-semibold tabular',
        good ? 'text-positive' : 'text-negative',
        className,
      )}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'subiu' : 'caiu'}</span>
      {formatBRL(Math.abs(deltaCents))}
    </span>
  )
}
