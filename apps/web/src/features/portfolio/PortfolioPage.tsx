import { formatBRL } from '@orla/core/money'
import type { ClassAllocation, Position } from '@orla/contracts'
import {
  ChevronDown,
  ChevronRight,
  ChartPie,
  HandCoins,
  LayoutDashboard,
  Plus,
  RefreshCw,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { accounts } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  useAssetClasses,
  useAssetMutations,
  usePortfolio,
  useRefreshQuotes,
  useTradeMutations,
} from './api'
import { AssetForm } from './forms'
import { assetLabel, formatPercent, formatQuantity, formatPrice, relativeTime } from './labels'

type GroupBy = 'class' | 'account' | 'ticker'

function Signed({
  cents,
  pct,
  className,
}: {
  cents: number
  pct?: number | null
  className?: string
}) {
  return (
    <span
      className={cn(
        'tabular',
        cents > 0 ? 'text-positive' : cents < 0 ? 'text-negative' : 'text-text-2',
        className,
      )}
    >
      {cents > 0 ? '+' : cents < 0 ? '−' : ''}
      {formatBRL(Math.abs(cents))}
      {pct !== undefined && pct !== null && ` (${formatPercent(pct, true)})`}
    </span>
  )
}

/** Barras atual × meta por classe (docs/10 › AllocationBars). */
export function AllocationBars({ classes }: { classes: ClassAllocation[] }) {
  const visible = classes.filter((item) => item.valueCents > 0 || item.target !== null)
  return (
    <ul className="space-y-3.5">
      {visible.map((item) => (
        <li key={item.assetClass.id}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-subhead">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.assetClass.color }}
              />
              <span className="truncate font-medium">{item.assetClass.name}</span>
            </span>
            <span className="shrink-0 text-footnote text-text-2 tabular">
              <span className={cn('font-semibold', item.offTarget ? 'text-warning' : 'text-text')}>
                {formatPercent(item.current)}
              </span>
              {item.target !== null && ` · meta ${formatPercent(item.target)}`}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-surface-2">
            <div
              className="h-full origin-left animate-grow-x rounded-full"
              style={{
                width: `${Math.min(100, item.current * 100)}%`,
                backgroundColor: item.assetClass.color,
              }}
            />
            {item.target !== null && (
              <span
                className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-text"
                style={{ left: `calc(${Math.min(100, item.target * 100)}% - 1px)` }}
                aria-hidden
              />
            )}
          </div>
          {item.target !== null && item.missingCents > 0 && (
            <p className="mt-1 text-caption text-text-2 tabular">
              Faltam {formatBRL(item.missingCents)} para a meta
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function PositionRow({ position }: { position: Position }) {
  const label = assetLabel(position.asset)
  return (
    <li className="[&+li]:border-t [&+li]:border-separator">
      <Link
        to={`/carteira/ativos/${position.asset.id}`}
        className="flex min-h-15 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-body font-medium">{label}</span>
            {position.error && (
              <TriangleAlert
                className="size-4 shrink-0 text-negative"
                aria-label={position.error}
              />
            )}
          </span>
          <span className="block truncate text-footnote text-text-2 tabular">
            {position.asset.quoteMode === 'manual'
              ? position.asset.ticker
                ? position.asset.name
                : 'Renda fixa · saldo informado'
              : `${formatQuantity(position.quantity)} × PM ${formatPrice(position.avgPrice)}`}
          </span>
        </span>
        <span className="hidden w-24 shrink-0 text-right text-footnote text-text-2 tabular lg:block">
          {position.asset.quoteMode === 'manual' ? '—' : formatPrice(position.price)}
        </span>
        <span className="hidden w-16 shrink-0 text-right text-footnote text-text-2 tabular md:block">
          {formatPercent(position.weightInPortfolio)}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-body font-medium tabular">
            {formatBRL(position.valueCents)}
          </span>
          <Signed
            cents={position.resultCents}
            pct={position.resultPct}
            className="block text-caption"
          />
        </span>
        <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
      </Link>
    </li>
  )
}

function Group({
  title,
  color,
  positions,
  total,
}: {
  title: string
  color?: string | undefined
  positions: Position[]
  total: number
}) {
  const value = positions.reduce((sum, item) => sum + item.valueCents, 0)
  return (
    <details open className="group">
      <summary className="mb-2 flex min-h-11 cursor-pointer list-none items-center gap-2 px-4">
        <ChevronDown
          className="size-4 text-text-2 transition-transform group-not-open:-rotate-90"
          aria-hidden
        />
        {color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
        <h2 className="flex-1 truncate text-footnote font-medium tracking-wide text-text-2 uppercase">
          {title}
        </h2>
        <span className="text-footnote font-medium text-text-2 tabular">
          {formatBRL(value)} · {formatPercent(total > 0 ? value / total : 0)}
        </span>
      </summary>
      <ul className="overflow-hidden rounded-card bg-surface shadow-card">
        {positions.map((position) => (
          <PositionRow key={position.asset.id} position={position} />
        ))}
      </ul>
    </details>
  )
}

/** /carteira — posição por classe, corretora ou ticker (docs/10 › Carteira). */
export function PortfolioPage() {
  const query = usePortfolio()
  const classes = useAssetClasses()
  const accountList = accounts.useList()
  const refresh = useRefreshQuotes()
  const { create } = useAssetMutations()
  const trades = useTradeMutations()
  const toast = useToast()
  const navigate = useNavigate()
  const [groupBy, setGroupBy] = useState<GroupBy>('class')
  const [adding, setAdding] = useState(false)

  const closeAdd = () => {
    setAdding(false)
    create.reset()
  }

  const header = (
    <PageHeader
      title="Carteira"
      actions={
        <Button
          variant="plain"
          className="px-3"
          aria-label="Novo ativo"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-5" aria-hidden />
          <span className="hidden sm:inline">Ativo</span>
        </Button>
      }
    />
  )

  const addSheet = (
    <Sheet open={adding} onClose={closeAdd} title="Novo ativo">
      {adding && classes.data && (
        <AssetForm
          classes={classes.data}
          accounts={(accountList.data ?? []).filter((item) => !item.isArchived)}
          submitting={create.isPending || trades.create.isPending}
          error={create.error}
          onSubmit={async (values, position) => {
            const asset = await create.mutateAsync(values)
            if (position) {
              try {
                await trades.create.mutateAsync({
                  assetId: asset.id,
                  kind: 'position_set',
                  feesCents: 0,
                  ...position,
                })
                toast({ message: 'Ativo cadastrado com a posição informada.' })
              } catch (positionError) {
                toast({
                  message: `Ativo cadastrado, mas a posição não foi salva: ${errorMessage(positionError)}`,
                  tone: 'error',
                })
              }
            } else {
              toast({ message: 'Ativo cadastrado. Agora registre as operações.' })
            }
            closeAdd()
            void navigate(`/carteira/ativos/${asset.id}`)
          }}
        />
      )}
    </Sheet>
  )

  if (query.isPending) {
    return (
      <>
        {header}
        <div className="space-y-5" aria-busy>
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        {header}
        <Card>
          <ErrorState
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      </>
    )
  }

  const data = query.data
  const positions = data.positions
  const total = data.totals.valueCents
  const accountName = (id: string | null) =>
    accountList.data?.find((item) => item.id === id)?.name ?? 'Sem corretora'

  let groups: { key: string; title: string; color?: string; positions: Position[] }[]
  if (groupBy === 'class') {
    groups = data.classes
      .map((item) => ({
        key: item.assetClass.id,
        title: item.assetClass.name,
        color: item.assetClass.color,
        positions: positions.filter(
          (position) => position.asset.assetClassId === item.assetClass.id,
        ),
      }))
      .filter((group) => group.positions.length > 0)
  } else if (groupBy === 'account') {
    const ids = [...new Set(positions.map((item) => item.asset.accountId ?? ''))]
    groups = ids.map((id) => ({
      key: id || 'none',
      title: accountName(id || null),
      positions: positions.filter((item) => (item.asset.accountId ?? '') === id),
    }))
  } else {
    // Por ticker: o mesmo ticker em corretoras diferentes aparece junto (RC-12).
    const sorted = [...positions].sort((a, b) =>
      assetLabel(a.asset).localeCompare(assetLabel(b.asset)),
    )
    groups = [{ key: 'all', title: 'Todos os ativos', positions: sorted }]
  }

  return (
    <>
      {header}
      {positions.length === 0 ? (
        <Card className="p-0 md:p-0">
          <EmptyState
            icon={ChartPie}
            title="Sua carteira está vazia"
            description="Cadastre seus ativos e operações, ou importe a planilha da carteira."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => setAdding(true)}>Cadastrar ativo</Button>
                <Link
                  to="/config/importar"
                  className="inline-flex min-h-11 items-center justify-center px-4 font-semibold text-accent"
                >
                  Importar planilha
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-5 lg:order-2 lg:sticky lg:top-6">
            <Card className="space-y-3">
              <div>
                <p className="text-subhead text-text-2">Patrimônio</p>
                <p className="mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular">
                  <AnimatedMoney cents={total} />
                </p>
                <p className="mt-1 text-footnote">
                  <Signed cents={data.totals.resultCents} pct={data.totals.resultPct} />{' '}
                  <span className="text-text-2">no total</span>
                  {data.totals.dayChangeCents !== 0 && (
                    <>
                      {' · '}
                      <Signed cents={data.totals.dayChangeCents} />{' '}
                      <span className="text-text-2">hoje</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-separator pt-3">
                <p className="min-w-0 text-footnote text-text-2">
                  {data.quotes.enabled
                    ? `Cotações ${relativeTime(data.oldestQuoteAt)}`
                    : 'Cotação automática desligada: valores pelo preço informado'}
                </p>
                {data.quotes.enabled && (
                  <Button
                    variant="plain"
                    className="shrink-0 px-3"
                    loading={refresh.isPending}
                    onClick={() =>
                      refresh.mutate(undefined, {
                        onSuccess: (result) =>
                          toast({
                            message:
                              result.refreshed > 0
                                ? `${result.refreshed} cotações atualizadas`
                                : 'As cotações já estão em dia',
                          }),
                        onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                      })
                    }
                  >
                    {!refresh.isPending && <RefreshCw className="size-4" aria-hidden />} Atualizar
                  </Button>
                )}
              </div>
            </Card>

            {data.alerts.length > 0 && (
              <Card className="space-y-2 bg-warning/10">
                {data.alerts.map((alert) => (
                  <p key={alert.message} className="flex items-start gap-2 text-footnote">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    {alert.message}
                  </p>
                ))}
              </Card>
            )}

            <Card>
              <CardHeader
                title="Alocação × meta"
                action={
                  <Link
                    to="/config/metas"
                    className="flex min-h-11 items-center text-subhead font-medium text-accent"
                  >
                    Metas
                  </Link>
                }
              />
              <AllocationBars classes={data.classes} />
              {data.classes.every((item) => item.target === null) && (
                <p className="mt-3 text-footnote text-text-2">
                  Defina a meta de cada classe em Configurações › Metas.
                </p>
              )}
            </Card>

            <nav aria-label="Atalhos da carteira" className="grid grid-cols-2 gap-3">
              <Link
                to="/carteira/dashboard"
                className="press col-span-2 flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
              >
                <LayoutDashboard className="size-5 text-accent" aria-hidden />
                Dashboard da carteira
              </Link>
              <Link
                to="/carteira/proventos"
                className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
              >
                <HandCoins className="size-5 text-accent" aria-hidden />
                Proventos
              </Link>
              <Link
                to="/config/importar"
                className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
              >
                <Upload className="size-5 text-accent" aria-hidden />
                Importar
              </Link>
            </nav>
          </div>

          <div className="min-w-0 space-y-5 lg:order-1">
            <SegmentedControl
              label="Agrupar ativos"
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: 'class', label: 'Por classe' },
                { value: 'account', label: 'Por corretora' },
                { value: 'ticker', label: 'Por ticker' },
              ]}
            />
            <SlideSwap
              index={['class', 'account', 'ticker'].indexOf(groupBy)}
              className="space-y-5"
            >
              {groups.map((group) => (
                <Group
                  key={group.key}
                  title={group.title}
                  color={group.color}
                  positions={group.positions}
                  total={total}
                />
              ))}
            </SlideSwap>
          </div>
        </div>
      )}
      {addSheet}
    </>
  )
}
