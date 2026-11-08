import { formatBRL } from '@orla/core/money'
import type { DashboardPeriod, DashboardResponse } from '@orla/contracts'
import { ChartPie, ChevronRight, Store, Target, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Card, CardHeader } from '@/components/ui/Card'
import { categoryIcons, IconBadge } from '@/components/ui/CategoryIcon'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { ProgressBar, ProgressRing } from '@/components/ui/Progress'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { accounts, categories, creditCards, payees } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useDashboard, useInstallmentSummary } from './api'
import { DonutChart, EvolutionChart, MonthBarsChart, type DonutSlice } from './charts'
import { monthLabel, paymentMethodLabels, shortMonthLabel, useMonthParam } from './labels'
import { MonthSwitcher } from './MonthSwitcher'
import { UpcomingList } from './Upcoming'

const periodOptions = [
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: '3 meses' },
  { value: 'year', label: 'Ano' },
] as const satisfies readonly { value: DashboardPeriod; label: string }[]

const periodParam: Record<string, DashboardPeriod> = {
  mes: 'month',
  trimestre: 'quarter',
  ano: 'year',
}
const periodSlug: Record<DashboardPeriod, string> = {
  month: 'mes',
  quarter: 'trimestre',
  year: 'ano',
}

/** Período na URL (`?periodo=mes|trimestre|ano`), junto do `?mes=`. */
function usePeriodParam(): [DashboardPeriod, (period: DashboardPeriod) => void] {
  const [params, setParams] = useSearchParams()
  const period = periodParam[params.get('periodo') ?? ''] ?? 'month'
  const set = (next: DashboardPeriod) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        copy.set('periodo', periodSlug[next])
        return copy
      },
      { replace: true },
    )
  return [period, set]
}

function periodLabel(data: DashboardResponse): string {
  const first = data.months[0] ?? data.month
  const last = data.months[data.months.length - 1] ?? data.month
  if (data.period === 'month') return monthLabel(data.month)
  if (data.period === 'year') return `Ano de ${data.month.slice(0, 4)}`
  return `${shortMonthLabel(first)} a ${shortMonthLabel(last)}`
}

/** Cores para quebras sem cor própria (forma de pagamento, contas sem cor). */
const PALETTE = [
  '#007AFF',
  '#AF52DE',
  '#FF9500',
  '#34C759',
  '#FF2D55',
  '#5AC8FA',
  '#FFCC00',
  '#8E8E93',
]

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

