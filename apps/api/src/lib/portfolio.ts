import {
  allocation,
  dateToIsoDate,
  computePosition,
  DEFAULT_ASSET_CLASSES,
  dividendsLast12Months,
  type DividendLike,
  PortfolioError,
  targetsTotal,
  type TradeInput,
  valuate,
  weights,
  yieldOnCost,
} from '@orla/core'
import type {
  Asset,
  AssetClass,
  AssetTrade,
  Dividend,
  PortfolioResponse,
  Position,
  Quote,
  QuotesStatus,
} from '@orla/contracts'
import type { Prisma } from '@orla/db'
import { centsToNumber, toIso } from './db.ts'
import type { Db } from './finance.ts'
import type { QuoteRow } from '../services/quotes.ts'

// ─── Conversões banco → contrato ─────────────────────────────────────────────

type ClassRow = Prisma.AssetClassGetPayload<{ include: { targetAllocation: true } }>
type AssetRow = Prisma.AssetGetPayload<object>
type TradeRow = Prisma.AssetTradeGetPayload<object>
type DividendRow = Prisma.DividendGetPayload<object>

const decimal = (value: Prisma.Decimal | null): string | null =>
  value === null ? null : value.toString()

export function toAssetClass(row: ClassRow): AssetClass {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as AssetClass['kind'],
    color: row.color,
    sortOrder: row.sortOrder,
    targetPct: decimal(row.targetAllocation?.targetPct ?? null),
    maxPct: decimal(row.targetAllocation?.maxPct ?? null),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    assetClassId: row.assetClassId,
    ticker: row.ticker,
    name: row.name,
    accountId: row.accountId,
    quoteMode: row.quoteMode as Asset['quoteMode'],
    fixedIncomeInfo: (row.fixedIncomeInfo as Asset['fixedIncomeInfo']) ?? null,
    targetWeightPct: decimal(row.targetWeightPct),
    maxWeightPct: decimal(row.maxWeightPct),
    manualPrice: decimal(row.manualPrice),
    manualPriceAt: row.manualPriceAt ? toIso(row.manualPriceAt) : null,
    manualValueCents: centsToNumber(row.manualValueCents),
    manualValueAt: row.manualValueAt ? toIso(row.manualValueAt) : null,
    isArchived: row.isArchived,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toTrade(row: TradeRow): AssetTrade {
  return {
    id: row.id,
    assetId: row.assetId,
    kind: row.kind as AssetTrade['kind'],
    tradeDate: dateToIsoDate(row.tradeDate),
    quantity: row.quantity.toString(),
    unitPrice: row.unitPrice.toString(),
    feesCents: centsToNumber(row.feesCents),
    totalCents: centsToNumber(row.totalCents),
    splitRatio: decimal(row.splitRatio),
    notes: row.notes,
    source: row.source,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toDividend(row: DividendRow): Dividend {
  return {
    id: row.id,
    assetId: row.assetId,
    kind: row.kind as Dividend['kind'],
    payDate: dateToIsoDate(row.payDate),
    exDate: row.exDate ? dateToIsoDate(row.exDate) : null,
    amountCents: centsToNumber(row.amountCents),
    grossCents: row.grossCents === null ? null : centsToNumber(row.grossCents),
    quantityBase: decimal(row.quantityBase),
    perShare: decimal(row.perShare),
    notes: row.notes,
    source: row.source,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toQuote(row: QuoteRow): Quote {
  return {
    ticker: row.ticker,
    price: decimal(row.price),
    changePct: row.changePct === null ? null : Number(row.changePct),
    name: row.name,
    quotedAt: row.quotedAt ? toIso(row.quotedAt) : null,
    fetchedAt: row.price ? toIso(row.fetchedAt) : null,
    error: row.error,
  }
}

export function tradeInput(row: TradeRow): TradeInput {
  return {
    kind: row.kind as TradeInput['kind'],
    date: dateToIsoDate(row.tradeDate),
    quantity: row.quantity.toString(),
    unitPrice: row.unitPrice.toString(),
    feesCents: centsToNumber(row.feesCents),
    totalCents: centsToNumber(row.totalCents),
    splitRatio: row.splitRatio?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// ─── Classes padrão ──────────────────────────────────────────────────────────

/** RC-01: cria as classes padrão para quem ainda não tem nenhuma (cadastro ou usuário antigo). */
export async function ensureAssetClasses(db: Db, userId: string): Promise<void> {
  const count = await db.assetClass.count({ where: { userId } })
  if (count > 0) return
  await db.assetClass.createMany({
    data: DEFAULT_ASSET_CLASSES.map((item, index) => ({ userId, ...item, sortOrder: index })),
  })
}

export async function loadClasses(db: Db, userId: string): Promise<ClassRow[]> {
  await ensureAssetClasses(db, userId)
  return db.assetClass.findMany({
    where: { userId, deletedAt: null },
    include: { targetAllocation: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

// ─── Posição completa ────────────────────────────────────────────────────────

interface PriceChoice {
  price: string | null
  source: Position['priceSource']
  at: string | null
  changePct: number | null
  manualValueCents: number | null
}

/** Preço exibido: saldo informado (manual) ou o mais recente entre cotação e preço à mão (RC-33). */
export function choosePrice(asset: AssetRow, quote: QuoteRow | undefined): PriceChoice {
  if (asset.quoteMode === 'manual' && asset.manualValueCents !== null) {
    return {
      price: null,
      source: 'manual_value',
      at: asset.manualValueAt ? toIso(asset.manualValueAt) : null,
      changePct: null,
      manualValueCents: centsToNumber(asset.manualValueCents),
    }
  }
  const quoteAt = quote?.price ? (quote.quotedAt ?? quote.fetchedAt) : null
  const manualAt = asset.manualPrice ? asset.manualPriceAt : null
  if (
    asset.quoteMode === 'auto' &&
    quote?.price &&
    (!manualAt || (quoteAt && quoteAt > manualAt))
  ) {
    return {
      price: quote.price.toString(),
      source: 'quote',
      at: quoteAt ? toIso(quoteAt) : null,
      changePct: quote.changePct === null ? null : Number(quote.changePct),
      manualValueCents: null,
    }
  }
  if (asset.manualPrice) {
    return {
      price: asset.manualPrice.toString(),
      source: 'manual_price',
      at: manualAt ? toIso(manualAt) : null,
      changePct: null,
      manualValueCents: null,
    }
  }
  return { price: null, source: 'cost', at: null, changePct: null, manualValueCents: null }
}

export interface PortfolioData {
  classes: ClassRow[]
  assets: (AssetRow & { trades: TradeRow[]; dividends: DividendRow[] })[]
}

export async function loadPortfolioData(
  db: Db,
  userId: string,
  assetId?: string,
): Promise<PortfolioData> {
  const [classes, assets] = await Promise.all([
    loadClasses(db, userId),
    db.asset.findMany({
      where: { userId, deletedAt: null, ...(assetId ? {} : { isArchived: false }) },
      include: {
        trades: {
          where: { deletedAt: null },
          orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
        },
        dividends: { where: { deletedAt: null }, orderBy: { payDate: 'desc' } },
      },
      orderBy: [{ ticker: 'asc' }, { name: 'asc' }],
    }),
  ])
  // O detalhe de um ativo arquivado também precisa dele na conta.
  return {
    classes,
    assets: assetId ? assets.filter((item) => !item.isArchived || item.id === assetId) : assets,
  }
}

/** Calcula a carteira inteira a partir das operações, proventos e cotações em cache. */
export function buildPortfolio(
  data: PortfolioData,
  quotes: Map<string, QuoteRow>,
  status: QuotesStatus,
  today: string,
): PortfolioResponse {
  const positions: Position[] = []
  for (const asset of data.assets) {
    let error: string | null = null
    let position
    try {
      position = computePosition(
        data.assets.find((item) => item.id === asset.id)?.trades.map(tradeInput) ?? [],
      )
    } catch (caught) {
      error = caught instanceof PortfolioError ? caught.message : 'Erro ao calcular a posição'
      position = computePosition([])
    }
    const choice = choosePrice(asset, asset.ticker ? quotes.get(asset.ticker) : undefined)
    const valuation = valuate({
      quantity: position.quantity.toString(),
      costCents: position.costCents,
      price: choice.price,
      manualValueCents: choice.manualValueCents,
    })
    const dividendLikes: DividendLike[] = asset.dividends.map((item) => ({
      assetId: asset.id,
      payDate: dateToIsoDate(item.payDate),
      amountCents: centsToNumber(item.amountCents),
    }))
    const dividends12m = dividendsLast12Months(dividendLikes, today)
    positions.push({
      asset: toAsset(asset),
      quantity: position.quantity.toString(),
      avgPrice: position.avgPrice.toDecimalPlaces(8).toString(),
      costCents: position.costCents,
      realizedPnlCents: position.realizedPnlCents,
      price: choice.price,
      priceSource: choice.source,
      priceAt: choice.at,
      changePct: choice.changePct,
      valueCents: valuation.valueCents,
      resultCents: valuation.resultCents,
      resultPct: valuation.resultPct,
      weightInClass: 0,
      weightInPortfolio: 0,
      dividends12mCents: dividends12m,
      yieldOnCost: yieldOnCost(dividends12m, position.costCents),
      error,
    })
  }

  const weightMap = weights(
    positions.map((item) => ({
      id: item.asset.id,
      classId: item.asset.assetClassId,
      valueCents: item.valueCents,
    })),
  )
  for (const item of positions) {
    const weight = weightMap.get(item.asset.id)
    item.weightInClass = weight?.inClass ?? 0
    item.weightInPortfolio = weight?.inPortfolio ?? 0
  }

  const targets = data.classes
    .filter((item) => item.targetAllocation)
    .map((item) => ({
      classId: item.id,
      targetPct: item.targetAllocation?.targetPct.toString() ?? '0',
      maxPct: item.targetAllocation?.maxPct?.toString() ?? null,
    }))
  const sums = (classId: string, key: 'valueCents' | 'costCents' | 'resultCents') =>
    positions
      .filter((item) => item.asset.assetClassId === classId)
      .reduce((sum, item) => sum + item[key], 0)
  const rows = allocation(
    data.classes.map((item) => ({ classId: item.id, valueCents: sums(item.id, 'valueCents') })),
    targets,
  )
  const classes = rows.map((row) => {
    const assetClass = data.classes.find((item) => item.id === row.classId) as ClassRow
    return {
      ...row,
      assetClass: toAssetClass(assetClass),
      costCents: sums(row.classId, 'costCents'),
      resultCents: sums(row.classId, 'resultCents'),
    }
  })

  const totalValue = positions.reduce((sum, item) => sum + item.valueCents, 0)
  const totalCost = positions.reduce((sum, item) => sum + item.costCents, 0)
  const dayChange = positions.reduce((sum, item) => {
    if (item.changePct === null || item.priceSource !== 'quote') return sum
    return sum + Math.round(item.valueCents - item.valueCents / (1 + item.changePct / 100))
  }, 0)
  const quotedAts = positions
    .filter((item) => item.priceSource === 'quote' && item.priceAt)
    .map((item) => item.priceAt as string)

  const alerts: PortfolioResponse['alerts'] = []
  for (const row of classes) {
    if (row.offTarget && row.deviationPp !== null) {
      alerts.push({
        kind: 'off_target',
        message: `${row.assetClass.name} está ${Math.abs(row.deviationPp).toFixed(1).replace('.', ',')} p.p. ${row.deviationPp > 0 ? 'acima' : 'abaixo'} da meta`,
      })
    }
    if (row.aboveMax)
      alerts.push({ kind: 'above_max', message: `${row.assetClass.name} passou do teto da classe` })
  }
  for (const item of positions) {
    const max = item.asset.maxWeightPct ? Number(item.asset.maxWeightPct) / 100 : null
    if (max !== null && item.weightInPortfolio > max) {
      alerts.push({
        kind: 'asset_above_max',
        message: `${item.asset.ticker ?? item.asset.name} passou do teto na carteira`,
      })
    }
    if (item.error)
      alerts.push({
        kind: 'position_error',
        message: `${item.asset.ticker ?? item.asset.name}: ${item.error}`,
      })
  }

  return {
    totals: {
      valueCents: totalValue,
      costCents: totalCost,
      resultCents: totalValue - totalCost,
      resultPct: totalCost > 0 ? (totalValue - totalCost) / totalCost : null,
      dividends12mCents: positions.reduce((sum, item) => sum + item.dividends12mCents, 0),
      dayChangeCents: dayChange,
    },
    classes,
    positions,
    targetsTotalPct: targetsTotal(targets).toString(),
    quotes: status,
    oldestQuoteAt: quotedAts.length > 0 ? (quotedAts.sort()[0] ?? null) : null,
    alerts,
  }
}

/** Tickers com cotação automática (ativos não arquivados). */
export function autoTickers(data: PortfolioData): string[] {
  return [
    ...new Set(
      data.assets
        .filter((item) => item.quoteMode === 'auto' && item.ticker && !item.isArchived)
        .map((item) => item.ticker as string),
    ),
  ]
}
