import { currentCompetenceMonth } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type {
  BalanceRow,
  BalancesResponse,
  ObservedPriceValue,
  YearSummaryValue,
} from '@orla/contracts'
import { ArrowDownUp, CircleAlert, Lock, Scale, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SelectField } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { monthLabel, shortDate, shortMonthLabel } from '@/features/finances/labels'
import { formatPercent, formatPrice } from '@/features/portfolio/labels'
import { useSettings, useUpdateSettings } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useBalances, useObservedPrices } from './api'
import { ReturnBars, WealthChart } from './charts'

type Tab = 'list' | 'evolution' | 'prices'
const tabPath: Record<Tab, string> = {
  list: '/balanco',
  evolution: '/balanco/evolucao',
  prices: '/balanco/precos',
}

function Tabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = (Object.entries(tabPath).find(([, path]) => path === pathname)?.[0] ??
    'list') as Tab
  return (
    <SegmentedControl
      label="Seção do balanço"
      options={[
        { value: 'list', label: 'Balanços' },
        { value: 'evolution', label: 'Evolução' },
        { value: 'prices', label: 'Preços' },
      ]}
      value={current}
      onChange={(value) => void navigate(tabPath[value])}
    />
  )
}

export function Signed({ cents, rate }: { cents: number | null; rate?: number | null }) {
  if (cents === null) return <span className="text-text-2">—</span>
  return (
    <span className={cn('tabular', cents > 0 ? 'text-positive' : cents < 0 ? 'text-negative' : '')}>
      {cents > 0 ? '+' : cents < 0 ? '−' : ''}
      {formatBRL(Math.abs(cents))}
      {rate !== undefined && rate !== null && ` (${formatPercent(rate, true)})`}
    </span>
  )
}

function useBalancesQuery() {
  const query = useBalances()
  return query
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Balanço" actions={action} />
      <div className="space-y-5">
        <Tabs />
        {children}
      </div>
    </>
  )
}

function Loading() {
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-64 rounded-card" />
    </div>
  )
}

/** Resumo do ano (doc 07 §3): ganho real, TWR, ganho sobre o capital, média e projeção. */
export function YearCard({ summary }: { summary: YearSummaryValue }) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-subhead text-text-2">Ganho real em {summary.year}</p>
        <p className="mt-1 text-[34px] leading-tight font-semibold tracking-tight">
          <Signed cents={summary.gainCents} />
        </p>
        <p className="text-footnote text-text-2">
          Descontando {formatBRL(summary.contributionsCents)} de aportes · {summary.months}{' '}
          {summary.months === 1 ? 'mês' : 'meses'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Rentabilidade no ano', formatPercent(summary.twr, true)],
          ['Sobre o capital', formatPercent(summary.gainOnCapital, true)],
          ['Média mensal', formatPercent(summary.averageMonthlyRate, true)],
          [
            'Projeção fim do ano',
            summary.projectionCents === null ? '—' : formatBRL(summary.projectionCents),
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-field bg-surface-2 p-3">
            <dt className="text-footnote text-text-2">{label}</dt>
            <dd className="truncate text-headline font-semibold tabular">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.dividendsCents > 0 && (
        <p className="text-footnote text-text-2">
          Dos ganhos, {formatBRL(summary.dividendsCents)} vieram de proventos.
        </p>
      )}
    </Card>
  )
}