/** Lista com barra horizontal proporcional (forma de pagamento, conta, cartão, top). */
function BarList({
  items,
}: {
  items: {
    key: string
    label: string
    amountCents: number
    share: number
    color: string
    detail?: string
  }[]
}) {
  const max = Math.max(1, ...items.map((item) => item.amountCents))
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-subhead">
            <span className="min-w-0 truncate">
              {item.label}
              {item.detail && <span className="text-text-2"> · {item.detail}</span>}
            </span>
            <span className="shrink-0 font-medium tabular">{formatBRL(item.amountCents)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full origin-left animate-grow-x rounded-full"
              style={{
                width: `${(item.amountCents / max) * 100}%`,
                backgroundColor: item.color,
                animationDelay: `${index * 30}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Block({
  title,
  action,
  className,
  children,
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader title={title} action={action} />
      {children}
    </Card>
  )
}

const empty = (text: string) => <p className="py-4 text-center text-subhead text-text-2">{text}</p>

/** 1. Herói: sobra prevista + entradas / saídas / meta com a variação. */
function HeroBlock({ data }: { data: DashboardResponse }) {
  const { summary, previousSummary: before } = data
  const negative = summary.projectedSurplusCents < 0
  const lines = [
    {
      label: 'Entradas',
      value: summary.incomeForecastCents,
      delta: summary.incomeForecastCents - before.incomeForecastCents,
      good: 'up' as const,
    },
    {
      label: 'Saídas',
      value: summary.expenseForecastCents,
      delta: summary.expenseForecastCents - before.expenseForecastCents,
      good: 'down' as const,
    },
    {
      label: 'Meta',
      value: summary.savingsGoalCents,
      delta: summary.savingsGoalCents - before.savingsGoalCents,
      good: 'up' as const,
    },
  ]
  return (
    <Card className="md:col-span-2">
      <p className="text-subhead text-text-2">Sobra prevista · {periodLabel(data)}</p>
      <p
        className={cn(
          'mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular',
          negative && 'text-negative',
        )}
      >
        <AnimatedMoney cents={summary.projectedSurplusCents} />
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-footnote text-text-2">
        {negative ? (
          <span className="flex items-center gap-1 text-negative" role="alert">
            <TriangleAlert className="size-4" aria-hidden /> Vai furar a meta em{' '}
            {formatBRL(summary.goalShortfallCents)}
          </span>
        ) : (
          'Livre para gastar sem furar a meta.'
        )}
        <DeltaBadge
          deltaCents={summary.projectedSurplusCents - before.projectedSurplusCents}
          goodWhen="up"
        />
        <span>vs. período anterior</span>
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-separator pt-4">
        {lines.map((line) => (
          <div key={line.label} className="min-w-0">
            <p className="text-footnote text-text-2">{line.label}</p>
            <p className="truncate text-headline font-semibold tabular">{formatBRL(line.value)}</p>
            <DeltaBadge deltaCents={line.delta} goodWhen={line.good} />
          </div>
        ))}
      </div>
    </Card>
  )
}

/** 2. Anel: quanto do previsto já foi pago. */
function SpendingBlock({ data }: { data: DashboardResponse }) {
  const { expenseForecastCents: forecast, expenseSettledCents: paid } = data.summary
  const ratio = forecast === 0 ? 0 : paid / forecast
  return (
    <Block title="Gasto realizado">
      <div className="flex items-center gap-5">
        <ProgressRing value={ratio} label="Gasto realizado sobre o previsto">
          <span className="text-title-2 font-semibold tabular">{percent.format(ratio)}</span>
          <span className="text-caption text-text-2">pago</span>
        </ProgressRing>
        <div className="min-w-0 space-y-2 text-subhead">
          <p>
            <span className="block text-footnote text-text-2">Pago</span>
            <span className="font-semibold tabular">{formatBRL(paid)}</span>
          </p>
          <p>
            <span className="block text-footnote text-text-2">Previsto no total</span>
            <span className="font-semibold tabular">{formatBRL(forecast)}</span>
          </p>
          <p>
            <span className="block text-footnote text-text-2">Ainda a pagar</span>
            <span className="font-semibold tabular">{formatBRL(Math.max(0, forecast - paid))}</span>
          </p>
        </div>
      </div>
    </Block>
  )
}

/** 3. Categorias: rosca + lista ordenada com a variação. */
function CategoryBlock({ data }: { data: DashboardResponse }) {
  const list = categories.useList()
  const byId = new Map((list.data ?? []).map((category) => [category.id, category]))
  const rows = data.byCategory.filter((row) => row.amountCents > 0 || row.previousCents > 0)
  const current = rows.filter((row) => row.amountCents > 0)
  const top = current.slice(0, 6)
  const rest = current.slice(6).reduce((sum, row) => sum + row.amountCents, 0)
  const slices: DonutSlice[] = top.map((row) => {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined
    return {
      key: row.categoryId ?? 'none',
      label: category?.name ?? 'Sem categoria',
      value: row.amountCents,
      color: category?.color ?? 'var(--text-3)',
    }
  })
  if (rest > 0) slices.push({ key: 'rest', label: 'Outras', value: rest, color: 'var(--text-3)' })

  return (
    <Block title="Gastos por categoria" className="md:col-span-2 xl:col-span-1 xl:row-span-2">
      {current.length === 0 ? (
        empty('Nenhum gasto no período.')
      ) : (
        <>
          <DonutChart
            data={slices}
            ariaLabel={`Gastos por categoria: ${slices.map((s) => `${s.label} ${formatBRL(s.value)}`).join(', ')}`}
            center={
              <>
                <span className="text-caption text-text-2">Total</span>
                <span className="text-headline font-semibold tabular">
                  {formatBRL(data.summary.expenseForecastCents)}
                </span>
              </>
            }
          />
          <ul className="mt-4">
            {rows.map((row) => {
              const category = row.categoryId ? byId.get(row.categoryId) : undefined
              return (
                <li
                  key={row.categoryId ?? 'none'}
                  className="flex min-h-12 items-center gap-3 py-1.5"
                >
                  <IconBadge
                    icon={category ? categoryIcons[category.icon] : ChartPie}
                    color={category?.color ?? 'var(--text-2)'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">
                      {category?.name ?? 'Sem categoria'}
                    </span>
                    <span className="block text-footnote text-text-2 tabular">
                      {percent.format(row.share)} do total
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-body font-medium tabular">
                      {formatBRL(row.amountCents)}
                    </span>
                    <DeltaBadge deltaCents={row.deltaCents} goodWhen="down" />
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Block>
  )
}

/** 4. Forma de pagamento. */
function PaymentBlock({ data }: { data: DashboardResponse }) {
  return (
    <Block title="Por forma de pagamento">
      {data.byPaymentMethod.length === 0 ? (
        empty('Nenhum gasto no período.')
      ) : (
        <BarList
          items={data.byPaymentMethod.map((row, index) => ({
            key: row.paymentMethod ?? 'none',
            label: row.paymentMethod ? paymentMethodLabels[row.paymentMethod] : 'Não informado',
            amountCents: row.amountCents,
            share: row.share,
            detail: percent.format(row.share),
            color: PALETTE[index % PALETTE.length] ?? 'var(--accent)',
          }))}
        />
      )}
    </Block>
  )
}

/** 5. Conta/instituição e cartão. */
function AccountBlock({ data }: { data: DashboardResponse }) {
  const accountList = accounts.useList()
  const cardList = creditCards.useList()
  const accountById = new Map((accountList.data ?? []).map((account) => [account.id, account]))
  const cardById = new Map((cardList.data ?? []).map((card) => [card.id, card]))
  return (
    <Block title="Por conta e cartão">
      {data.byAccount.length === 0 && data.byCard.length === 0 ? (
        empty('Nenhum gasto no período.')
      ) : (
        <div className="space-y-5">
          {data.byAccount.length > 0 && (
            <section>
              <h3 className="mb-2 text-footnote font-medium tracking-wide text-text-2 uppercase">
                Contas
              </h3>
              <BarList
                items={data.byAccount.map((row, index) => {
                  const account = row.accountId ? accountById.get(row.accountId) : undefined
                  return {
                    key: row.accountId ?? 'none',
                    label: account?.name ?? 'Sem conta',
                    amountCents: row.amountCents,
                    share: row.share,
                    color: account?.color ?? PALETTE[index % PALETTE.length] ?? 'var(--accent)',
                  }
                })}
              />
            </section>
          )}
          {data.byCard.length > 0 && (
            <section>
              <h3 className="mb-2 text-footnote font-medium tracking-wide text-text-2 uppercase">
                Cartões
              </h3>
              <BarList
                items={data.byCard.map((row) => {
                  const card = cardById.get(row.creditCardId)
                  const account = card ? accountById.get(card.accountId) : undefined
                  return {
                    key: row.creditCardId,
                    label: card?.name ?? 'Cartão',
                    amountCents: row.amountCents,
                    share: row.share,
                    color: account?.color ?? 'var(--accent)',
                  }
                })}
              />
            </section>
          )}
        </div>
      )}
    </Block>
  )
}

/** 6. Parcelamentos: total para quitar e compromisso dos próximos 12 meses. */
function InstallmentBlock() {
  const query = useInstallmentSummary()
  return (
    <Block
      title="Parcelamentos"
      action={
        <Link
          to="/financas/parcelamentos"
          className="flex min-h-11 items-center text-subhead font-medium text-accent"
        >
          Ver
        </Link>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.payoffTotalCents === 0 ? (
        empty('Nenhum parcelamento em aberto.')
      ) : (
        <>
          <p className="text-footnote text-text-2">Para quitar tudo</p>
          <p className="text-title-2 font-semibold tabular">
            {formatBRL(query.data.payoffTotalCents)}
          </p>
          <p className="mb-3 text-footnote text-text-2">
            Livre das parcelas em {shortMonthLabel(query.data.freeFromMonth)}
          </p>
          <MonthBarsChart
            name="Parcelas"
            ariaLabel="Parcelas previstas nos próximos 12 meses"
            data={query.data.monthly.map((item) => ({
              month: item.month,
              value: item.amountCents,
            }))}
            height={150}
          />
        </>
      )}
    </Block>
  )
}

/** 9. Top estabelecimentos. */
function PayeesBlock({ data }: { data: DashboardResponse }) {
  const list = payees.useList()
  const byId = new Map((list.data ?? []).map((payee) => [payee.id, payee.name]))
  return (
    <Block title="Onde você mais gastou">
      {data.topPayees.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sem estabelecimentos"
          description="Informe o estabelecimento nos lançamentos para ver onde o dinheiro vai."
          className="py-4"
        />
      ) : (
        <BarList
          items={data.topPayees.map((row) => ({
            key: row.payeeId,
            label: byId.get(row.payeeId) ?? 'Estabelecimento',
            detail: row.count === 1 ? '1 compra' : `${row.count} compras`,
            amountCents: row.amountCents,
            share: 0,
            color: 'var(--accent)',
          }))}
        />
      )}
    </Block>
  )
}

/** 10. Orçamentos por categoria (RF-61). */
function BudgetsBlock({ data }: { data: DashboardResponse }) {
  const list = categories.useList()
  const byId = new Map((list.data ?? []).map((category) => [category.id, category]))
  const alerts = data.budgets.filter((budget) => budget.level !== 'ok').length
  return (
    <Block
      title="Orçamentos"
      action={
        alerts > 0 ? (
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-footnote font-semibold text-warning">
            {alerts === 1 ? '1 alerta' : `${alerts} alertas`}
          </span>
        ) : undefined
      }
    >
      {data.budgets.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhum teto definido"
          description="Defina um teto mensal nas categorias para acompanhar aqui."
          action={
            <Link
              to="/config/categorias"
              className="inline-flex min-h-11 items-center font-semibold text-accent"
            >
              Definir tetos
            </Link>
          }
          className="py-4"
        />
      ) : (
        <ul className="space-y-4">
          {data.budgets.map((budget) => {
            const category = byId.get(budget.categoryId)
            const tone =
              budget.level === 'exceeded'
                ? 'negative'
                : budget.level === 'warning'
                  ? 'warning'
                  : 'positive'
            return (
              <li key={budget.categoryId}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-subhead">
                  <span className="min-w-0 truncate">{category?.name ?? 'Categoria'}</span>
                  <span
                    className={cn(
                      'shrink-0 tabular',
                      budget.level === 'exceeded' && 'font-semibold text-negative',
                    )}
                  >
                    {formatBRL(budget.spentCents)}{' '}
                    <span className="text-text-2">de {formatBRL(budget.budgetCents)}</span>
                  </span>
                </div>
                <ProgressBar
                  value={budget.ratio}
                  tone={tone}
                  label={`${category?.name ?? 'Categoria'}: ${percent.format(budget.ratio)} do teto`}
                />
                {budget.level !== 'ok' && (
                  <p
                    className={cn(
                      'mt-1 text-caption',
                      budget.level === 'exceeded' ? 'text-negative' : 'text-warning',
                    )}
                  >
                    {budget.level === 'exceeded'
                      ? `Estourou em ${formatBRL(budget.spentCents - budget.budgetCents)}`
                      : `${percent.format(budget.ratio)} do teto — faltam ${formatBRL(budget.budgetCents - budget.spentCents)}`}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}

function LoadingGrid() {
  return (
    <div
      className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      aria-busy
      aria-label="Carregando dashboard"
    >
      <Skeleton className="h-48 rounded-card md:col-span-2" />
      <Skeleton className="h-48 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
    </div>
  )
}

/** /financas/dashboard — os 10 blocos do doc 04 §8 (docs/10 › Finanças — Dashboard). */
export function DashboardPage() {
  const [month, setMonth] = useMonthParam()
  const [period, setPeriod] = usePeriodParam()
  const query = useDashboard(month, period)

  return (
    <>
      <PageHeader title="Dashboard" back={{ to: `/financas?mes=${month}`, label: 'Finanças' }} />
      <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-center">
        <MonthSwitcher month={month} onChange={setMonth} />
        <SegmentedControl
          label="Período"
          options={periodOptions}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <SlideSwap index={periodOptions.findIndex((option) => option.value === period)}>
        {query.isPending ? (
          <LoadingGrid />
        ) : query.isError ? (
          <Card>
            <ErrorState
              description={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          </Card>
        ) : (
          <div
            key={`${query.data.month}-${query.data.period}`}
            className="grid animate-fade-in grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            <HeroBlock data={query.data} />
            <SpendingBlock data={query.data} />
            <CategoryBlock data={query.data} />
            <PaymentBlock data={query.data} />
            <AccountBlock data={query.data} />
            <Block title="Evolução 12 meses" className="md:col-span-2">
              <EvolutionChart data={query.data.evolution} />
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-text-2">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-positive" />
                  Entradas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-negative/75" />
                  Saídas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-accent" />
                  Sobra
                </span>
              </p>
            </Block>
            <InstallmentBlock />
            <Card className="min-w-0 overflow-hidden p-0 md:p-0">
              <div className="px-4 pt-4 md:px-5 md:pt-5">
                <CardHeader title="Próximos 7 dias" />
              </div>
              <UpcomingList />
            </Card>
            <PayeesBlock data={query.data} />
            <BudgetsBlock data={query.data} />
            <Card className="flex items-center justify-between gap-3 md:col-span-2 xl:col-span-3">
              <div>
                <p className="text-headline font-semibold">Projeção dos próximos 12 meses</p>
                <p className="text-footnote text-text-2">
                  Entradas, fixas, parcelas e a sobra de cada mês.
                </p>
              </div>
              <Link
                to="/financas/projecao"
                className="press flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-accent/12 px-4 text-subhead font-semibold text-accent"
              >
                Ver projeção <ChevronRight className="size-4" aria-hidden />
              </Link>
            </Card>
          </div>
        )}
      </SlideSwap>
    </>
  )
}
