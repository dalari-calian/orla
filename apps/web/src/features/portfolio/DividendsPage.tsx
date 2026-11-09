import { addMonths } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { AssetClass } from '@orla/contracts'
import { HandCoins, ListPlus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { axisMoney, ChartTooltip, monthTick, tick } from '@/features/finances/charts'
import { monthLabel, shortDate, shortMonthLabel } from '@/features/finances/labels'
import { errorMessage } from '@/lib/api'
import { prefersReducedMotion } from '@/lib/motion'
import {
  useAssetClasses,
  useAssets,
  useDividendMutations,
  useDividends,
  useDividendsSummary,
  usePortfolio,
} from './api'
import { DividendBatchForm, DividendForm } from './forms'
import { assetLabel, dividendKindLabels } from './labels'

/** Barras empilhadas por classe, 12 meses (RC-43). */
export function StackedMonths({
  months,
  classes,
}: {
  months: { month: string; byClass: Record<string, number> }[]
  classes: AssetClass[]
}) {
  const used = classes.filter((item) => months.some((month) => (month.byClass[item.id] ?? 0) > 0))
  const data = months.map((month) => ({ month: month.month, ...month.byClass }))
  return (
    <div className="h-56 w-full" role="img" aria-label="Proventos por mês, últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--separator)" />
          <XAxis
            dataKey="month"
            tickFormatter={monthTick}
            tick={tick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={axisMoney}
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={(props) => (
              <ChartTooltip
                {...(props as object)}
                labelFormatter={(month) => shortMonthLabel(month)}
              />
            )}
          />
          {used.map((item, index) => (
            <Bar
              key={item.id}
              dataKey={item.id}
              name={item.name}
              stackId="classes"
              fill={item.color}
              maxBarSize={22}
              radius={index === used.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              isAnimationActive={!prefersReducedMotion()}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** /carteira/proventos — barras 12 meses, total do ano, média e lançamento do mês (docs/10). */
export function DividendsPage() {
  const summary = useDividendsSummary()
  const classes = useAssetClasses()
  const assets = useAssets()
  const portfolio = usePortfolio()
  const mutations = useDividendMutations()
  const toast = useToast()
  const [sheet, setSheet] = useState<'batch' | 'single' | null>(null)
  const lastMonth = summary.data?.months.at(-1)?.month
  const list = useDividends(
    lastMonth ? addMonths(lastMonth, -11) : '2000-01',
    lastMonth ?? '2000-01',
  )
  const close = () => {
    setSheet(null)
    mutations.batch.reset()
    mutations.create.reset()
  }
  const assetById = new Map((assets.data ?? []).map((item) => [item.id, item]))

  const header = (
    <PageHeader
      title="Proventos"
      subtitle="Dividendos, JCP e rendimentos. Não contam como aporte: são retorno da carteira."
      back={{ to: '/carteira', label: 'Carteira' }}
      actions={
        <Button
          variant="plain"
          className="px-3"
          onClick={() => setSheet('single')}
          aria-label="Novo provento"
        >
          <Plus className="size-5" aria-hidden />
          <span className="hidden sm:inline">Provento</span>
        </Button>
      }
    />
  )

  if (summary.isPending || classes.isPending) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-card" />
      </>
    )
  }
  if (summary.isError) {
    return (
      <>
        {header}
        <Card>
          <ErrorState
            description={errorMessage(summary.error)}
            onRetry={() => void summary.refetch()}
          />
        </Card>
      </>
    )
  }

  const data = summary.data
  const top = data.topPayer ? assetById.get(data.topPayer.assetId) : undefined
  const byMonth = new Map<string, typeof list.data>()
  for (const item of list.data ?? []) {
    const month = item.payDate.slice(0, 7)
    byMonth.set(month, [...(byMonth.get(month) ?? []), item])
  }
  const monthsWithData = [...byMonth.keys()].sort().reverse()

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-5 lg:order-2 lg:sticky lg:top-6">
          <Card className="space-y-3">
            <div>
              <p className="text-subhead text-text-2">Recebido no ano</p>
              <p className="mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular">
                <AnimatedMoney cents={data.yearTotalCents} />
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-separator pt-3 text-footnote">
              <div>
                <dt className="text-text-2">Média 12 meses</dt>
                <dd className="text-headline font-semibold tabular">
                  {formatBRL(data.average12mCents)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-text-2">Maior pagador</dt>
                <dd className="truncate text-headline font-semibold">
                  {top ? `${assetLabel(top)} · ${formatBRL(data.topPayer?.amountCents ?? 0)}` : '—'}
                </dd>
              </div>
            </dl>
            <Button block onClick={() => setSheet('batch')}>
              <ListPlus className="size-4" aria-hidden /> Lançar proventos do mês
            </Button>
          </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:order-1">
          <Card>
            <CardHeader title="Últimos 12 meses" />
            <StackedMonths months={data.months} classes={classes.data ?? []} />
          </Card>

          {monthsWithData.length === 0 ? (
            <Card className="p-0 md:p-0">
              <EmptyState
                icon={HandCoins}
                title="Nenhum provento nos últimos 12 meses"
                description="Lance o mês de uma vez, como na planilha: um valor ao lado de cada ativo."
                action={<Button onClick={() => setSheet('batch')}>Lançar proventos do mês</Button>}
              />
            </Card>
          ) : (
            monthsWithData.map((month) => {
              const items = byMonth.get(month) ?? []
              const total = items.reduce((sum, item) => sum + item.amountCents, 0)
              return (
                <section key={month}>
                  <h2 className="mb-2 flex items-center px-4 text-footnote font-medium tracking-wide text-text-2 uppercase">
                    <span className="flex-1">{monthLabel(month)}</span>
                    <span className="tabular">{formatBRL(total)}</span>
                  </h2>
                  <ul className="overflow-hidden rounded-card bg-surface shadow-card">
                    {items.map((item) => {
                      const asset = assetById.get(item.assetId)
                      return (
                        <li key={item.id} className="[&+li]:border-t [&+li]:border-separator">
                          <Link
                            to={`/carteira/ativos/${item.assetId}`}
                            className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-body">
                                {asset ? assetLabel(asset) : 'Ativo'}
                              </span>
                              <span className="block text-footnote text-text-2">
                                {dividendKindLabels[item.kind]} · {shortDate(item.payDate)}
                              </span>
                            </span>
                            <span className="shrink-0 text-body font-medium text-positive tabular">
                              +{formatBRL(item.amountCents)}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      </div>

      <Sheet open={sheet === 'batch'} onClose={close} title="Proventos do mês">
        {sheet === 'batch' &&
          (portfolio.data ? (
            <DividendBatchForm
              positions={portfolio.data.positions}
              classes={classes.data ?? []}
              submitting={mutations.batch.isPending}
              error={mutations.batch.error}
              onSubmit={async (payDate, items) => {
                const result = await mutations.batch.mutateAsync({ payDate, items })
                toast({ message: `${result.data.length} proventos lançados` })
                close()
              }}
            />
          ) : (
            <Skeleton className="h-64" />
          ))}
      </Sheet>
      <Sheet open={sheet === 'single'} onClose={close} title="Novo provento">
        {sheet === 'single' && (
          <DividendForm
            assets={(assets.data ?? []).filter((item) => item.quoteMode === 'auto')}
            submitting={mutations.create.isPending}
            error={mutations.create.error}
            onSubmit={async (values) => {
              await mutations.create.mutateAsync(values)
              toast({ message: 'Provento registrado' })
              close()
            }}
          />
        )}
      </Sheet>
    </>
  )
}
