import {
  addMonths,
  computePosition,
  dateToIsoDate,
  isManualQuoteKind,
  isoDateToCompetenceMonth,
  isoDateToDate,
  lastMonths,
  PortfolioError,
  tradeTotalCents,
  type AssetClassKind,
} from '@orla/core'
import {
  createAssetClassRequestSchema,
  createAssetRequestSchema,
  createAssetTradeRequestSchema,
  createDividendRequestSchema,
  dividendBatchRequestSchema,
  putTargetAllocationsRequestSchema,
  updateAssetClassRequestSchema,
  updateAssetRequestSchema,
  updateAssetTradeRequestSchema,
  updateDividendRequestSchema,
  type AssetDetailResponse,
  type DividendsSummaryResponse,
  type ListResponse,
  type QuotesStatus,
} from '@orla/contracts'
import { Prisma, type PrismaClient } from '@orla/db'
import { Router } from 'express'
import { z } from 'zod'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber, ensureFound, paramId, withUniqueConflict } from '../lib/db.ts'
import { conflict, validationError } from '../lib/errors.ts'
import {
  autoTickers,
  buildPortfolio,
  ensureAssetClasses,
  loadClasses,
  loadPortfolioData,
  toAsset,
  toAssetClass,
  toDividend,
  toQuote,
  toTrade,
  tradeInput,
} from '../lib/portfolio.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'
import type { QuoteService } from '../services/quotes.ts'

/** Quantos tickers vencidos atualizar por abertura da carteira (o resto fica para a próxima). */
const BACKGROUND_REFRESH_LIMIT = 5
/** Botão "Atualizar": um pouco mais, mas ainda limitado (a validade do cache continua valendo). */
const MANUAL_REFRESH_LIMIT = 15

function fieldError(path: string, message: string): never {
  throw validationError(message, { fields: [{ path, message }] })
}

