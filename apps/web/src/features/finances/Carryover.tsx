import { monthName } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { MonthCarryover, Transaction } from '@orla/contracts'
import { ArrowRightLeft, Info } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useCarryoverMutations } from './api'

/** "R$ 50,00 sobrando" / "faltaram R$ 30,00". */
function balancePhrase(cents: number): string {
  return cents >= 0 ? `${formatBRL(cents)} sobrando` : `faltaram ${formatBRL(-cents)}`
}

/** Avisos que explicam por que o valor ainda pode mudar. */
function Caveats({ carryover }: { carryover: MonthCarryover }) {
  const previous = monthName(carryover.previousMonth)
  const notes: string[] = []
  if (carryover.previousMonthOpen) notes.push(`${previous} ainda não terminou`)
  if (carryover.previousPendingCount > 0) {
    notes.push(
      carryover.previousPendingCount === 1
        ? 'tem 1 lançamento ainda previsto'
        : `tem ${carryover.previousPendingCount} lançamentos ainda previstos`,
    )
  }
  if (notes.length === 0) return null
  const text = notes.join(' e ')
  return (
    <p className="flex items-start gap-1.5 text-footnote text-text-2">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {text.charAt(0).toLocaleUpperCase('pt-BR')}
        {text.slice(1)} — o valor pode mudar. Dá para atualizar depois.
      </span>
    </p>
  )
}

/**
 * RF-55: cartão no topo do mês — "Novembro fechou com R$ 50 sobrando. Levar para dezembro?"
 * (`offer`) ou "O saldo de novembro mudou" (`stale`). Some nos outros estados.
 */
export function CarryoverBanner({
  month,
  carryover,
}: {
  month: string
  carryover: MonthCarryover
}) {
  const { apply, dismiss } = useCarryoverMutations(month)
  const toast = useToast()
  // "Agora não" no aviso de mudança vale só para esta visita (o valor levado continua).
  const [snoozed, setSnoozed] = useState<string | null>(null)
  const staleKey = `${month}|${carryover.previousBalanceCents}`

  if (carryover.state === 'offer') {
    const previous = monthName(carryover.previousMonth)
    const current = monthName(month)
    const positive = carryover.previousBalanceCents > 0
    return (
      <Card className="animate-enter space-y-3" role="region" aria-label="Saldo do mês anterior">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              positive ? 'bg-positive/14 text-positive' : 'bg-negative/14 text-negative',
            )}
            aria-hidden
          >
            <ArrowRightLeft className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-headline font-semibold">
              {carryover.previousMonthOpen
                ? `Até agora, ${previous} está com`
                : `${capitalize(previous)} fechou com`}{' '}
              <span className={cn('tabular', positive ? 'text-positive' : 'text-negative')}>
                {balancePhrase(carryover.previousBalanceCents)}
              </span>
              .
            </p>
            <p className="text-subhead text-text-2">
              {positive
                ? `Levar esse valor para ${current}? Ele entra como saldo, não como renda.`
                : `Descontar esse valor de ${current}? Ele entra como saldo, não como gasto.`}
            </p>
          </div>
        </div>
        <Caveats carryover={carryover} />
        <div className="flex flex-wrap gap-2">
          <Button
            loading={apply.isPending}
            disabled={dismiss.isPending}
            onClick={() =>
              apply.mutate(undefined, {
                onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
              })
            }
          >
            {positive ? `Levar para ${current}` : `Descontar de ${current}`}
          </Button>
          <Button
            variant="plain"
            loading={dismiss.isPending}
            disabled={apply.isPending}
            onClick={() =>
              dismiss.mutate(undefined, {
                onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
              })
            }
          >
            Ignorar
          </Button>
        </div>
        <p className="text-caption text-text-3">
          Prefere que seja automático (ou nunca)?{' '}
          <Link to="/config" className="text-accent">
            Configurações
          </Link>
        </p>
      </Card>
    )
  }

  if (carryover.state === 'stale' && snoozed !== staleKey) {
    const previous = monthName(carryover.previousMonth)
    return (
      <Card className="animate-enter space-y-3" role="region" aria-label="Saldo do mês anterior">
        <p className="text-headline font-semibold">O saldo de {previous} mudou</p>
        <p className="text-subhead text-text-2">
          Você levou <span className="tabular">{formatBRL(carryover.appliedCents ?? 0)}</span>, mas{' '}
          {previous} agora está com{' '}
          <span className="tabular">{formatBRL(carryover.previousBalanceCents)}</span>.
        </p>
        <Caveats carryover={carryover} />
        <div className="flex flex-wrap gap-2">
          <Button
            loading={apply.isPending}
            onClick={() =>
              apply.mutate(undefined, {
                onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
              })
            }
          >
            Atualizar para {formatBRL(carryover.previousBalanceCents)}
          </Button>
          <Button variant="plain" onClick={() => setSnoozed(staleKey)}>
            Agora não
          </Button>
        </div>
      </Card>
    )
  }

  return null
}

function capitalize(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase('pt-BR')}${text.slice(1)}`
}

/** Tocar no lançamento de saldo anterior: de onde veio, atualizar ou remover. */
export function CarryoverSheet({
  month,
  transaction,
  carryover,
  onClose,
}: {
  month: string
  transaction: Transaction | null
  carryover: MonthCarryover
  onClose: () => void
}) {
  const { apply, dismiss } = useCarryoverMutations(month)
  const toast = useToast()
  const previous = monthName(carryover.previousMonth)
  const changed =
    carryover.appliedCents !== null && carryover.appliedCents !== carryover.previousBalanceCents
  const onError = (error: unknown) => toast({ message: errorMessage(error), tone: 'error' })

  return (
    <Sheet open={transaction !== null} onClose={onClose} title="Saldo do mês anterior">
      {transaction && (
        <div className="space-y-4">
          <p className="text-body">
            <span className="font-semibold">{transaction.description}</span>:{' '}
            <span
              className={cn(
                'tabular font-semibold',
                transaction.type === 'income' ? 'text-positive' : 'text-negative',
              )}
            >
              {transaction.type === 'income' ? '+' : '−'}
              {formatBRL(transaction.amountCents)}
            </span>
          </p>
          <p className="text-subhead text-text-2">
            É o que ficou na conta em {previous} (recebido − pago − investido). Entra na sobra e no
            saldo deste mês, mas não conta como renda nem gasto, nem na meta em %.
          </p>
          {changed && (
            <p className="text-subhead">
              {capitalize(previous)} agora está com{' '}
              <span className="tabular font-semibold">
                {formatBRL(carryover.previousBalanceCents)}
              </span>
              .
            </p>
          )}
          <div className="space-y-2">
            {changed && (
              <Button
                block
                loading={apply.isPending}
                disabled={dismiss.isPending}
                onClick={() => apply.mutate(undefined, { onSuccess: onClose, onError })}
              >
                Atualizar para {formatBRL(carryover.previousBalanceCents)}
              </Button>
            )}
            <Button
              block
              variant="destructive"
              loading={dismiss.isPending}
              disabled={apply.isPending}
              onClick={() => dismiss.mutate(undefined, { onSuccess: onClose, onError })}
            >
              Não levar este saldo
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
