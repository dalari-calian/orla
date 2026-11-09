import { currentCompetenceMonth, todayIsoDate } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { Contribution, ContributionPlan } from '@orla/contracts'
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { monthLabel, shortDate } from '@/features/finances/labels'
import { useMonth } from '@/features/finances/api'
import { usePortfolio } from '@/features/portfolio/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useContributionMutations, useContributions, usePlanMutations, usePlans } from './api'
import { defaultSplit } from './model'

const statusLabels: Record<ContributionPlan['status'], string> = {
  draft: 'Rascunho',
  executed: 'Efetivada',
  discarded: 'Descartada',
}

function PlanStatus({ plan }: { plan: ContributionPlan }) {
  const bought = plan.items.filter((item) => item.executedAt).length
  const label =
    plan.status === 'draft' && bought > 0
      ? `${bought} de ${plan.items.length} comprados`
      : statusLabels[plan.status]
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold',
        plan.status === 'executed' ? 'bg-positive/14 text-positive' : 'bg-accent/12 text-accent',
      )}
    >
      {label}
    </span>
  )
}

/** Cartão do mês: continua a simulação principal ou começa uma (RA-01/02/30). */
function MonthCard({ plans }: { plans: ContributionPlan[] }) {
  const month = currentCompetenceMonth()
  const monthQuery = useMonth(month)
  const portfolio = usePortfolio()
  const { create } = usePlanMutations()
  const navigate = useNavigate()
  const toast = useToast()
  const current = plans.find(
    (plan) => plan.competenceMonth === month && plan.isPrimary && plan.status === 'draft',
  )
  const goal = monthQuery.data?.summary
  const suggested = goal ? Math.max(goal.goalRemainingCents, 0) || goal.savingsGoalCents : 0

  async function start() {
    const classes = portfolio.data?.classes.map((item) => item.assetClass) ?? []
    try {
      const plan = await create.mutateAsync({
        competenceMonth: month,
        name: `Aporte de ${monthLabel(month).toLocaleLowerCase('pt-BR')}`,
        totalCents: suggested,
        classSplit: defaultSplit(classes),
        items: [],
      })
      void navigate(`/aporte/${plan.id}`)
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'error' })
    }
  }

  if (current) {
    const spent = current.items.reduce((sum, item) => sum + item.valueCents, 0)
    return (
      <Card className="space-y-3">
        <p className="text-subhead text-text-2">{monthLabel(month)}</p>
        <div>
          <p className="text-footnote text-text-2">Aporte simulado</p>
          <AnimatedMoney
            cents={current.totalCents}
            className="block text-[34px] leading-tight font-semibold tracking-tight"
          />
          <p className="text-footnote text-text-2">
            {current.items.length} {current.items.length === 1 ? 'item' : 'itens'} · cerca de{' '}
            {formatBRL(spent)} no carrinho
          </p>
        </div>
        <Link
          to={`/aporte/${current.id}`}
          className="press flex min-h-12 items-center justify-center rounded-field bg-accent px-4 text-subhead font-semibold text-white"
        >
          Continuar simulação
        </Link>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <p className="text-subhead text-text-2">{monthLabel(month)}</p>
      <p className="text-title-2 font-semibold">Quanto vai aportar este mês?</p>
      <p className="text-subhead text-text-2">
        {goal
          ? suggested > 0
            ? `A meta do mês sugere ${formatBRL(suggested)}. Você divide por classe, monta as compras e vê a carteira depois do aporte.`
            : 'Monte as compras do mês e veja como a carteira fica depois do aporte.'
          : 'Carregando a meta do mês...'}
      </p>
      <Button
        block
        loading={create.isPending}
        disabled={portfolio.isPending}
        onClick={() => void start()}
      >
        <PiggyBank className="size-5" aria-hidden /> Simular aporte
      </Button>
    </Card>
  )
}

function ContributionForm({
  initial,
  onDone,
}: {
  initial: Contribution | null
  onDone: () => void
}) {
  const { create, update, remove } = useContributionMutations()
  const toast = useToast()
  const [direction, setDirection] = useState<'in' | 'out'>(
    initial && initial.amountCents < 0 ? 'out' : 'in',
  )
  const [amount, setAmount] = useState<number | null>(
    initial ? Math.abs(initial.amountCents) : null,
  )
  const [date, setDate] = useState(initial?.date ?? todayIsoDate())
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const mutation = initial ? update : create
  const error = mutation.error ?? remove.error

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!amount) return
    const values = {
      date,
      amountCents: direction === 'out' ? -amount : amount,
      notes: notes.trim() || null,
    }
    if (initial) await update.mutateAsync({ id: initial.id, ...values })
    else await create.mutateAsync(values)
    toast({ message: initial ? 'Aporte atualizado' : 'Aporte lançado' })
    onDone()
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => void submit(event).catch(() => undefined)}
    >
      <SegmentedControl
        label="Direção"
        options={[
          { value: 'in', label: 'Entrou na carteira', icon: ArrowDownLeft },
          { value: 'out', label: 'Saiu', icon: ArrowUpRight },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <MoneyInput label="Valor" value={amount} onChange={setAmount} large autoFocus={!initial} />
      <TextField
        label="Data"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <TextField
        label="Observação"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Opcional"
      />
      <p className="text-footnote text-text-2">
        Aporte é o dinheiro novo que entra na carteira (ou sai dela). Ele é descontado no cálculo da
        rentabilidade real do Balanço.
      </p>
      {error && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(error)}
        </p>
      )}
      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" block loading={mutation.isPending} disabled={!amount}>
          {initial ? 'Salvar' : 'Lançar aporte'}
        </Button>
        {initial && (
          <Button
            variant="destructive"
            block
            loading={remove.isPending}
            onClick={() => {
              if (!window.confirm('Excluir este aporte?')) return
              remove.mutate(initial.id, {
                onSuccess: () => {
                  toast({ message: 'Aporte excluído' })
                  onDone()
                },
              })
            }}
          >
            Excluir
          </Button>
        )}
      </div>
    </form>
  )
}