/** /asset-classes, /target-allocations, /assets, /asset-trades, /dividends, /portfolio, /quotes. */
export function portfolioRouter(prisma: PrismaClient, clock: Clock, quotes: QuoteService): Router {
  const router = Router()
  const today = () => clock.today()

  async function quotesStatus(pending: number): Promise<QuotesStatus> {
    return {
      provider: quotes.provider.name,
      enabled: quotes.provider.enabled,
      budgetLeft: await quotes.budgetLeft(),
      pending,
    }
  }

  const ownedClass = (userId: string, id: string) =>
    ensureFound(
      prisma.assetClass.findFirst({ where: { id, userId, deletedAt: null } }),
      'Classe não encontrada',
    )
  const ownedAsset = (userId: string, id: string) =>
    ensureFound(
      prisma.asset.findFirst({ where: { id, userId, deletedAt: null } }),
      'Ativo não encontrado',
    )

  type TradeRow = Prisma.AssetTradeGetPayload<object>
  const tradesOf = (assetId: string) =>
    prisma.assetTrade.findMany({
      where: { assetId, deletedAt: null },
      orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
    })

  /** Recalcula a posição com as operações propostas: venda acima da posição é erro (400). */
  async function assertPosition(assetId: string, change: (rows: TradeRow[]) => TradeRow[]) {
    try {
      computePosition(change(await tradesOf(assetId)).map(tradeInput))
    } catch (error) {
      if (error instanceof PortfolioError) fieldError('quantity', error.message)
      throw error
    }
  }

  // ─── Classes e metas ───────────────────────────────────────────────────────

  router.get('/asset-classes', async (req, res) => {
    const rows = await loadClasses(prisma, userIdOf(req))
    res.json({ data: rows.map(toAssetClass), nextCursor: null })
  })

  router.post('/asset-classes', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createAssetClassRequestSchema, req.body)
    await ensureAssetClasses(prisma, userId)
    const count = await prisma.assetClass.count({ where: { userId, deletedAt: null } })
    const row = await withUniqueConflict(
      prisma.assetClass.create({
        data: { ...input, userId, sortOrder: count },
        include: { targetAllocation: true },
      }),
      'Você já tem uma classe com esse nome.',
    )
    res.status(201).json(toAssetClass(row))
  })

  router.patch('/asset-classes/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ownedClass(userId, paramId(req))
    const input = parse(updateAssetClassRequestSchema, req.body)
    const row = await withUniqueConflict(
      prisma.assetClass.update({
        where: { id: current.id },
        data: input,
        include: { targetAllocation: true },
      }),
      'Você já tem uma classe com esse nome.',
    )
    res.json(toAssetClass(row))
  })

  router.delete('/asset-classes/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ownedClass(userId, paramId(req))
    const assets = await prisma.asset.count({
      where: { assetClassId: current.id, deletedAt: null },
    })
    if (assets > 0) throw conflict('Mova ou exclua os ativos desta classe antes')
    await prisma.$transaction([
      prisma.targetAllocation.deleteMany({ where: { assetClassId: current.id } }),
      prisma.assetClass.update({ where: { id: current.id }, data: { deletedAt: new Date() } }),
    ])
    res.status(204).end()
  })

  router.put('/target-allocations', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(putTargetAllocationsRequestSchema, req.body)
    const classes = await loadClasses(prisma, userId)
    const ids = new Set(classes.map((item) => item.id))
    for (const item of input.items)
      if (!ids.has(item.assetClassId)) fieldError('items', 'Classe não encontrada')
    await prisma.$transaction([
      prisma.targetAllocation.deleteMany({ where: { userId } }),
      prisma.targetAllocation.createMany({
        data: input.items
          .filter((item) => Number(item.targetPct) > 0 || item.maxPct !== null)
          .map((item) => ({
            userId,
            assetClassId: item.assetClassId,
            targetPct: item.targetPct,
            maxPct: item.maxPct,
          })),
      }),
    ])
    const rows = await loadClasses(prisma, userId)
    res.json({ data: rows.map(toAssetClass), nextCursor: null })
  })

  // ─── Ativos ────────────────────────────────────────────────────────────────

  router.get('/assets', async (req, res) => {
    const archived = req.query.archived === 'true'
    const rows = await prisma.asset.findMany({
      where: { userId: userIdOf(req), deletedAt: null, ...(archived ? {} : { isArchived: false }) },
      orderBy: [{ ticker: 'asc' }, { name: 'asc' }],
    })
    const body: ListResponse<ReturnType<typeof toAsset>> = {
      data: rows.map(toAsset),
      nextCursor: null,
    }
    res.json(body)
  })

  router.post('/assets', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createAssetRequestSchema, req.body)
    const assetClass = await ownedClass(userId, input.assetClassId)
    if (input.accountId) {
      await ensureFound(
        prisma.account.findFirst({ where: { id: input.accountId, userId, deletedAt: null } }),
        'Conta não encontrada',
      )
    }
    const manual = input.quoteMode
      ? input.quoteMode === 'manual'
      : isManualQuoteKind(assetClass.kind as AssetClassKind) || !input.ticker
    let name = input.name?.trim() || ''
    if (input.ticker && !manual) {
      // Valida na lista do provedor (em cache, 7 dias) quando ela existe (RC-10).
      const list = await quotes.tickerList()
      const known = list?.find((item) => item.ticker === input.ticker)
      if (list && !known) fieldError('ticker', `Ticker ${input.ticker} não encontrado na B3`)
      const cached = (await quotes.cached([input.ticker])).get(input.ticker)
      name ||= known?.name ?? cached?.name ?? input.ticker
    }
    const row = await withUniqueConflict(
      prisma.asset.create({
        data: {
          userId,
          assetClassId: assetClass.id,
          ticker: input.ticker ?? null,
          name: name || (input.ticker ?? 'Ativo'),
          accountId: input.accountId ?? null,
          quoteMode: manual ? 'manual' : 'auto',
          fixedIncomeInfo: (input.fixedIncomeInfo ?? undefined) as
            Prisma.InputJsonValue | undefined,
          targetWeightPct: input.targetWeightPct ?? null,
          maxWeightPct: input.maxWeightPct ?? null,
          ...(input.manualPrice && { manualPrice: input.manualPrice, manualPriceAt: clock.now() }),
          ...(input.manualValueCents != null && {
            manualValueCents: BigInt(input.manualValueCents),
            manualValueAt: clock.now(),
          }),
        },
      }),
      'Esse ticker já está cadastrado nessa corretora.',
    )
    if (row.ticker && row.quoteMode === 'auto') quotes.refreshInBackground([row.ticker], 1)
    res.status(201).json(toAsset(row))
  })

  router.patch('/assets/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ownedAsset(userId, paramId(req))
    const input = parse(updateAssetRequestSchema, req.body)
    if (input.assetClassId) await ownedClass(userId, input.assetClassId)
    if (input.accountId) {
      await ensureFound(
        prisma.account.findFirst({ where: { id: input.accountId, userId, deletedAt: null } }),
        'Conta não encontrada',
      )
    }
    const now = clock.now()
    const row = await prisma.asset.update({
      where: { id: current.id },
      data: {
        ...(input.assetClassId && { assetClassId: input.assetClassId }),
        ...(input.name && { name: input.name }),
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.quoteMode && { quoteMode: input.quoteMode }),
        ...(input.fixedIncomeInfo !== undefined && {
          fixedIncomeInfo: (input.fixedIncomeInfo ?? null) as Prisma.InputJsonValue,
        }),
        ...(input.targetWeightPct !== undefined && { targetWeightPct: input.targetWeightPct }),
        ...(input.maxWeightPct !== undefined && { maxWeightPct: input.maxWeightPct }),
        ...(input.manualPrice !== undefined && {
          manualPrice: input.manualPrice,
          manualPriceAt: input.manualPrice === null ? null : now,
        }),
        ...(input.manualValueCents !== undefined && {
          manualValueCents: input.manualValueCents === null ? null : BigInt(input.manualValueCents),
          manualValueAt: input.manualValueCents === null ? null : now,
        }),
        ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
      },
    })
    res.json(toAsset(row))
  })

  router.delete('/assets/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ownedAsset(userId, paramId(req))
    const now = new Date()
    await prisma.$transaction([
      prisma.assetTrade.updateMany({
        where: { assetId: current.id, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.dividend.updateMany({
        where: { assetId: current.id, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.asset.update({ where: { id: current.id }, data: { deletedAt: now } }),
    ])
    res.status(204).end()
  })

  router.get('/assets/:id', async (req, res) => {
    const userId = userIdOf(req)
    const asset = await ownedAsset(userId, paramId(req))
    const data = await loadPortfolioData(prisma, userId, asset.id)
    const tickers = autoTickers(data)
    const cache = await quotes.cached(tickers)
    const portfolio = buildPortfolio(data, cache, await quotesStatus(0), today())
    const position = portfolio.positions.find((item) => item.asset.id === asset.id)
    const full = data.assets.find((item) => item.id === asset.id)
    const assetClass = data.classes.find((item) => item.id === asset.assetClassId)
    if (!position || !full || !assetClass) throw conflict('Ativo indisponível')
    if (asset.ticker && asset.quoteMode === 'auto') quotes.refreshInBackground([asset.ticker], 1)
    const quote = asset.ticker ? cache.get(asset.ticker) : undefined
    const body: AssetDetailResponse = {
      position,
      assetClass: toAssetClass(assetClass),
      quote: quote ? toQuote(quote) : null,
      trades: [...full.trades].reverse().map(toTrade),
      dividends: full.dividends.map(toDividend),
      dividendsTotalCents: full.dividends.reduce(
        (sum, item) => sum + centsToNumber(item.amountCents),
        0,
      ),
    }
    res.json(body)
  })

  // ─── Operações ─────────────────────────────────────────────────────────────

  router.get('/asset-trades', async (req, res) => {
    const assetId = z.uuid().optional().safeParse(req.query.assetId)
    const rows = await prisma.assetTrade.findMany({
      where: {
        userId: userIdOf(req),
        deletedAt: null,
        ...(assetId.success && assetId.data && { assetId: assetId.data }),
      },
      orderBy: [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })
    res.json({ data: rows.map(toTrade), nextCursor: null })
  })

  router.post('/asset-trades', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createAssetTradeRequestSchema, req.body)
    const asset = await ownedAsset(userId, input.assetId)
    if ((input.kind === 'split' || input.kind === 'reverse_split') && !input.splitRatio) {
      fieldError('splitRatio', 'Informe a proporção (ex.: 10 para 1:10)')
    }
    const totalCents =
      input.totalCents ??
      (input.kind === 'sell'
        ? Math.max(0, tradeTotalCents(input.quantity, input.unitPrice, 0) - input.feesCents)
        : tradeTotalCents(input.quantity, input.unitPrice, input.feesCents))
    const data = {
      userId,
      assetId: asset.id,
      kind: input.kind,
      tradeDate: isoDateToDate(input.tradeDate),
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      feesCents: BigInt(input.feesCents),
      totalCents: BigInt(totalCents),
      splitRatio: input.splitRatio ?? null,
      notes: input.notes ?? null,
    }
    const draft = {
      ...data,
      id: 'new',
      quantity: new Prisma.Decimal(data.quantity),
      unitPrice: new Prisma.Decimal(data.unitPrice),
      splitRatio: data.splitRatio === null ? null : new Prisma.Decimal(data.splitRatio),
      contributionPlanId: null,
      source: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } satisfies TradeRow
    await assertPosition(asset.id, (rows) => [...rows, draft])
    const row = await prisma.assetTrade.create({ data })
    res.status(201).json(toTrade(row))
  })

  router.patch('/asset-trades/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.assetTrade.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Operação não encontrada',
    )
    const input = parse(updateAssetTradeRequestSchema, req.body)
    const quantity = input.quantity ?? current.quantity.toString()
    const unitPrice = input.unitPrice ?? current.unitPrice.toString()
    const fees = input.feesCents ?? centsToNumber(current.feesCents)
    const kind = input.kind ?? current.kind
    const recompute =
      input.quantity !== undefined || input.unitPrice !== undefined || input.feesCents !== undefined
    const totalCents =
      input.totalCents ??
      (recompute
        ? kind === 'sell'
          ? Math.max(0, tradeTotalCents(quantity, unitPrice, 0) - fees)
          : tradeTotalCents(quantity, unitPrice, fees)
        : centsToNumber(current.totalCents))
    const data = {
      kind,
      tradeDate: input.tradeDate ? isoDateToDate(input.tradeDate) : current.tradeDate,
      quantity,
      unitPrice,
      feesCents: BigInt(fees),
      totalCents: BigInt(totalCents),
      splitRatio: input.splitRatio === undefined ? current.splitRatio : input.splitRatio,
      notes: input.notes === undefined ? current.notes : input.notes,
    }
    await assertPosition(current.assetId, (rows) =>
      rows.map((row) =>
        row.id === current.id
          ? {
              ...row,
              ...data,
              quantity: new Prisma.Decimal(data.quantity),
              unitPrice: new Prisma.Decimal(data.unitPrice),
              splitRatio: data.splitRatio === null ? null : new Prisma.Decimal(data.splitRatio),
            }
          : row,
      ),
    )
    const row = await prisma.assetTrade.update({ where: { id: current.id }, data })
    res.json(toTrade(row))
  })

  router.delete('/asset-trades/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.assetTrade.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Operação não encontrada',
    )
    await assertPosition(current.assetId, (rows) => rows.filter((row) => row.id !== current.id))
    await prisma.assetTrade.update({ where: { id: current.id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.post('/asset-trades/:id/restore', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.assetTrade.findFirst({
        where: { id: paramId(req), userId, deletedAt: { not: null } },
      }),
      'Operação não encontrada',
    )
    const row = await prisma.assetTrade.update({
      where: { id: current.id },
      data: { deletedAt: null },
    })
    res.json(toTrade(row))
  })

  // ─── Proventos ─────────────────────────────────────────────────────────────

  router.get('/dividends', async (req, res) => {
    const query = z
      .object({
        assetId: z.uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(req.query)
    const rows = await prisma.dividend.findMany({
      where: {
        userId: userIdOf(req),
        deletedAt: null,
        ...(query.assetId && { assetId: query.assetId }),
        ...((query.from || query.to) && {
          payDate: {
            ...(query.from && { gte: isoDateToDate(`${query.from}-01`) }),
            ...(query.to && { lt: isoDateToDate(`${addMonths(query.to, 1)}-01`) }),
          },
        }),
      },
      orderBy: [{ payDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    })
    res.json({ data: rows.map(toDividend), nextCursor: null })
  })

  router.get('/dividends/summary', async (req, res) => {
    const userId = userIdOf(req)
    const current = isoDateToCompetenceMonth(today())
    const months = lastMonths(current, 12)
    const year = current.slice(0, 4)
    const rows = await prisma.dividend.findMany({
      where: { userId, deletedAt: null, payDate: { gte: isoDateToDate(`${months[0]}-01`) } },
      include: { asset: { select: { assetClassId: true } } },
    })
    const byMonth = new Map(
      months.map((month) => [month, { amountCents: 0, byClass: {} as Record<string, number> }]),
    )
    const byAsset = new Map<string, number>()
    let yearTotal = 0
    for (const row of rows) {
      const date = dateToIsoDate(row.payDate)
      if (date > today()) continue
      const month = isoDateToCompetenceMonth(date)
      const amount = centsToNumber(row.amountCents)
      const entry = byMonth.get(month)
      if (entry) {
        entry.amountCents += amount
        entry.byClass[row.asset.assetClassId] =
          (entry.byClass[row.asset.assetClassId] ?? 0) + amount
        byAsset.set(row.assetId, (byAsset.get(row.assetId) ?? 0) + amount)
      }
      if (month.startsWith(year)) yearTotal += amount
    }
    const top = [...byAsset.entries()].sort((a, b) => b[1] - a[1])[0]
    const total12 = [...byMonth.values()].reduce((sum, item) => sum + item.amountCents, 0)
    const body: DividendsSummaryResponse = {
      months: months.map((month) => ({
        month,
        ...(byMonth.get(month) as { amountCents: number; byClass: Record<string, number> }),
      })),
      yearTotalCents: yearTotal,
      average12mCents: Math.round(total12 / 12),
      topPayer: top ? { assetId: top[0], amountCents: top[1] } : null,
    }
    res.json(body)
  })

  router.post('/dividends', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createDividendRequestSchema, req.body)
    const asset = await ownedAsset(userId, input.assetId)
    const row = await prisma.dividend.create({
      data: {
        userId,
        assetId: asset.id,
        kind: input.kind,
        payDate: isoDateToDate(input.payDate),
        exDate: input.exDate ? isoDateToDate(input.exDate) : null,
        amountCents: BigInt(input.amountCents),
        grossCents: input.grossCents ? BigInt(input.grossCents) : null,
        quantityBase: input.quantityBase ?? null,
        perShare: input.perShare ?? null,
        notes: input.notes ?? null,
      },
    })
    res.status(201).json(toDividend(row))
  })

  router.post('/dividends/batch', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(dividendBatchRequestSchema, req.body)
    const ids = [...new Set(input.items.map((item) => item.assetId))]
    const owned = await prisma.asset.count({ where: { id: { in: ids }, userId, deletedAt: null } })
    if (owned !== ids.length) fieldError('items', 'Ativo não encontrado')
    const rows = await prisma.dividend.createManyAndReturn({
      data: input.items.map((item) => ({
        userId,
        assetId: item.assetId,
        kind: item.kind,
        payDate: isoDateToDate(input.payDate),
        amountCents: BigInt(item.amountCents),
      })),
    })
    res.status(201).json({ data: rows.map(toDividend), nextCursor: null })
  })

  router.patch('/dividends/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.dividend.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Provento não encontrado',
    )
    const input = parse(updateDividendRequestSchema, req.body)
    const row = await prisma.dividend.update({
      where: { id: current.id },
      data: {
        ...(input.kind && { kind: input.kind }),
        ...(input.payDate && { payDate: isoDateToDate(input.payDate) }),
        ...(input.exDate !== undefined && {
          exDate: input.exDate ? isoDateToDate(input.exDate) : null,
        }),
        ...(input.amountCents !== undefined && { amountCents: BigInt(input.amountCents) }),
        ...(input.grossCents !== undefined && {
          grossCents: input.grossCents ? BigInt(input.grossCents) : null,
        }),
        ...(input.quantityBase !== undefined && { quantityBase: input.quantityBase }),
        ...(input.perShare !== undefined && { perShare: input.perShare }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    })
    res.json(toDividend(row))
  })

  router.delete('/dividends/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.dividend.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Provento não encontrado',
    )
    await prisma.dividend.update({ where: { id: current.id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.post('/dividends/:id/restore', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.dividend.findFirst({ where: { id: paramId(req), userId, deletedAt: { not: null } } }),
      'Provento não encontrado',
    )
    const row = await prisma.dividend.update({
      where: { id: current.id },
      data: { deletedAt: null },
    })
    res.json(toDividend(row))
  })

  // ─── Posição e cotações ────────────────────────────────────────────────────

  /** Carteira com as cotações do cache; vencidas atualizam em segundo plano (RC-31). */
  router.get('/portfolio', async (req, res) => {
    const userId = userIdOf(req)
    const data = await loadPortfolioData(prisma, userId)
    const tickers = autoTickers(data)
    const stale = quotes.provider.enabled ? await quotes.stale(tickers) : []
    quotes.refreshInBackground(stale, BACKGROUND_REFRESH_LIMIT)
    const cache = await quotes.cached(tickers)
    res.json(buildPortfolio(data, cache, await quotesStatus(stale.length), today()))
  })

  /** Botão "Atualizar": busca agora só o que venceu (o cache continua mandando). */
  router.post('/quotes/refresh', async (req, res) => {
    const data = await loadPortfolioData(prisma, userIdOf(req))
    const result = await quotes.refresh(autoTickers(data), MANUAL_REFRESH_LIMIT)
    res.json({ ...(await quotesStatus(result.pending)), refreshed: result.refreshed })
  })

  router.get('/tickers/search', async (req, res) => {
    const q = z.string().trim().min(1).max(20).safeParse(req.query.q)
    if (!q.success) {
      res.json({ results: [], providerAvailable: quotes.provider.enabled })
      return
    }
    res.json(await quotes.search(q.data))
  })

  return router
}