function BalanceCard({ row }: { row: BalanceRow }) {
  return (
    <li className="border-t border-separator first:border-t-0">
      <Link
        to={`/balanco/${row.competenceMonth}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 md:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-body font-medium">
            {monthLabel(row.competenceMonth)}
            {row.status === 'closed' ? (
              <Lock className="size-3.5 text-text-3" aria-label="Fechado" />
            ) : (
              <span className="rounded-full bg-accent/12 px-2 text-caption font-semibold text-accent">
                rascunho
              </span>
            )}
          </span>
          <span className="block truncate text-footnote text-text-2 tabular">
            {shortDate(row.referenceDate)} · aportes {formatBRL(row.contributionsCents)}
            {row.contributionsChanged && ' (mudou depois)'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-body font-semibold tabular">{formatBRL(row.totalCents)}</span>
          <span className="block text-footnote">
            <Signed cents={row.gainCents} rate={row.rate} />
          </span>
        </span>
      </Link>
    </li>
  )
}

/** /balanco — lista por mês e o atalho do balanço do mês (docs/10). */
export function BalanceListPage() {
  const query = useBalancesQuery()
  const month = currentCompetenceMonth()
  const cta = (data: BalancesResponse | undefined) => {
    const done = data?.currentMonthDone
    return (
      <Link
        to={`/balanco/${month}`}
        className={cn(
          'press flex min-h-11 items-center gap-2 rounded-field px-4 text-subhead font-semibold',
          done ? 'text-accent hover:bg-accent/10' : 'bg-accent text-white',
        )}
      >
        <Scale className="size-4" aria-hidden />
        {done
          ? `Balanço de ${shortMonthLabel(month)}`
          : `Gravar balanço de ${shortMonthLabel(month)}`}
      </Link>
    )
  }
  if (query.isPending) return <Shell>{<Loading />}</Shell>
  if (query.isError)
    return (
      <Shell>
        <Card>
          <ErrorState
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      </Shell>
    )
  const rows = [...query.data.data].reverse()
  const year = query.data.years.at(-1)
  return (
    <Shell action={cta(query.data)}>
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scale}
            title="Nenhum balanço ainda"
            description="O balanço congela o patrimônio num dia (normalmente logo depois do aporte). Com dois ou mais, aparece a rentabilidade real, descontando o que você aportou."
            action={cta(query.data)}
          />
        </Card>
      ) : (
        <>
          {year && <YearCard summary={year} />}
          <Card className="p-0 md:p-0">
            <ul>
              {rows.map((row) => (
                <BalanceCard key={row.id} row={row} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </Shell>
  )
}

function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings()
  const update = useUpdateSettings()
  const toast = useToast()
  return (
    <Sheet open={open} onClose={onClose} title="Como calcular">
      {settings.data && (
        <div className="space-y-4">
          <SelectField
            label="Quando o aporte entra no período"
            value={settings.data.contributionTiming}
            onChange={(event) =>
              update.mutate(
                { contributionTiming: event.target.value as 'end' | 'start' | 'dietz' },
                { onSuccess: () => toast({ message: 'Cálculo atualizado' }) },
              )
            }
            hint="Padrão: no fim (você aporta logo antes do balanço, então o dinheiro novo ainda não rendeu)."
          >
            <option value="end">No fim do período (padrão)</option>
            <option value="start">No começo do período</option>
            <option value="dietz">Pelos dias aplicado (Dietz)</option>
          </SelectField>
          <SelectField
            label="O que conta como aporte"
            value={settings.data.returnContributionSource}
            onChange={(event) =>
              update.mutate(
                { returnContributionSource: event.target.value as 'contributions' | 'trades' },
                { onSuccess: () => toast({ message: 'Cálculo atualizado' }) },
              )
            }
            hint="Proventos nunca contam como aporte."
          >
            <option value="contributions">Os aportes lançados (padrão)</option>
            <option value="trades">Compras menos vendas</option>
          </SelectField>
          {update.error && (
            <p role="alert" className="text-footnote text-negative">
              {errorMessage(update.error)}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** /balanco/evolucao — gráficos e tabela anual (doc 07 §5). */
export function EvolutionPage() {
  const query = useBalancesQuery()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const years = query.data?.years ?? []
  const [year, setYear] = useState<string | null>(null)
  const selected = year ?? years.at(-1)?.year ?? null
  const action = (
    <Button variant="plain" className="px-3" onClick={() => setSettingsOpen(true)}>
      <Settings2 className="size-5" aria-hidden />
      <span className="hidden sm:inline">Como calcular</span>
    </Button>
  )
  if (query.isPending) return <Shell action={action}>{<Loading />}</Shell>
  if (query.isError)
    return (
      <Shell action={action}>
        <Card>
          <ErrorState
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      </Shell>
    )
  const rows = query.data.data
  const summary = years.find((item) => item.year === selected)
  const yearRows = rows.filter((row) => row.referenceDate.startsWith(selected ?? ''))
  return (
    <Shell action={action}>
      {rows.length < 2 ? (
        <Card>
          <EmptyState
            icon={Scale}
            title="Faltam balanços"
            description="A rentabilidade real aparece a partir do segundo balanço."
          />
        </Card>
      ) : (
        <>
          {years.length > 1 && (
            <SegmentedControl
              label="Ano"
              options={years.map((item) => ({ value: item.year, label: item.year }))}
              value={selected ?? ''}
              onChange={setYear}
            />
          )}
          {summary && <YearCard summary={summary} />}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Patrimônio × aportado" />
              <WealthChart rows={rows} />
              <p className="mt-2 text-footnote text-text-2">
                O vão entre as linhas é o ganho real (o que não veio de aporte).
              </p>
            </Card>
            <Card>
              <CardHeader title="Rentabilidade real por mês" />
              <ReturnBars rows={yearRows.length > 0 ? yearRows : rows} />
            </Card>
          </div>
          <Card className="p-0 md:p-0">
            <div className="px-4 pt-4 md:px-5 md:pt-5">
              <CardHeader title={`Mês a mês em ${selected}`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-subhead tabular">
                <thead className="text-footnote text-text-2">
                  <tr className="border-b border-separator">
                    {['Mês', 'Anterior', 'Aportes', 'Atual', 'Ganho real', '%', 'Acumulado'].map(
                      (title, index) => (
                        <th
                          key={title}
                          className={cn(
                            'px-3 py-2 font-medium',
                            index === 0 ? 'pl-4 text-left md:pl-5' : 'text-right',
                          )}
                        >
                          {title}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {yearRows.map((row) => (
                    <tr key={row.id} className="border-b border-separator last:border-b-0">
                      <td className="py-2 pr-3 pl-4 md:pl-5">
                        <Link
                          to={`/balanco/${row.competenceMonth}`}
                          className="font-medium text-accent"
                        >
                          {shortMonthLabel(row.competenceMonth)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.previousTotalCents === null ? '—' : formatBRL(row.previousTotalCents)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatBRL(row.contributionsCents)}</td>
                      <td className="px-3 py-2 text-right">{formatBRL(row.totalCents)}</td>
                      <td className="px-3 py-2 text-right">
                        <Signed cents={row.gainCents} />
                      </td>
                      <td className="px-3 py-2 text-right">{formatPercent(row.rate, true)}</td>
                      <td className="px-3 py-2 pr-4 text-right md:pr-5">
                        {formatPercent(row.yearCumulative, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Shell>
  )
}

type SortKey = 'aboveMin' | 'belowMax' | 'dy' | 'name'

const sortLabels: Record<SortKey, string> = {
  aboveMin: 'Mais perto da mínima',
  belowMax: 'Mais longe da máxima',
  dy: 'Maior DY',
  name: 'Nome',
}

function sortPrices(list: ObservedPriceValue[], key: SortKey): ObservedPriceValue[] {
  const value = (item: ObservedPriceValue) =>
    key === 'aboveMin'
      ? (item.aboveMin ?? Infinity)
      : key === 'belowMax'
        ? (item.belowMax ?? Infinity)
        : key === 'dy'
          ? -Number(item.lastDy ?? -Infinity)
          : 0
  return [...list].sort(
    (a, b) => value(a) - value(b) || (a.ticker ?? a.name).localeCompare(b.ticker ?? b.name),
  )
}

/** /balanco/precos — preços e indicadores observados nos balanços (RB-30/32). */
export function ObservedPricesPage() {
  const query = useObservedPrices()
  const [sort, setSort] = useState<SortKey>('aboveMin')
  const list = useMemo(() => sortPrices(query.data?.data ?? [], sort), [query.data, sort])
  return (
    <Shell
      action={
        <Link
          to="/aporte"
          className="press flex min-h-11 items-center rounded-field px-3 text-subhead font-semibold text-accent hover:bg-accent/10"
        >
          Simular aporte
        </Link>
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={ArrowDownUp}
            title="Nenhum preço anotado"
            description="Os preços que você confere em cada balanço viram o histórico de máxima, mínima, DY e P/VP de cada ativo."
          />
        </Card>
      ) : (
        <>
          <p className="flex items-start gap-2 text-footnote text-text-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            São os preços vistos nos balanços, não o que você pagou. Bom para decidir o próximo
            aporte: quem está mais perto da mínima que você já viu?
          </p>
          <SelectField
            label="Ordenar por"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {sortLabels[key]}
              </option>
            ))}
          </SelectField>
          <Card className="p-0 md:p-0">
            <ul>
              {list.map((item) => (
                <li key={item.key} className="border-t border-separator first:border-t-0">
                  <Link
                    to={item.assetId ? `/carteira/ativos/${item.assetId}` : '/balanco/precos'}
                    className="block px-4 py-3 transition-colors hover:bg-surface-2 md:px-5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-body font-semibold">
                        {item.ticker ?? item.name}
                      </span>
                      <span className="shrink-0 text-body tabular">
                        {formatPrice(item.currentPrice ?? item.last.price)}
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-footnote text-text-2 tabular sm:grid-cols-4">
                      <span>
                        Mín. {formatPrice(item.min.price)}{' '}
                        <span
                          className={cn(
                            item.aboveMin !== null &&
                              item.aboveMin <= 0.03 &&
                              'font-semibold text-positive',
                          )}
                        >
                          ({formatPercent(item.aboveMin, true)})
                        </span>
                      </span>
                      <span>
                        Máx. {formatPrice(item.max.price)} ({formatPercent(item.belowMax, true)})
                      </span>
                      <span>
                        DY {item.lastDy ? `${item.lastDy.replace('.', ',')}%` : '—'} · P/VP{' '}
                        {item.lastPvp ? item.lastPvp.replace('.', ',') : '—'}
                      </span>
                      <span>PM {formatPrice(item.avgPrice)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Shell>
  )
}
