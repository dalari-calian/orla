import { addDaysIso } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { UpcomingItem } from '@orla/contracts'
import { CalendarCheck, ChevronRight, CreditCard, Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { categoryIcons, IconBadge } from '@/components/ui/CategoryIcon'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { categories, creditCards } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUpcoming } from './api'
import { useEntrySheet } from './EntrySheet'
import { dayHeading, shortDate } from './labels'

/** "Hoje", "Amanhã", "Atrasado · 03/11" ou "qua., 2 de dezembro". */
function whenLabel(date: string, today: string): { text: string; late: boolean } {
  if (date < today) return { text: `Atrasado · ${shortDate(date)}`, late: true }
  if (date === today) return { text: 'Hoje', late: false }
  if (date === addDaysIso(today, 1)) return { text: 'Amanhã', late: false }
  return { text: dayHeading(date), late: false }
}

const rowClass =
  'flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2'

/**
 * Próximos vencimentos (doc 04 §8.8): contas previstas e faturas dos próximos 7 dias,
 * com os atrasados no topo. Tocar abre a edição (conta) ou a fatura.
 */
export function UpcomingList({ limit, days = 7 }: { limit?: number; days?: number }) {
  const query = useUpcoming(days)
  const cardList = creditCards.useList()
  const categoryList = categories.useList()
  const { openEdit } = useEntrySheet()

  if (query.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    )
  }
  const { today } = query.data
  const items = limit ? query.data.items.slice(0, limit) : query.data.items
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Nada vencendo"
        description={`Nenhuma conta ou fatura para pagar nos próximos ${days} dias.`}
        className="py-6"
      />
    )
  }

  const cardName = (id: string) => cardList.data?.find((card) => card.id === id)?.name ?? 'cartão'
  return (
    <ul className="animate-fade-in">
      {items.map((item: UpcomingItem) => {
        const when = whenLabel(item.date, today)
        const subtitle = (
          <span
            className={cn(
              'block truncate text-footnote',
              when.late ? 'text-negative' : 'text-text-2',
            )}
          >
            {when.text}
          </span>
        )
        const amount = (
          <span className="shrink-0 text-body font-medium tabular">
            {formatBRL(item.amountCents)}
          </span>
        )
        if (item.kind === 'statement') {
          return (
            <li key={`s-${item.creditCardId}-${item.competenceMonth}`}>
              <Link
                to={`/financas/cartoes/${item.creditCardId}/fatura?mes=${item.competenceMonth}`}
                className={rowClass}
              >
                <IconBadge icon={CreditCard} color="var(--accent)" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">
                    Fatura {cardName(item.creditCardId)}
                  </span>
                  {subtitle}
                </span>
                {amount}
                <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
              </Link>
            </li>
          )
        }
        const category = categoryList.data?.find((c) => c.id === item.transaction.categoryId)
        return (
          <li key={item.transaction.id}>
            <button type="button" onClick={() => openEdit(item.transaction)} className={rowClass}>
              <IconBadge
                icon={category ? categoryIcons[category.icon] : Receipt}
                color={category?.color ?? 'var(--text-2)'}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{item.transaction.description}</span>
                {subtitle}
              </span>
              {amount}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
