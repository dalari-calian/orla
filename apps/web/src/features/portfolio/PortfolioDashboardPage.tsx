import { formatBRL } from '@orla/core/money'
import type { Position } from '@orla/contracts'
import { CircleAlert, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Card, CardHeader } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useBalances } from '@/features/balance/api'
import { Signed } from '@/features/balance/BalancePages'
import { ReturnBars, WealthChart } from '@/features/balance/charts'
import { shortMonthLabel } from '@/features/finances/labels'
import { accounts } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useAssetClasses, useDividendsSummary, usePortfolio } from './api'
import { StackedMonths } from './DividendsPage'
import { assetLabel, formatPercent } from './labels'
import { AllocationBars } from './PortfolioPage'

function WeightList({
  items,
}: {
  items: {
    key: string
    label: string
    to?: string
    valueCents: number
    weight: number
    color?: string
  }[]
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-subhead">
              <span className="truncate font-medium">{item.label}</span>
              <span className="shrink-0 text-footnote text-text-2 tabular">
                {formatBRL(item.valueCents)} · {formatPercent(item.weight)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2">
              <div
                className="h-full origin-left animate-grow-x rounded-full"
                style={{
                  width: `${Math.min(100, item.weight * 100)}%`,
                  backgroundColor: item.color ?? 'var(--accent)',
                }}
              />
            </div>
          </>
        )
        return (
          <li key={item.key}>
            {item.to ? (
              <Link
                to={item.to}
                className="block rounded-field transition-opacity hover:opacity-80"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Movers({ positions }: { positions: Position[] }) {
  const ranked = positions
    .filter((item) => item.resultPct !== null && item.valueCents > 0)
    .sort((a, b) => (b.resultPct ?? 0) - (a.resultPct ?? 0))
  const top = ranked.slice(0, 3)
  const bottom = ranked
    .slice(-3)
    .reverse()
    .filter((item) => !top.includes(item))
  const row = (item: Position, up: boolean) => (
    <li key={item.asset.id}>
      <Link
        to={`/carteira/ativos/${item.asset.id}`}
        className="flex items-center gap-2 py-1.5 text-subhead transition-opacity hover:opacity-80"
      >
        {up ? (
          <TrendingUp className="size-4 shrink-0 text-positive" aria-hidden />
        ) : (
          <TrendingDown className="size-4 shrink-0 text-negative" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{assetLabel(item.asset)}</span>
        <span
          className={cn(
            'shrink-0 tabular',
            (item.resultPct ?? 0) >= 0 ? 'text-positive' : 'text-negative',
          )}
        >
          {formatPercent(item.resultPct, true)}
        </span>
      </Link>
    </li>
  )
  if (ranked.length === 0)
    return <p className="text-subhead text-text-2">Sem posições com resultado ainda.</p>
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-footnote font-medium text-text-2">Maiores altas</p>
        <ul>{top.map((item) => row(item, true))}</ul>
      </div>
      <div>
        <p className="mb-1 text-footnote font-medium text-text-2">Maiores baixas</p>
        <ul>{bottom.map((item) => row(item, false))}</ul>
      </div>
    </div>
  )
}

/** /carteira/dashboard — doc 05 §10 (notícias chegam na Fase 8). */
export function PortfolioDashboardPage() {
  const portfolio = usePortfolio()
  const balances = useBalances()
  const dividends = useDividendsSummary()
  const classes = useAssetClasses()
  const accountList = accounts.useList()
  const back = { to: '/carteira', label: 'Carteira' }

  if (portfolio.isPending) {
    return (
      <>
        <PageHeader title="Dashboard da carteira" back={back} />
        <div className="grid gap-5 lg:grid-cols-2" aria-busy>
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      </>
    )
  }
  if (portfolio.isError) {
    return (
      <>
        <PageHeader title="Dashboard da carteira" back={back} />
        <Card>
          <ErrorState
            description={errorMessage(portfolio.error)}
            onRetry={() => void portfolio.refetch()}
          />
        </Card>
      </>
    )
  }

  const data = portfolio.data
  const total = data.totals.valueCents
  const rows = balances.data?.data ?? []
  const last = rows.at(-1)
  const year = balances.data?.years.at(-1)
  const yearRows = rows.filter((row) => row.referenceDate.startsWith(year?.year ?? ''))
  const sinceBalance = last ? total - last.totalCents : null
  const accountName = new Map((accountList.data ?? []).map((item) => [item.id, item.name]))
  const classColor = new Map((classes.data ?? []).map((item) => [item.id, item.color]))
  const held = data.positions.filter((item) => item.valueCents > 0)
  const byAccount = new Map<string, number>()
  for (const item of held) {
    const key = item.asset.accountId ?? ''
    byAccount.set(key, (byAccount.get(key) ?? 0) + item.valueCents)
  }
  const alerts = [
    ...data.alerts.map((alert) => alert.message),
    ...(balances.data && !balances.data.currentMonthDone
      ? [`Balanço de ${shortMonthLabel(balances.data.currentMonth)} ainda não foi feito`]
      : []),
  ]

  return (
    <>
      <PageHeader title="Dashboard da carteira" back={back} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card className="space-y-3">
          <p className="text-subhead text-text-2">Patrimônio</p>
          <AnimatedMoney
            cents={total}
            className="block text-[34px] leading-tight font-semibold tracking-tight"
          />
          <dl className="space-y-1 text-subhead tabular">
            <div className="flex justify-between gap-3">
              <dt className="text-text-2">Resultado (sobre o custo)</dt>
              <dd>
                <Signed cents={data.totals.resultCents} rate={data.totals.resultPct} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-2">
                Desde o balanço{last ? ` de ${shortMonthLabel(last.competenceMonth)}` : ''}
              </dt>
              <dd>
                <Signed cents={sinceBalance} />
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-separator pt-1">
              <dt className="font-semibold">Rentabilidade real {year?.year ?? ''}</dt>
              <dd className="font-semibold">
                {year ? <Signed cents={year.gainCents} rate={year.twr} /> : '—'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="space-y-3">
          <CardHeader title="Alertas" />
          {alerts.length === 0 ? (
            <p className="text-subhead text-text-2">Tudo dentro das metas.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert} className="flex items-start gap-2 text-subhead">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {alert}
                </li>
              ))}
            </ul>
          )}
          {balances.data && !balances.data.currentMonthDone && (
            <Link
              to={`/balanco/${balances.data.currentMonth}`}
              className="press inline-flex min-h-11 items-center gap-2 rounded-field bg-accent px-4 text-subhead font-semibold text-white"
            >
              <Scale className="size-4" aria-hidden /> Fazer o balanço
            </Link>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Alocação × meta"
            action={
              <Link to="/config/metas" className="text-subhead font-semibold text-accent">
                Metas
              </Link>
            }
          />
          <AllocationBars classes={data.classes} />
        </Card>

        <Card>
          <CardHeader title="Patrimônio × aportado" />
          {rows.length >= 2 ? (
            <WealthChart rows={rows} />
          ) : (
            <p className="text-subhead text-text-2">
              Com dois balanços, aparece a evolução do patrimônio contra o que você aportou.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Rentabilidade real por mês"
            action={
              year?.twr !== undefined && year.twr !== null ? (
                <span className="text-subhead text-text-2 tabular">
                  no ano {formatPercent(year.twr, true)}
                </span>
              ) : undefined
            }
          />
          {yearRows.some((row) => row.rate !== null) ? (
            <ReturnBars rows={yearRows} />
          ) : (
            <p className="text-subhead text-text-2">Aparece a partir do segundo balanço.</p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Proventos 12 meses"
            action={
              <Link to="/carteira/proventos" className="text-subhead font-semibold text-accent">
                Ver
              </Link>
            }
          />
          {dividends.data ? (
            <>
              <StackedMonths months={dividends.data.months} classes={classes.data ?? []} />
              <p className="mt-2 text-footnote text-text-2 tabular">
                No ano {formatBRL(dividends.data.yearTotalCents)} · média{' '}
                {formatBRL(dividends.data.average12mCents)}/mês
              </p>
            </>
          ) : (
            <Skeleton className="h-56 rounded-field" />
          )}
        </Card>

        <Card>
          <CardHeader title="Por ativo" />
          <WeightList
            items={[...held]
              .sort((a, b) => b.valueCents - a.valueCents)
              .slice(0, 12)
              .map((item) => ({
                key: item.asset.id,
                label: assetLabel(item.asset),
                to: `/carteira/ativos/${item.asset.id}`,
                valueCents: item.valueCents,
                weight: total > 0 ? item.valueCents / total : 0,
                color: classColor.get(item.asset.assetClassId),
              }))}
          />
        </Card>

        <Card className="space-y-5">
          <div>
            <CardHeader title="Por corretora" />
            <WeightList
              items={[...byAccount.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([key, value]) => ({
                  key: key || 'none',
                  label: accountName.get(key) ?? 'Sem corretora',
                  valueCents: value,
                  weight: total > 0 ? value / total : 0,
                }))}
            />
          </div>
          <div>
            <CardHeader title="Resultado por ativo" />
            <Movers positions={data.positions} />
          </div>
        </Card>
      </div>
    </>
  )
}
