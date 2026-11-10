import { splitShareCents, todayIsoDate } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { InstallmentPlan, InstallmentSummary, Transaction } from '@orla/contracts'
import { CalendarRange, Check, Circle, HandCoins, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
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
  type PlanType,
} from './api'
import { useEntrySheet } from './EntrySheet'
import { InstallmentPlanForm } from './InstallmentPlanForm'
import { shortDate, shortMonthLabel } from './labels'

const backToFinances = { to: '/financas', label: 'Finanças' }

/** Textos que mudam entre parcelado a pagar e a receber (RF-49). */
const planCopy = {
  expense: {
    heroTitle: 'Para quitar tudo',
    heroMonth: 'Compromisso este mês',
    heroFree: 'livre em',
    barsLabel: 'Parcelas previstas nos próximos 12 meses',
    remaining: 'Falta pagar',
    done: 'Pago',
    doneCount: 'pagas',
    emptyTitle: 'Nenhum parcelamento ativo',
    emptyDescription: 'Cadastre compras parceladas e veja quanto falta para quitar tudo.',
    newLabel: 'Novo parcelamento',
    fallbackSubtitle: 'Parcelamento',
    settledLabel: 'paga',
    payoffButton: 'Quitar antecipado',
    payoffTitle: 'Quitar antecipado',
    payoffAmount: 'Valor pago',
    payoffDate: 'Data do pagamento',
    payoffConfirm: 'Confirmar quitação',
    payoffDone: 'Parcelamento quitado',
    payoffText: (remaining: string) =>
      `Falta ${remaining}. Informe quanto você pagou (com o desconto, se teve): as parcelas restantes saem e entra um pagamento único.`,
    paidOff: 'Quitado em',
    cancelButton: 'Cancelar compra',
    cancelConfirm: 'Cancelar o parcelamento? As parcelas que faltam serão removidas.',
    canceled: 'Parcelamento cancelado',
    canceledNote: 'Cancelado: as parcelas que faltavam foram removidas.',
    removed: 'Parcelamento excluído',
    editTitle: 'Editar parcelamento',
    updated: 'Parcelamento atualizado',
    payoffRow: 'Quitação',
    detailTitle: 'Parcelamento',
  },
  income: {
    heroTitle: 'Falta receber',
    heroMonth: 'Entra este mês',
    heroFree: 'tudo recebido em',
    barsLabel: 'Parcelas a receber nos próximos 12 meses',
    remaining: 'Falta receber',
    done: 'Recebido',
    doneCount: 'recebidas',
    emptyTitle: 'Nada a receber',
    emptyDescription:
      'Alguém vai te pagar em parcelas? Ex.: a parte de outra pessoa numa compra que você parcelou.',
    newLabel: 'Novo a receber',
    fallbackSubtitle: 'A receber',
    settledLabel: 'recebida',
    payoffButton: 'Recebi tudo antes',
    payoffTitle: 'Recebi tudo antes',
    payoffAmount: 'Valor recebido',
    payoffDate: 'Data do recebimento',
    payoffConfirm: 'Confirmar recebimento',
    payoffDone: 'Recebimento registrado',
    payoffText: (remaining: string) =>
      `Falta ${remaining}. Informe quanto você recebeu: as parcelas restantes saem e entra um recebimento único.`,
    paidOff: 'Recebido em',
    cancelButton: 'Cancelar',
    cancelConfirm: 'Cancelar o parcelado a receber? As parcelas que faltam serão removidas.',
    canceled: 'Parcelado a receber cancelado',
    canceledNote: 'Cancelado: as parcelas que faltavam foram removidas.',
    removed: 'Parcelado a receber excluído',
    editTitle: 'Editar parcelado a receber',
    updated: 'Parcelado a receber atualizado',
    payoffRow: 'Antecipado',
    detailTitle: 'A receber',
  },
} as const

/** `?tipo=receber` abre a aba "A receber". */
const TYPE_PARAM = 'tipo'
function plansPath(type: PlanType): string {
  return type === 'income'
    ? `/financas/parcelamentos?${TYPE_PARAM}=receber`
    : '/financas/parcelamentos'
}

/**
 * RF-45: "Para quitar tudo" + compromisso mensal em barras ("livre em ago/2027").
 * RF-49: no "A receber", quanto falta receber e quanto entra por mês.
 */
