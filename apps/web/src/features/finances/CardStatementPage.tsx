import { formatBRL } from '@orla/core/money'
import { CreditCard as CardIcon, ReceiptText } from 'lucide-react'
import { useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { accounts, categories, creditCards, payees } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useCardStatement, usePayStatement, useTransactionMutations } from './api'
import { useEntrySheet } from './EntrySheet'
import { shortDate, useMonthParam } from './labels'
import { MonthSwitcher } from './MonthSwitcher'
import { TransactionRow } from './TransactionRow'

const statusLabels = { open: 'Aberta', closed: 'Fechada', paid: 'Paga' } as const

/** /financas/cartoes/:id/fatura?mes= — fatura do cartão (RF-31/32, docs/10). */
export function CardStatementPage() {
  const { id = '' } = useParams()
  const [month, setMonth] = useMonthParam()
  const statement = useCardStatement(id, month)
  const pay = usePayStatement(id, month)
  const cardList = creditCards.useList()
  const accountList = accounts.useList()
  const categoryList = categories.useList()
  const payeeList = payees.useList()
  const { settle, unsettle } = useTransactionMutations()
  const { openEdit } = useEntrySheet()
  const toast = useToast()

  const card = cardList.data?.find((item) => item.id === id)
  const account = accountList.data?.find((item) => item.id === card?.accountId)
  const color = account?.color ?? 'var(--accent)'
  const back = { to: `/financas?mes=${month}`, label: 'Finanças' }
  const data = statement.data

  return (
    <>
      <PageHeader title={card ? `Fatura ${card.name}` : 'Fatura'} back={back} />

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <div className="space-y-5 lg:sticky lg:top-6">
          <MonthSwitcher month={month} onChange={setMonth} />

          {/* Cartão visual na cor da conta (docs/10). */}
          <div
            className="relative overflow-hidden rounded-card p-5 text-white shadow-card"
            style={{
              background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, black))`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-subhead font-medium opacity-90">{card?.name ?? 'Cartão'}</span>
              <CardIcon className="size-6 opacity-80" aria-hidden />
            </div>
            {data ? (
              <>
                <p className="mt-6 text-footnote opacity-80">Total da fatura</p>
                <p className="text-[34px] leading-tight font-semibold tracking-tight tabular">
                  <AnimatedMoney cents={data.totalCents} />
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-footnote">
                  <span>Fecha {shortDate(data.closingDate)}</span>
                  <span>Vence {shortDate(data.dueDate)}</span>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold">
                    {statusLabels[data.status]}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-6 h-20" />
            )}
          </div>

          {data && (
            <Card className="space-y-3">
              <div className="flex justify-between text-subhead">
                <span className="text-text-2">Já pago</span>
                <span className="font-medium tabular">{formatBRL(data.settledCents)}</span>
              </div>
              <div className="flex justify-between text-subhead">
                <span className="text-text-2">Próximas faturas (previsto)</span>
                <span className="font-medium tabular">{formatBRL(data.futureTotalCents)}</span>
              </div>
              {data.status !== 'paid' && data.transactions.length > 0 && (
                <Button
                  block
                  loading={pay.isPending}
                  onClick={() =>
                    pay.mutate(undefined, {
                      onSuccess: () => toast({ message: 'Fatura marcada como paga' }),
                      onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                    })
                  }
                >
                  Marcar fatura como paga
                </Button>
              )}
            </Card>
          )}
        </div>

        <div className="min-w-0">
          {statement.isPending ? (
            <Skeleton className="h-48 rounded-card" />
          ) : statement.isError ? (
            <Card>
              <ErrorState
                title="Não foi possível abrir a fatura"
                description={errorMessage(statement.error)}
                onRetry={() => void statement.refetch()}
              />
            </Card>
          ) : data && data.transactions.length === 0 ? (
            <Card className="p-0 md:p-0">
              <EmptyState
                icon={ReceiptText}
                title="Fatura vazia"
                description="Compras no crédito deste cartão aparecem aqui, na fatura em que caem pelo dia de fechamento."
              />
            </Card>
          ) : (
            <ul
              key={data?.month}
              className={cn(
                'animate-fade-in overflow-hidden rounded-card bg-surface shadow-card transition-opacity',
                statement.isFetching && 'opacity-80',
              )}
            >
              {data?.transactions.map((item) => (
                <TransactionRow
                  key={item.id}
                  transaction={item}
                  category={categoryList.data?.find((category) => category.id === item.categoryId)}
                  payeeName={payeeList.data?.find((payee) => payee.id === item.payeeId)?.name}
                  onOpen={() => openEdit(item)}
                  onToggleSettled={() =>
                    (item.status === 'settled'
                      ? unsettle.mutateAsync(item.id)
                      : settle.mutateAsync({ id: item.id })
                    ).catch((error: unknown) =>
                      toast({ message: errorMessage(error), tone: 'error' }),
                    )
                  }
                  toggling={
                    (settle.isPending && settle.variables.id === item.id) ||
                    (unsettle.isPending && unsettle.variables === item.id)
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
