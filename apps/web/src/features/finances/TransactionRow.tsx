import { formatBRL } from '@orla/core/money'
import type { Category, Transaction } from '@orla/contracts'
import { Check, Circle, Receipt } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { categoryIcons, IconBadge } from '@/components/ui/CategoryIcon'
import { cn } from '@/lib/cn'
import { paymentMethodLabels, shortDate } from './labels'

/**
 * Linha de lançamento (docs/10): ícone da categoria, descrição, estabelecimento · forma ·
 * "3/12", valor e o botão de pagar/receber à direita. Tocar na linha abre a edição.
 */
export function TransactionRow({
  transaction,
  category,
  payeeName,
  extraSubtitle,
  onOpen,
  onToggleSettled,
  toggling,
}: {
  transaction: Transaction
  category: Category | undefined
  payeeName: string | undefined
  /** Ex.: "gasto R$ 120 de R$ 200" no planejamento. */
  extraSubtitle?: ReactNode
  onOpen: () => void
  onToggleSettled: () => void
  toggling: boolean
}) {
  const [toggled, setToggled] = useState(false)
  const settled = transaction.status === 'settled'
  const isIncome = transaction.type === 'income'
  const Icon = category ? categoryIcons[category.icon] : Receipt
  const parts = [
    shortDate(transaction.date),
    payeeName,
    transaction.paymentMethod ? paymentMethodLabels[transaction.paymentMethod] : undefined,
    transaction.installmentNumber
      ? `${transaction.installmentNumber}/${transaction.installmentsCount ?? '?'}`
      : undefined,
  ].filter(Boolean)
  const settleLabel = settled
    ? `Marcar "${transaction.description}" como previsto`
    : isIncome
      ? `Marcar "${transaction.description}" como recebido`
      : `Marcar "${transaction.description}" como pago`

  return (
    <li className="relative flex items-center transition-colors hover:bg-surface-2 has-[:active]:bg-surface-2 [&+li]:before:absolute [&+li]:before:inset-x-4 [&+li]:before:top-0 [&+li]:before:h-px [&+li]:before:scale-y-50 [&+li]:before:bg-separator">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-15 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
      >
        <IconBadge icon={Icon} color={category?.color ?? 'var(--text-2)'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">{transaction.description}</span>
          <span className="block truncate text-footnote text-text-2">
            {parts.join(' · ')}
            {extraSubtitle && <> · {extraSubtitle}</>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              'block text-body font-medium tabular',
              isIncome ? 'text-positive' : 'text-text',
              !settled && 'opacity-70',
            )}
          >
            {isIncome ? '+' : '−'}
            {formatBRL(transaction.amountCents).replace('-', '')}
          </span>
          <span className="block text-caption text-text-2">
            {settled ? (isIncome ? 'recebido' : 'pago') : 'previsto'}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          setToggled(true)
          onToggleSettled()
        }}
        disabled={toggling}
        aria-label={settleLabel}
        aria-pressed={settled}
        className="press flex size-12 shrink-0 items-center justify-center text-text-3 hover:text-accent disabled:opacity-50"
      >
        {settled ? (
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full bg-positive text-white',
              toggled && 'animate-pop',
            )}
          >
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <Circle className="size-6" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </li>
  )
}