/** /aporte — simulação do mês, simulações salvas e aportes (docs/06, docs/10). */
export function AportePage() {
  const plans = usePlans()
  const contributions = useContributions()
  const [editing, setEditing] = useState<{ item: Contribution | null } | null>(null)

  const header = (
    <PageHeader
      title="Aporte"
      actions={
        <Button variant="plain" className="px-3" onClick={() => setEditing({ item: null })}>
          <Plus className="size-5" aria-hidden />
          <span className="hidden sm:inline">Lançar aporte</span>
        </Button>
      }
    />
  )

  if (plans.isPending) {
    return (
      <>
        {header}
        <div className="space-y-5" aria-busy>
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </>
    )
  }
  if (plans.isError) {
    return (
      <>
        {header}
        <Card>
          <ErrorState
            description={errorMessage(plans.error)}
            onRetry={() => void plans.refetch()}
          />
        </Card>
      </>
    )
  }

  const year = new Date().getFullYear().toString()
  const list = contributions.data ?? []
  const yearTotal = list
    .filter((item) => item.date.startsWith(year))
    .reduce((sum, item) => sum + item.amountCents, 0)

  return (
    <>
      {header}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-5">
          <MonthCard plans={plans.data} />
          <Card className="p-0 md:p-0">
            <div className="px-4 pt-4 md:px-5 md:pt-5">
              <CardHeader title="Simulações" />
            </div>
            {plans.data.length === 0 ? (
              <EmptyState
                icon={PiggyBank}
                title="Nenhuma simulação"
                description="As simulações ficam salvas aqui, como rascunho, até você efetivar."
                className="py-6"
              />
            ) : (
              <ul>
                {plans.data.map((plan) => (
                  <li key={plan.id} className="border-t border-separator">
                    <Link
                      to={`/aporte/${plan.id}`}
                      className="flex min-h-15 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 md:px-5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">
                          {plan.name}
                          {plan.isPrimary && plan.status === 'draft' && (
                            <span className="text-text-2"> · principal</span>
                          )}
                        </span>
                        <span className="block text-footnote text-text-2">
                          {monthLabel(plan.competenceMonth)} · {formatBRL(plan.totalCents)}
                        </span>
                      </span>
                      <PlanStatus plan={plan} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-0 md:p-0">
          <div className="px-4 pt-4 md:px-5 md:pt-5">
            <CardHeader
              title="Aportes"
              action={
                <Button variant="plain" className="px-3" onClick={() => setEditing({ item: null })}>
                  <Plus className="size-4" aria-hidden /> Lançar
                </Button>
              }
            />
            <p className="-mt-1 pb-3 text-footnote text-text-2">
              Em {year}:{' '}
              <span className="font-medium text-text tabular">{formatBRL(yearTotal)}</span>
            </p>
          </div>
          {contributions.isError ? (
            <ErrorState
              description={errorMessage(contributions.error)}
              onRetry={() => void contributions.refetch()}
            />
          ) : list.length === 0 ? (
            <EmptyState
              icon={ArrowDownLeft}
              title="Nenhum aporte"
              description="Ao efetivar uma simulação, o aporte entra aqui. Também dá para lançar à mão."
              className="py-6"
            />
          ) : (
            <ul>
              {list.slice(0, 50).map((item) => (
                <li key={item.id} className="border-t border-separator">
                  <button
                    type="button"
                    onClick={() => setEditing({ item })}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 md:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">
                        {item.notes ?? (item.amountCents < 0 ? 'Retirada' : 'Aporte')}
                      </span>
                      <span className="block text-footnote text-text-2">
                        {shortDate(item.date)}
                        {item.contributionPlanId && ' · de uma simulação'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-body font-medium tabular',
                        item.amountCents < 0 ? 'text-negative' : 'text-positive',
                      )}
                    >
                      {item.amountCents < 0 ? '−' : '+'}
                      {formatBRL(Math.abs(item.amountCents))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.item ? 'Editar aporte' : 'Lançar aporte'}
      >
        {editing && (
          <ContributionForm
            key={editing.item?.id ?? 'new'}
            initial={editing.item}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}
