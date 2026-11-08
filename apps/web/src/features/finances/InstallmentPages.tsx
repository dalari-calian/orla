import { todayIsoDate } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { InstallmentPlan, InstallmentSummary, Transaction } from '@orla/contracts'
import { CalendarRange, Check, Circle, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Card, CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/Progress'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { creditCards, payees } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  useInstallmentPlan,
  useTransactionMutations,
  useInstallmentPlanMutations,
  useInstallmentPlans,
  useInstallmentSummary,
  type PlanFilter,
} from './api'
import { useEntrySheet } from './EntrySheet'
import { InstallmentPlanForm } from './InstallmentPlanForm'
import { shortDate, shortMonthLabel } from './labels'

const backToFinances = { to: '/financas', label: 'Finanças' }

/** RF-45: "Para quitar tudo" + compromisso mensal em barras ("livre em ago/2027"). */
function SummaryHero({ summary }: { summary: InstallmentSummary }) {
  const max = Math.max(1, ...summary.monthly.map((item) => item.amountCents))
  const current = summary.monthly[0]?.amountCents ?? 0
  return (
    <Card>
      <p className="text-subhead text-text-2">Para quitar tudo</p>
      <p className="mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular">
        <AnimatedMoney cents={summary.payoffTotalCents} />
      </p>
      <p className="mt-1 text-footnote text-text-2">
        Compromisso este mês: <span className="font-medium text-text">{formatBRL(current)}</span>
        {summary.payoffTotalCents > 0 && <> · livre em {shortMonthLabel(summary.freeFromMonth)}</>}
      </p>
      <div
        className="mt-5 flex h-28 items-end gap-1"
        role="img"
        aria-label={`Parcelas previstas nos próximos 12 meses: ${summary.monthly
          .map((item) => `${shortMonthLabel(item.month)} ${formatBRL(item.amountCents)}`)
          .join(', ')}`}
      >
        {summary.monthly.map((item, index) => (
          <div
            key={item.month}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className="w-full origin-bottom animate-grow-y rounded-t-[4px] bg-accent/80"
              style={{
                animationDelay: `${index * 30}ms`,
                height: `${(item.amountCents / max) * 100}%`,
                minHeight: item.amountCents > 0 ? 3 : 0,
              }}
            />
            <span className="text-[10px] text-text-2">
              {shortMonthLabel(item.month).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PlanCard({
  plan,
  cardName,
  payeeName,
}: {
  plan: InstallmentPlan
  cardName?: string | undefined
  payeeName?: string | undefined
}) {
  const { indicators } = plan
  const statusLabel =
    plan.status === 'paid_off'
      ? 'Quitado'
      : plan.status === 'canceled'
        ? 'Cancelado'
        : indicators.phase === 'not_started'
          ? 'Ainda não começou'
          : indicators.currentNumber
            ? `${indicators.currentNumber}/${plan.installmentsCount}`
            : indicators.remainingCount === 0
              ? 'Finalizado'
              : `${indicators.paidCount}/${plan.installmentsCount} pagas`
  return (
    <Link
      to={`/financas/parcelamentos/${plan.id}`}
      className="press block rounded-card bg-surface p-4 shadow-card hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-headline font-semibold">{plan.description}</p>
          <p className="truncate text-footnote text-text-2">
            {[payeeName, cardName ?? (plan.paymentMethod === 'boleto' ? 'Boleto/carnê' : undefined)]
              .filter(Boolean)
              .join(' · ') || 'Parcelamento'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/12 px-2.5 py-1 text-footnote font-semibold text-accent tabular">
          {statusLabel}
        </span>
      </div>
      <ProgressBar value={indicators.progress} className="mt-3" />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-footnote text-text-2 tabular">
        <span>
          Pago {formatBRL(indicators.paidCents)} de {formatBRL(plan.totalCents)}
        </span>
        {indicators.remainingCents > 0 && (
          <span className="font-medium text-text">
            Falta {formatBRL(indicators.remainingCents)}
          </span>
        )}
      </div>
      <p className="mt-1 text-caption text-text-2">
        Termina em {shortMonthLabel(indicators.lastCompetenceMonth)}
      </p>
    </Link>
  )
}

/** /financas/parcelamentos */
export function InstallmentPlansPage() {
  const [filter, setFilter] = useState<PlanFilter>('active')
  const summary = useInstallmentSummary()
  const list = useInstallmentPlans(filter)
  const cardList = creditCards.useList()
  const payeeList = payees.useList()
  const { openNew } = useEntrySheet()
  const cardName = new Map((cardList.data ?? []).map((card) => [card.id, card.name]))
  const payeeName = new Map((payeeList.data ?? []).map((payee) => [payee.id, payee.name]))

  return (
    <>
      <PageHeader
        title="Parcelamentos"
        back={backToFinances}
        actions={
          <Button
            variant="plain"
            onClick={() => openNew('installment')}
            className="px-3"
            aria-label="Novo parcelamento"
          >
            <Plus className="size-5" aria-hidden />
            <span className="hidden sm:inline">Novo</span>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-6">
          {summary.data ? (
            <SummaryHero summary={summary.data} />
          ) : summary.isError ? (
            <Card>
              <ErrorState
                description={errorMessage(summary.error)}
                onRetry={() => void summary.refetch()}
              />
            </Card>
          ) : (
            <Skeleton className="h-64 rounded-card" />
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <SegmentedControl
            label="Filtrar parcelamentos"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'finished', label: 'Finalizados' },
            ]}
          />
          <SlideSwap index={filter === 'active' ? 0 : 1}>
            {list.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-32 rounded-card" />
                <Skeleton className="h-32 rounded-card" />
              </div>
            ) : list.isError ? (
              <Card>
                <ErrorState
                  description={errorMessage(list.error)}
                  onRetry={() => void list.refetch()}
                />
              </Card>
            ) : list.data.length === 0 ? (
              <Card className="p-0 md:p-0">
                <EmptyState
                  icon={CalendarRange}
                  title={
                    filter === 'active' ? 'Nenhum parcelamento ativo' : 'Nada finalizado ainda'
                  }
                  description={
                    filter === 'active'
                      ? 'Cadastre compras parceladas e veja quanto falta para quitar tudo.'
                      : undefined
                  }
                  action={
                    filter === 'active' && (
                      <Button onClick={() => openNew('installment')}>Novo parcelamento</Button>
                    )
                  }
                />
              </Card>
            ) : (
              <div className="grid animate-fade-in gap-3 xl:grid-cols-2">
                {list.data.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    cardName={plan.creditCardId ? cardName.get(plan.creditCardId) : undefined}
                    payeeName={plan.payeeId ? payeeName.get(plan.payeeId) : undefined}
                  />
                ))}
              </div>
            )}
          </SlideSwap>
        </div>
      </div>
    </>
  )
}

/**
 * Marca uma parcela como paga (ou volta para prevista) direto na lista do parcelamento:
 * útil para registrar parcelas que já foram pagas antes de cadastrar a compra.
 */
function InstallmentCheck({
  item,
  label,
  editable,
}: {
  item: Transaction
  label: string
  editable: boolean
}) {
  const { settle, unsettle } = useTransactionMutations()
  const toast = useToast()
  const [toggled, setToggled] = useState(false)
  const settled = item.status === 'settled'
  const busy = settle.isPending || unsettle.isPending
  const mark = (
    <span
      className={cn(
        'flex size-6 items-center justify-center rounded-full bg-positive text-white',
        toggled && 'animate-pop',
      )}
    >
      <Check className="size-4" strokeWidth={3} aria-hidden />
    </span>
  )
  const empty = <Circle className="size-6" strokeWidth={1.75} aria-hidden />

  if (!editable) {
    return (
      <span
        className="flex size-6 shrink-0 items-center justify-center text-text-3"
        aria-label={settled ? 'Paga' : 'Prevista'}
      >
        {settled ? mark : empty}
      </span>
    )
  }
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={settled}
      aria-label={
        settled ? `Marcar a parcela ${label} como prevista` : `Marcar a parcela ${label} como paga`
      }
      onClick={() => {
        setToggled(true)
        const done = settled ? unsettle.mutateAsync(item.id) : settle.mutateAsync({ id: item.id })
        done.catch((error: unknown) => toast({ message: errorMessage(error), tone: 'error' }))
      }}
      className="press -m-3 flex size-12 shrink-0 items-center justify-center text-text-3 hover:text-accent disabled:opacity-50"
    >
      {settled ? mark : empty}
    </button>
  )
}

type Action = 'edit' | 'payoff' | null

/** /financas/parcelamentos/:id — parcelas, editar, quitar antecipado, cancelar (RF-44..48). */
export function InstallmentPlanDetailPage() {
  const { id = '' } = useParams()
  const query = useInstallmentPlan(id)
  const mutations = useInstallmentPlanMutations()
  const cardList = creditCards.useList()
  const toast = useToast()
  const navigate = useNavigate()
  const [action, setAction] = useState<Action>(null)
  const [payoffAmount, setPayoffAmount] = useState<number | null>(null)
  const [payoffDate, setPayoffDate] = useState<string>(todayIsoDate())

  const back = { to: '/financas/parcelamentos', label: 'Parcelamentos' }

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Parcelamento" back={back} />
        <Skeleton className="h-48 rounded-card" />
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="Parcelamento" back={back} />
        <Card>
          <ErrorState
            title="Não foi possível abrir este parcelamento"
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      </>
    )
  }

  const { plan, installments } = query.data
  const { indicators } = plan
  const card = cardList.data?.find((item) => item.id === plan.creditCardId)
  const active = plan.status === 'active'
  const close = () => {
    setAction(null)
    mutations.update.reset()
    mutations.payoff.reset()
  }

  const onError = (error: unknown) => toast({ message: errorMessage(error), tone: 'error' })

  return (
    <>
      <PageHeader
        title={plan.description}
        back={back}
        subtitle={card ? `Cartão ${card.name}` : 'Boleto / carnê'}
      />

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <Card className="space-y-4 lg:sticky lg:top-6">
          <div>
            <p className="text-subhead text-text-2">Falta pagar</p>
            <p className="mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular">
              <AnimatedMoney cents={indicators.remainingCents} />
            </p>
          </div>
          <ProgressBar value={indicators.progress} />
          <dl className="grid grid-cols-2 gap-3 text-footnote">
            <div>
              <dt className="text-text-2">Total</dt>
              <dd className="text-headline font-semibold tabular">{formatBRL(plan.totalCents)}</dd>
            </div>
            <div>
              <dt className="text-text-2">Pago</dt>
              <dd className="text-headline font-semibold tabular">
                {formatBRL(indicators.paidCents)}
              </dd>
            </div>
            <div>
              <dt className="text-text-2">Parcelas restantes</dt>
              <dd className="text-headline font-semibold tabular">
                {indicators.remainingCount} de {plan.installmentsCount}
              </dd>
            </div>
            <div>
              <dt className="text-text-2">Termina em</dt>
              <dd className="text-headline font-semibold">
                {shortMonthLabel(indicators.lastCompetenceMonth)}
              </dd>
            </div>
          </dl>
          {plan.status === 'paid_off' && plan.payoffDiscountCents !== null && (
            <p className="rounded-field bg-positive/12 px-3 py-2 text-footnote text-text">
              Quitado em {shortDate(plan.paidOffAt ?? '')} ·{' '}
              {plan.payoffDiscountCents >= 0
                ? `desconto de ${formatBRL(plan.payoffDiscountCents)}`
                : `pagou ${formatBRL(-plan.payoffDiscountCents)} a mais`}
            </p>
          )}
          {plan.status === 'canceled' && (
            <p className="rounded-field bg-surface-2 px-3 py-2 text-footnote text-text-2">
              Cancelado: as parcelas que faltavam foram removidas.
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-separator pt-3">
            {active && (
              <>
                <Button variant="secondary" onClick={() => setAction('edit')}>
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPayoffAmount(indicators.remainingCents)
                    setAction('payoff')
                  }}
                >
                  Quitar antecipado
                </Button>
                <Button
                  variant="destructive"
                  loading={mutations.cancel.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Cancelar o parcelamento? As parcelas que faltam serão removidas.',
                      )
                    )
                      return
                    mutations.cancel.mutate(plan.id, {
                      onSuccess: () => toast({ message: 'Parcelamento cancelado' }),
                      onError,
                    })
                  }}
                >
                  Cancelar compra
                </Button>
              </>
            )}
            <Button
              variant="destructive"
              loading={mutations.remove.isPending}
              onClick={() =>
                mutations.remove.mutate(plan.id, {
                  onSuccess: () => {
                    void navigate('/financas/parcelamentos')
                    toast({
                      message: 'Parcelamento excluído',
                      action: {
                        label: 'Desfazer',
                        onClick: () => mutations.restore.mutate(plan.id, { onError }),
                      },
                    })
                  },
                  onError,
                })
              }
            >
              Excluir
            </Button>
          </div>
        </Card>

        <Card className="p-0 md:p-0">
          <CardHeader title="Parcelas" className="px-4 pt-4 md:px-5 md:pt-5" />
          <ul>
            {installments.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex min-h-14 items-center gap-3 px-4 transition-colors md:px-5 [&+li]:border-t [&+li]:border-separator',
                  active && item.installmentNumber !== null && 'hover:bg-surface-2',
                  item.competenceMonth === indicators.lastCompetenceMonth && 'pb-1',
                )}
              >
                <InstallmentCheck
                  item={item}
                  label={`${item.installmentNumber ?? ''}/${plan.installmentsCount}`}
                  // Só dá para marcar/desmarcar parcelas de um parcelamento ativo (a quitação é fixa).
                  editable={active && item.installmentNumber !== null}
                />
                <span className="w-14 shrink-0 text-subhead font-medium tabular">
                  {item.installmentNumber
                    ? `${item.installmentNumber}/${plan.installmentsCount}`
                    : 'Quitação'}
                </span>
                <span className="flex-1 text-subhead text-text-2">
                  {shortMonthLabel(item.competenceMonth)}
                </span>
                <span className="text-body font-medium tabular">{formatBRL(item.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Sheet open={action === 'edit'} onClose={close} title="Editar parcelamento">
        {action === 'edit' && (
          <InstallmentPlanForm
            initial={plan}
            submitting={mutations.update.isPending}
            error={mutations.update.error}
            onUpdate={async (values) => {
              await mutations.update.mutateAsync({ id: plan.id, ...values })
              toast({ message: 'Parcelamento atualizado' })
              close()
            }}
          />
        )}
      </Sheet>

      <Sheet open={action === 'payoff'} onClose={close} title="Quitar antecipado">
        <div className="space-y-4">
          <p className="text-subhead text-text-2">
            Falta {formatBRL(indicators.remainingCents)}. Informe quanto você pagou (com o desconto,
            se teve): as parcelas restantes saem e entra um pagamento único.
          </p>
          <MoneyInput label="Valor pago" value={payoffAmount} onChange={setPayoffAmount} large />
          {payoffAmount !== null &&
            payoffAmount > 0 &&
            payoffAmount < indicators.remainingCents && (
              <p className="px-1 text-footnote text-positive">
                Desconto de {formatBRL(indicators.remainingCents - payoffAmount)}
              </p>
            )}
          <TextField
            label="Data do pagamento"
            type="date"
            value={payoffDate}
            onChange={(event) => setPayoffDate(event.target.value)}
          />
          {mutations.payoff.error && (
            <p role="alert" className="text-footnote text-negative">
              {errorMessage(mutations.payoff.error)}
            </p>
          )}
          <Button
            block
            loading={mutations.payoff.isPending}
            disabled={!payoffAmount}
            onClick={() =>
              mutations.payoff.mutate(
                { id: plan.id, amountCents: payoffAmount ?? 0, date: payoffDate },
                {
                  onSuccess: () => {
                    toast({ message: 'Parcelamento quitado' })
                    close()
                  },
                },
              )
            }
          >
            Confirmar quitação
          </Button>
        </div>
      </Sheet>
    </>
  )
}