function SummaryHero({ summary, type }: { summary: InstallmentSummary; type: PlanType }) {
  const text = planCopy[type]
  const max = Math.max(1, ...summary.monthly.map((item) => item.amountCents))
  const current = summary.monthly[0]?.amountCents ?? 0
  return (
    <Card>
      <p className="text-subhead text-text-2">{text.heroTitle}</p>
      <p
        className={cn(
          'mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular',
          type === 'income' && summary.payoffTotalCents > 0 && 'text-positive',
        )}
      >
        <AnimatedMoney cents={summary.payoffTotalCents} />
      </p>
      <p className="mt-1 text-footnote text-text-2">
        {text.heroMonth}: <span className="font-medium text-text">{formatBRL(current)}</span>
        {summary.payoffTotalCents > 0 && (
          <>
            {' '}
            · {text.heroFree} {shortMonthLabel(summary.freeFromMonth)}
          </>
        )}
      </p>
      <div
        className="mt-5 flex h-28 items-end gap-1"
        role="img"
        aria-label={`${text.barsLabel}: ${summary.monthly
          .map((item) => `${shortMonthLabel(item.month)} ${formatBRL(item.amountCents)}`)
          .join(', ')}`}
      >
        {summary.monthly.map((item, index) => (
          <div
            key={item.month}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className={cn(
                'w-full origin-bottom animate-grow-y rounded-t-[4px]',
                type === 'income' ? 'bg-positive/80' : 'bg-accent/80',
              )}
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
  const text = planCopy[plan.type]
  const receivable = plan.type === 'income'
  const statusLabel =
    plan.status === 'paid_off'
      ? receivable
        ? 'Recebido'
        : 'Quitado'
      : plan.status === 'canceled'
        ? 'Cancelado'
        : indicators.phase === 'not_started'
          ? 'Ainda não começou'
          : indicators.currentNumber
            ? `${indicators.currentNumber}/${plan.installmentsCount}`
            : indicators.remainingCount === 0
              ? 'Finalizado'
              : `${indicators.paidCount}/${plan.installmentsCount} ${text.doneCount}`
  return (
    <Link
      to={`/financas/parcelamentos/${plan.id}`}
      className="press block rounded-card bg-surface p-4 shadow-card hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-headline font-semibold">{plan.description}</p>
          <p className="truncate text-footnote text-text-2">
            {(receivable
              ? payeeName && `De ${payeeName}`
              : [
                  payeeName,
                  cardName ?? (plan.paymentMethod === 'boleto' ? 'Boleto/carnê' : undefined),
                ]
                  .filter(Boolean)
                  .join(' · ')) || text.fallbackSubtitle}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-footnote font-semibold tabular',
            receivable ? 'bg-positive/12 text-positive' : 'bg-accent/12 text-accent',
          )}
        >
          {statusLabel}
        </span>
      </div>
      <ProgressBar value={indicators.progress} className="mt-3" />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-footnote text-text-2 tabular">
        <span>
          {text.done} {formatBRL(indicators.paidCents)} de {formatBRL(plan.totalCents)}
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

/** /financas/parcelamentos — abas "A pagar" e "A receber" (`?tipo=receber`). */
export function InstallmentPlansPage() {
  const [params, setParams] = useSearchParams()
  const type: PlanType = params.get(TYPE_PARAM) === 'receber' ? 'income' : 'expense'
  const text = planCopy[type]
  const [filter, setFilter] = useState<PlanFilter>('active')
  const summary = useInstallmentSummary(type)
  const list = useInstallmentPlans(filter, type)
  const cardList = creditCards.useList()
  const payeeList = payees.useList()
  const { openNewPlan } = useEntrySheet()
  const setType = (next: PlanType) =>
    setParams(next === 'income' ? { [TYPE_PARAM]: 'receber' } : {}, { replace: true })
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
            onClick={() => openNewPlan(type)}
            className="px-3"
            aria-label={text.newLabel}
          >
            <Plus className="size-5" aria-hidden />
            <span className="hidden sm:inline">Novo</span>
          </Button>
        }
      />
      <div className="mb-4 lg:max-w-[360px]">
        <SegmentedControl
          label="Parcelados a pagar ou a receber"
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'A pagar' },
            { value: 'income', label: 'A receber' },
          ]}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-6">
          {summary.data ? (
            <SummaryHero summary={summary.data} type={type} />
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
          <SlideSwap index={(type === 'income' ? 2 : 0) + (filter === 'active' ? 0 : 1)}>
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
                  icon={type === 'income' ? HandCoins : CalendarRange}
                  title={filter === 'active' ? text.emptyTitle : 'Nada finalizado ainda'}
                  description={filter === 'active' ? text.emptyDescription : undefined}
                  action={
                    filter === 'active' && (
                      <Button onClick={() => openNewPlan(type)}>{text.newLabel}</Button>
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
  settledLabel,
}: {
  item: Transaction
  label: string
  editable: boolean
  /** "paga" ou "recebida". */
  settledLabel: string
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
        aria-label={settled ? settledLabel : 'Prevista'}
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
        settled
          ? `Marcar a parcela ${label} como prevista`
          : `Marcar a parcela ${label} como ${settledLabel}`
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
  const payeeList = payees.useList()
  const { openNewPlan } = useEntrySheet()
  const toast = useToast()
  const navigate = useNavigate()
  const [action, setAction] = useState<Action>(null)
  const [payoffAmount, setPayoffAmount] = useState<number | null>(null)
  const [payoffDate, setPayoffDate] = useState<string>(todayIsoDate())

  const planType: PlanType = query.data?.plan.type ?? 'expense'
  const text = planCopy[planType]
  const back = { to: plansPath(planType), label: 'Parcelamentos' }

  if (query.isPending) {
    return (
      <>
        <PageHeader title={text.detailTitle} back={back} />
        <Skeleton className="h-48 rounded-card" />
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title={text.detailTitle} back={back} />
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
  const payee = payeeList.data?.find((item) => item.id === plan.payeeId)
  const receivable = plan.type === 'income'
  const active = plan.status === 'active'
  // "Dividir com alguém": abre um parcelado a receber com metade do valor, no mesmo ritmo.
  const firstInstallment = installments.find((item) => item.installmentNumber === 1)
  const splitWithSomeone = () =>
    openNewPlan('income', {
      description: `${plan.description} — parte de quem divide`,
      totalCents: splitShareCents(plan.totalCents),
      installmentsCount: plan.installmentsCount,
      ...(firstInstallment && { purchaseDate: firstInstallment.date }),
      firstCompetenceMonth: plan.firstCompetenceMonth,
    })
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
        subtitle={
          receivable
            ? payee
              ? `A receber de ${payee.name}`
              : 'A receber'
            : card
              ? `Cartão ${card.name}`
              : 'Boleto / carnê'
        }
      />

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <Card className="space-y-4 lg:sticky lg:top-6">
          <div>
            <p className="text-subhead text-text-2">{text.remaining}</p>
            <p
              className={cn(
                'mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular',
                receivable && indicators.remainingCents > 0 && 'text-positive',
              )}
            >
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
              <dt className="text-text-2">{text.done}</dt>
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
              {text.paidOff} {shortDate(plan.paidOffAt ?? '')}
              {receivable
                ? plan.payoffDiscountCents > 0 &&
                  ` · ${formatBRL(plan.payoffDiscountCents)} a menos que o combinado`
                : ` · ${
                    plan.payoffDiscountCents >= 0
                      ? `desconto de ${formatBRL(plan.payoffDiscountCents)}`
                      : `pagou ${formatBRL(-plan.payoffDiscountCents)} a mais`
                  }`}
            </p>
          )}
          {plan.status === 'canceled' && (
            <p className="rounded-field bg-surface-2 px-3 py-2 text-footnote text-text-2">
              {text.canceledNote}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-separator pt-3">
            {active && (
              <>
                <Button variant="secondary" onClick={() => setAction('edit')}>
                  Editar
                </Button>
                {!receivable && (
                  <Button variant="secondary" onClick={splitWithSomeone}>
                    <Users className="size-4" aria-hidden />
                    Dividir com alguém
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPayoffAmount(indicators.remainingCents)
                    setAction('payoff')
                  }}
                >
                  {text.payoffButton}
                </Button>
                <Button
                  variant="destructive"
                  loading={mutations.cancel.isPending}
                  onClick={() => {
                    if (!window.confirm(text.cancelConfirm)) return
                    mutations.cancel.mutate(plan.id, {
                      onSuccess: () => toast({ message: text.canceled }),
                      onError,
                    })
                  }}
                >
                  {text.cancelButton}
                </Button>
              </>
            )}
            <Button
              variant="destructive"
              loading={mutations.remove.isPending}
              onClick={() =>
                mutations.remove.mutate(plan.id, {
                  onSuccess: () => {
                    void navigate(plansPath(plan.type))
                    toast({
                      message: text.removed,
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
                  settledLabel={text.settledLabel}
                  // Só dá para marcar/desmarcar parcelas de um parcelamento ativo (a quitação é fixa).
                  editable={active && item.installmentNumber !== null}
                />
                <span className="w-14 shrink-0 text-subhead font-medium tabular">
                  {item.installmentNumber
                    ? `${item.installmentNumber}/${plan.installmentsCount}`
                    : text.payoffRow}
                </span>
                <span className="flex-1 text-subhead text-text-2">
                  {shortMonthLabel(item.competenceMonth)}
                </span>
                <span
                  className={cn('text-body font-medium tabular', receivable && 'text-positive')}
                >
                  {receivable && '+'}
                  {formatBRL(item.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Sheet open={action === 'edit'} onClose={close} title={text.editTitle}>
        {action === 'edit' && (
          <InstallmentPlanForm
            initial={plan}
            submitting={mutations.update.isPending}
            error={mutations.update.error}
            onUpdate={async (values) => {
              await mutations.update.mutateAsync({ id: plan.id, ...values })
              toast({ message: text.updated })
              close()
            }}
          />
        )}
      </Sheet>

      <Sheet open={action === 'payoff'} onClose={close} title={text.payoffTitle}>
        <div className="space-y-4">
          <p className="text-subhead text-text-2">
            {text.payoffText(formatBRL(indicators.remainingCents))}
          </p>
          <MoneyInput
            label={text.payoffAmount}
            value={payoffAmount}
            onChange={setPayoffAmount}
            large
          />
          {!receivable &&
            payoffAmount !== null &&
            payoffAmount > 0 &&
            payoffAmount < indicators.remainingCents && (
              <p className="px-1 text-footnote text-positive">
                Desconto de {formatBRL(indicators.remainingCents - payoffAmount)}
              </p>
            )}
          <TextField
            label={text.payoffDate}
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
                    toast({ message: text.payoffDone })
                    close()
                  },
                },
              )
            }
          >
            {text.payoffConfirm}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
