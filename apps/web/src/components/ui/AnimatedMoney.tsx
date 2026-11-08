import { formatBRL } from '@orla/core/money'
import { useCountUp } from '@/lib/motion'

/** Valor em reais com _count-up_ ao aparecer e ao mudar (só para números herói — doc 09). */
export function AnimatedMoney({ cents, className }: { cents: number; className?: string }) {
  const value = useCountUp(cents)
  return (
    <span className={className}>
      <span className="sr-only">{formatBRL(cents)}</span>
      <span aria-hidden>{formatBRL(value)}</span>
    </span>
  )
}
