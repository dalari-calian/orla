import { formatBRL } from '@orla/core/money'
import type { AssetTrade, Dividend } from '@orla/contracts'
import { Archive, Pencil, Plus, SlidersHorizontal, Tag } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { shortDate } from '@/features/finances/labels'
import { accounts } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  useAssetClasses,
  useAssetDetail,
  useAssetMutations,
  useDividendMutations,
  useTradeMutations,
} from './api'
import { AssetForm, DividendForm, TradeForm, type TradePreset } from './forms'
import {
  assetLabel,
  dividendKindLabels,
  formatPercent,
  formatPrice,
  formatQuantity,
  relativeTime,
  tradeKindLabels,
} from './labels'

type Tab = 'summary' | 'trades' | 'dividends' | 'prices'
type Editing =
  | { kind: 'asset' }
  | { kind: 'price' }
  | { kind: 'trade'; trade: AssetTrade | null; preset?: TradePreset }
  | { kind: 'dividend'; dividend: Dividend | null }
  | null

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-field bg-surface-2 p-3">
      <dt className="text-footnote text-text-2">{label}</dt>
      <dd className="truncate text-headline font-semibold tabular">{children}</dd>
    </div>
  )
}

/** /carteira/ativos/:id — doc 05 §9 (notícias chegam na Fase 8). */
export function AssetDetailPage() {
  const { id = '' } = useParams()
  const query = useAssetDetail(id)
  const classes = useAssetClasses()
  const accountList = accounts.useList()
  const assets = useAssetMutations()
  const trades = useTradeMutations()
  const dividends = useDividendMutations()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('summary')
  const [editing, setEditing] = useState<Editing>(null)
  const [priceText, setPriceText] = useState('')
  const [manualValue, setManualValue] = useState<number | null>(null)
  const back = { to: '/carteira', label: 'Carteira' }

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Ativo" back={back} />
        <Skeleton className="h-48 rounded-card" />
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="Ativo" back={back} />
        <Card>
          <ErrorState
            title="Não foi possível abrir este ativo"
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      </>
    )
  }

  const { position, assetClass, quote } = query.data
  const asset = position.asset
  const fixedIncome = asset.quoteMode === 'manual'
  const close = () => {
    setEditing(null)
    assets.update.reset()
    trades.create.reset()
    trades.update.reset()
    dividends.create.reset()
    dividends.update.reset()
  }
  const onError = (error: unknown) => toast({ message: errorMessage(error), tone: 'error' })

  const header = (
    <PageHeader
      title={assetLabel(asset)}
      subtitle={`${asset.ticker ? `${asset.name} · ` : ''}${assetClass.name}${asset.isArchived ? ' · arquivado' : ''}`}
      back={back}
      actions={
        <Button
          variant="plain"
          className="px-3"
          aria-label="Editar ativo"
          onClick={() => setEditing({ kind: 'asset' })}
        >
          <Pencil className="size-5" aria-hidden />
          <span className="hidden sm:inline">Editar</span>
        </Button>
      }
    />
  )

  const summary = (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-subhead text-text-2">{fixedIncome ? 'Saldo atual' : 'Cotação'}</p>
            <p className="mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular">
              {fixedIncome ? formatBRL(position.valueCents) : formatPrice(position.price)}
            </p>
            <p className="mt-1 text-footnote text-text-2">
              {position.changePct !== null && (
                <span
                  className={cn(
                    'font-medium',
                    position.changePct >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {formatPercent(position.changePct / 100, true)} hoje ·{' '}
                </span>
              )}
              {position.priceSource === 'quote'
                ? `cotação ${relativeTime(position.priceAt)}`
                : position.priceSource === 'manual_price'
                  ? `preço informado ${relativeTime(position.priceAt)}`
                  : position.priceSource === 'manual_value'
                    ? `saldo informado ${relativeTime(position.priceAt)}`
                    : 'sem preço: vale o custo'}
              {quote?.error && position.priceSource === 'quote' && ' · último preço conhecido'}
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              setPriceText(asset.manualPrice?.replace('.', ',') ?? '')
              setManualValue(asset.manualValueCents ?? position.valueCents)
              setEditing({ kind: 'price' })
            }}
          >
            <Tag className="size-4" aria-hidden />{' '}
            {fixedIncome ? 'Atualizar saldo' : 'Informar preço'}
          </Button>
        </div>
        {position.error && (
          <p
            role="alert"
            className="rounded-field bg-negative/10 px-3 py-2 text-footnote text-negative"
          >
            {position.error}. Corrija as operações.
          </p>
        )}
      </Card>
      <section>
        <CardHeader
          title="Posição"
          action={
            <Button
              variant="plain"
              className="px-3"
              onClick={() =>
                setEditing({
                  kind: 'trade',
                  trade: null,
                  preset: {
                    kind: 'position_set',
                    quantity: position.quantity,
                    unitPrice: position.avgPrice,
                    totalCents: position.costCents,
                  },
                })
              }
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {fixedIncome ? 'Ajustar valor aplicado' : 'Ajustar quantidade e PM'}
            </Button>
          }
        />
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {!fixedIncome && <Stat label="Quantidade">{formatQuantity(position.quantity)}</Stat>}
          {!fixedIncome && <Stat label="Preço médio">{formatPrice(position.avgPrice)}</Stat>}
          <Stat label={fixedIncome ? 'Aplicado' : 'Custo'}>{formatBRL(position.costCents)}</Stat>
          <Stat label="Valor atual">{formatBRL(position.valueCents)}</Stat>
          <Stat label="Resultado">
            <span className={position.resultCents >= 0 ? 'text-positive' : 'text-negative'}>
              {formatBRL(position.resultCents)}{' '}
              <span className="text-footnote">({formatPercent(position.resultPct, true)})</span>
            </span>
          </Stat>
          <Stat label="Peso na classe">{formatPercent(position.weightInClass)}</Stat>
          <Stat label="Peso na carteira">{formatPercent(position.weightInPortfolio)}</Stat>
          <Stat label="Proventos 12 meses">{formatBRL(position.dividends12mCents)}</Stat>
          <Stat label="Yield on cost">{formatPercent(position.yieldOnCost)}</Stat>
          {position.realizedPnlCents !== 0 && (
            <Stat label="Lucro realizado">{formatBRL(position.realizedPnlCents)}</Stat>
          )}
        </dl>
      </section>
    </div>
  )

  const tradeList = (
    <Card className="p-0 md:p-0">
      <div className="px-4 pt-4 md:px-5 md:pt-5">
        <CardHeader
          title="Operações"
          action={
            <Button
              variant="plain"
              className="px-3"
              onClick={() => setEditing({ kind: 'trade', trade: null })}
            >
              <Plus className="size-4" aria-hidden /> Operação
            </Button>
          }
        />
      </div>
      {query.data.trades.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhuma operação"
          description={
            fixedIncome
              ? 'Registre as aplicações e resgates.'
              : 'Registre as compras e vendas para calcular o preço médio.'
          }
          className="py-6"
        />
      ) : (
        <ul>
          {query.data.trades.map((trade) => (
            <li key={trade.id} className="border-t border-separator">
              <button
                type="button"
                onClick={() => setEditing({ kind: 'trade', trade })}
                className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 md:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{tradeKindLabels[trade.kind]}</span>
                  <span className="block truncate text-footnote text-text-2 tabular">
                    {shortDate(trade.tradeDate)}
                    {trade.kind === 'split' || trade.kind === 'reverse_split'
                      ? ` · proporção ${trade.splitRatio}`
                      : !fixedIncome &&
                        ` · ${formatQuantity(trade.quantity)} × ${formatPrice(trade.unitPrice)}`}
                    {trade.source === 'import' && ' · importada'}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-body font-medium tabular',
                    trade.kind === 'sell' || trade.kind === 'fixed_income_withdrawal'
                      ? 'text-positive'
                      : '',
                  )}
                >
                  {trade.kind === 'split' || trade.kind === 'reverse_split'
                    ? ''
                    : formatBRL(trade.totalCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  const dividendList = (
    <Card className="p-0 md:p-0">
      <div className="px-4 pt-4 md:px-5 md:pt-5">
        <CardHeader
          title={`Proventos · ${formatBRL(query.data.dividendsTotalCents)}`}
          action={
            <Button
              variant="plain"
              className="px-3"
              onClick={() => setEditing({ kind: 'dividend', dividend: null })}
            >
              <Plus className="size-4" aria-hidden /> Provento
            </Button>
          }
        />
        <p className="-mt-2 mb-2 text-footnote text-text-2">
          12 meses: {formatBRL(position.dividends12mCents)} · yield on cost{' '}
          {formatPercent(position.yieldOnCost)}
        </p>
      </div>
      {query.data.dividends.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhum provento"
          description="Registre os dividendos e rendimentos recebidos."
          className="py-6"
        />
      ) : (
        <ul>
          {query.data.dividends.map((dividend) => (
            <li key={dividend.id} className="border-t border-separator">
              <button
                type="button"
                onClick={() => setEditing({ kind: 'dividend', dividend })}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2 md:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{dividendKindLabels[dividend.kind]}</span>
                  <span className="block text-footnote text-text-2">
                    {shortDate(dividend.payDate)}
                  </span>
                </span>
                <span className="shrink-0 text-body font-medium text-positive tabular">
                  +{formatBRL(dividend.amountCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  const prices = (
    <Card className="space-y-2">
      <CardHeader title="Preços observados" />
      <p className="text-subhead text-text-2">
        Preço máximo e mínimo já vistos, último DY e P/VP saem dos balanços mensais, que chegam na
        Fase 7. Por enquanto:{' '}
        {quote?.price
          ? `última cotação ${formatPrice(quote.price)} (${relativeTime(quote.quotedAt ?? quote.fetchedAt)})`
          : 'sem cotação em cache'}
        .
      </p>
    </Card>
  )

  return (
    <>
      {header}
      <div className="max-w-4xl space-y-5">
        <SegmentedControl
          label="Seção do ativo"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary', label: 'Resumo' },
            { value: 'trades', label: 'Operações' },
            { value: 'dividends', label: 'Proventos' },
            { value: 'prices', label: 'Preços' },
          ]}
        />
        <SlideSwap index={['summary', 'trades', 'dividends', 'prices'].indexOf(tab)}>
          {tab === 'summary'
            ? summary
            : tab === 'trades'
              ? tradeList
              : tab === 'dividends'
                ? dividendList
                : prices}
        </SlideSwap>
      </div>

      <Sheet open={editing?.kind === 'asset'} onClose={close} title="Editar ativo">
        {editing?.kind === 'asset' && classes.data && (
          <AssetForm
            initial={asset}
            classes={classes.data}
            accounts={(accountList.data ?? []).filter(
              (item) => !item.isArchived || item.id === asset.accountId,
            )}
            submitting={assets.update.isPending}
            error={assets.update.error}
            onSubmit={async ({ ticker: _ticker, ...values }) => {
              await assets.update.mutateAsync({
                id: asset.id,
                ...values,
                name: values.name ?? asset.name,
              })
              toast({ message: 'Ativo atualizado' })
              close()
            }}
            extra={
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    assets.update.mutate(
                      { id: asset.id, isArchived: !asset.isArchived },
                      {
                        onSuccess: () => {
                          toast({
                            message: asset.isArchived
                              ? 'Ativo de volta à carteira'
                              : 'Ativo arquivado (histórico mantido)',
                          })
                          close()
                        },
                        onError,
                      },
                    )
                  }
                >
                  <Archive className="size-4" aria-hidden />{' '}
                  {asset.isArchived ? 'Desarquivar' : 'Arquivar'}
                </Button>
                <Button
                  variant="destructive"
                  loading={assets.remove.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Excluir ${assetLabel(asset)} com todas as operações e proventos?`,
                      )
                    )
                      return
                    assets.remove.mutate(asset.id, {
                      onSuccess: () => {
                        toast({ message: 'Ativo excluído' })
                        void navigate('/carteira')
                      },
                      onError,
                    })
                  }}
                >
                  Excluir
                </Button>
              </>
            }
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === 'price'}
        onClose={close}
        title={fixedIncome ? 'Saldo atual' : 'Informar preço'}
      >
        {editing?.kind === 'price' && (
          <div className="space-y-4">
            {fixedIncome ? (
              <MoneyInput
                label="Saldo que a corretora mostra"
                value={manualValue}
                onChange={setManualValue}
                large
                hint="Vale até o próximo balanço mensal."
              />
            ) : (
              <TextField
                label="Preço por cota (R$)"
                inputMode="decimal"
                value={priceText}
                onChange={(event) => setPriceText(event.target.value)}
                hint="Usado enquanto for mais recente que a cotação automática (RC-33)."
              />
            )}
            <Button
              block
              loading={assets.update.isPending}
              onClick={() =>
                assets.update.mutate(
                  fixedIncome
                    ? { id: asset.id, manualValueCents: manualValue }
                    : {
                        id: asset.id,
                        manualPrice: priceText.trim() ? priceText.trim().replace(',', '.') : null,
                      },
                  { onSuccess: () => close(), onError },
                )
              }
            >
              Salvar
            </Button>
            {(fixedIncome ? asset.manualValueCents !== null : asset.manualPrice !== null) && (
              <Button
                block
                variant="plain"
                onClick={() =>
                  assets.update.mutate(
                    fixedIncome
                      ? { id: asset.id, manualValueCents: null }
                      : { id: asset.id, manualPrice: null },
                    { onSuccess: () => close(), onError },
                  )
                }
              >
                {fixedIncome ? 'Limpar saldo informado' : 'Voltar a usar só a cotação'}
              </Button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === 'trade'}
        onClose={close}
        title={
          editing?.kind === 'trade' && editing.trade
            ? 'Editar operação'
            : editing?.kind === 'trade' && editing.preset?.kind === 'position_set'
              ? 'Ajustar posição'
              : 'Nova operação'
        }
      >
        {editing?.kind === 'trade' && (
          <TradeForm
            key={editing.trade?.id ?? editing.preset?.kind ?? 'new'}
            asset={asset}
            fixedIncome={fixedIncome}
            initial={editing.trade ?? undefined}
            preset={editing.preset}
            submitting={trades.create.isPending || trades.update.isPending}
            error={editing.trade ? trades.update.error : trades.create.error}
            onSubmit={async ({ assetId: _assetId, ...values }) => {
              if (editing.trade)
                await trades.update.mutateAsync({ id: editing.trade.id, ...values })
              else await trades.create.mutateAsync({ assetId: asset.id, ...values })
              toast({
                message: editing.trade
                  ? 'Operação atualizada'
                  : values.kind === 'position_set'
                    ? 'Posição ajustada'
                    : 'Operação registrada',
              })
              close()
            }}
            extra={
              editing.trade && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    const trade = editing.trade
                    if (!trade) return
                    trades.remove.mutate(trade.id, {
                      onSuccess: () => {
                        close()
                        toast({
                          message: 'Operação excluída',
                          action: {
                            label: 'Desfazer',
                            onClick: () => trades.restore.mutate(trade.id, { onError }),
                          },
                        })
                      },
                      onError,
                    })
                  }}
                >
                  Excluir
                </Button>
              )
            }
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === 'dividend'}
        onClose={close}
        title={
          editing?.kind === 'dividend' && editing.dividend ? 'Editar provento' : 'Novo provento'
        }
      >
        {editing?.kind === 'dividend' && (
          <DividendForm
            key={editing.dividend?.id ?? 'new'}
            assets={[asset]}
            assetId={asset.id}
            initial={editing.dividend ?? undefined}
            submitting={dividends.create.isPending || dividends.update.isPending}
            error={editing.dividend ? dividends.update.error : dividends.create.error}
            onSubmit={async ({ assetId: _assetId, ...values }) => {
              if (editing.dividend)
                await dividends.update.mutateAsync({ id: editing.dividend.id, ...values })
              else await dividends.create.mutateAsync({ assetId: asset.id, ...values })
              toast({ message: editing.dividend ? 'Provento atualizado' : 'Provento registrado' })
              close()
            }}
            extra={
              editing.dividend && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    const dividend = editing.dividend
                    if (!dividend) return
                    dividends.remove.mutate(dividend.id, {
                      onSuccess: () => {
                        close()
                        toast({
                          message: 'Provento excluído',
                          action: {
                            label: 'Desfazer',
                            onClick: () => dividends.restore.mutate(dividend.id, { onError }),
                          },
                        })
                      },
                      onError,
                    })
                  }}
                >
                  Excluir
                </Button>
              )
            }
          />
        )}
      </Sheet>
    </>
  )
}
