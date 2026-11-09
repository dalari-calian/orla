import {
  balanceItemValue,
  balanceSeries,
  competenceMonthToDate,
  computePosition,
  dateInMonth,
  dateToIsoDate,
  flowsInPeriod,
  isCompetenceMonth,
  isoDateToDate,
  observedPrices,
  PortfolioError,
  sumFlows,
  yearSummary,
  type BalancePoint,
  type ContributionTiming,
  type Flow,
} from '@orla/core'
import {
  saveBalanceRequestSchema,
  type Balance,
  type BalanceFormResponse,
  type BalanceFormRow,
  type BalancesResponse,
  type ObservedPriceValue,
} from '@orla/contracts'
import type { Prisma, PrismaClient } from '@orla/db'
import { Router } from 'express'
import { z } from 'zod'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber, ensureFound, paramId, toIso } from '../lib/db.ts'
import { conflict, validationError } from '../lib/errors.ts'
import {
  autoTickers,
  buildPortfolio,
  choosePrice,
  loadPortfolioData,
  tradeInput,
} from '../lib/portfolio.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'
import type { QuoteService } from '../services/quotes.ts'

type BalanceRow = Prisma.BalanceGetPayload<{ include: { items: true } }>

const monthOf = (date: Date) => dateToIsoDate(date).slice(0, 7)
const decimalOrNull = (value: Prisma.Decimal | null) => (value === null ? null : value.toString())

function toBalance(row: BalanceRow): Balance {
  return {
    id: row.id,
    competenceMonth: monthOf(row.competenceMonth),
    referenceDate: dateToIsoDate(row.referenceDate),
    totalCents: centsToNumber(row.totalCents),
    contributionsCents: centsToNumber(row.contributionsCents),
    dividendsCents: centsToNumber(row.dividendsCents),
    notes: row.notes,
    status: row.status as Balance['status'],
    closedAt: row.closedAt ? toIso(row.closedAt) : null,
    source: row.source,
    items: [...row.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        kind: item.kind as 'asset' | 'cash',
        assetId: item.assetId,
        assetClassId: item.assetClassId,
        accountId: item.accountId,
        label: item.label,
        ticker: item.ticker,
        quantity: decimalOrNull(item.quantity),
        price: decimalOrNull(item.price),
        valueCents: centsToNumber(item.valueCents),
        dy: decimalOrNull(item.dy),
        pvp: decimalOrNull(item.pvp),
        sortOrder: item.sortOrder,
      })),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const monthQuerySchema = z.object({
  month: z.string().refine(isCompetenceMonth, 'Mês inválido (use AAAA-MM)'),
  date: z.iso.date().optional(),
})

/**
 * /balances (docs/07): série com rentabilidade real, formulário pré-preenchido, salvar,
 * fechar/reabrir e preços observados (RB-30). O cálculo é do core (`balance`).
 */
export function balancesRouter(prisma: PrismaClient, clock: Clock, quotes: QuoteService): Router {
  const router = Router()
  const include = { items: true } as const

  async function settingsOf(userId: string) {
    const row = await prisma.userSettings.findUnique({ where: { userId } })
    const timing = (['end', 'start', 'dietz'] as const).find(
      (item) => item === row?.contributionTiming,
    )
    return {
      timing: (timing ?? 'end') as ContributionTiming,
      source: (row?.returnContributionSource === 'trades' ? 'trades' : 'contributions') as
        'trades' | 'contributions',
    }
  }

  /** RB-11: aportes (contributions) ou, se configurado, compras − vendas. */
  async function loadFlows(userId: string, source: 'trades' | 'contributions'): Promise<Flow[]> {
    if (source === 'contributions') {
      const rows = await prisma.contribution.findMany({ where: { userId, deletedAt: null } })
      return rows.map((row) => ({
        date: dateToIsoDate(row.date),
        amountCents: centsToNumber(row.amountCents),
      }))
    }
    const trades = await prisma.assetTrade.findMany({
      where: {
        userId,
        deletedAt: null,
        kind: {
          in: ['buy', 'subscription', 'fixed_income_deposit', 'sell', 'fixed_income_withdrawal'],
        },
        asset: { deletedAt: null },
      },
    })
    return trades.map((row) => ({
      date: dateToIsoDate(row.tradeDate),
      amountCents:
        (row.kind === 'sell' || row.kind === 'fixed_income_withdrawal' ? -1 : 1) *
        centsToNumber(row.totalCents),
    }))
  }

  async function loadDividendFlows(userId: string): Promise<Flow[]> {
    const rows = await prisma.dividend.findMany({
      where: { userId, deletedAt: null, asset: { deletedAt: null } },
    })
    return rows.map((row) => ({
      date: dateToIsoDate(row.payDate),
      amountCents: centsToNumber(row.amountCents),
    }))
  }

  async function series(userId: string) {
    const { timing, source } = await settingsOf(userId)
    const [rows, flows, dividends] = await Promise.all([
      prisma.balance.findMany({
        where: { userId, deletedAt: null },
        orderBy: { referenceDate: 'asc' },
      }),
      loadFlows(userId, source),
      loadDividendFlows(userId),
    ])
    const points: BalancePoint[] = rows.map((row, index) => {
      const previous = index > 0 ? rows[index - 1] : undefined
      const date = dateToIsoDate(row.referenceDate)
      const liveDividends = previous
        ? sumFlows(flowsInPeriod(dividends, dateToIsoDate(previous.referenceDate), date))
        : 0
      return {
        id: row.id,
        competenceMonth: monthOf(row.competenceMonth),
        referenceDate: date,
        totalCents: centsToNumber(row.totalCents),
        dividendsCents:
          row.status === 'closed' && row.dividendsCents !== null
            ? centsToNumber(row.dividendsCents)
            : liveDividends,
        frozenContributionsCents:
          row.status === 'closed' && previous ? centsToNumber(row.contributionsCents) : null,
      }
    })
    const statusOf = new Map(rows.map((row) => [row.id, row.status]))
    return {
      rows: balanceSeries(points, flows, timing),
      timing,
      source,
      statusOf,
      flows,
      dividends,
    }
  }

  router.get('/balances', async (req, res) => {
    const userId = userIdOf(req)
    const { rows, timing, source, statusOf } = await series(userId)
    const settings = await prisma.userSettings.findUnique({ where: { userId } })
    const planned = centsToNumber(settings?.defaultSavingsGoalCents ?? null) ?? 0
    const years = [...new Set(rows.map((row) => row.referenceDate.slice(0, 4)))].sort()
    const currentMonth = clock.currentMonth()
    const body: BalancesResponse = {
      data: rows.map((row) => ({
        id: row.id,
        competenceMonth: row.competenceMonth,
        referenceDate: row.referenceDate,
        status: statusOf.get(row.id) === 'closed' ? 'closed' : 'draft',
        totalCents: row.totalCents,
        previousTotalCents: row.previousTotalCents,
        contributionsCents: row.contributionsCents,
        dividendsCents: row.dividendsCents,
        gainCents: row.gainCents,
        rate: row.rate,
        cumulative: row.cumulative,
        yearCumulative: row.yearCumulative,
        investedCents: row.investedCents,
        contributionsChanged: row.contributionsChanged,
      })),
      years: years.map((year) => yearSummary(rows, year, planned)),
      settings: { contributionTiming: timing, returnContributionSource: source },
      currentMonth,
      currentMonthDone: rows.some((row) => row.competenceMonth === currentMonth),
    }
    res.json(body)
  })

  /** RB-02: linhas pré-preenchidas (ativos ativos + saldo em conta por corretora). */
  router.get('/balances/form', async (req, res) => {
    const userId = userIdOf(req)
    const query = parse(monthQuerySchema, req.query)
    const month = query.month
    const balance = await prisma.balance.findFirst({
      where: { userId, deletedAt: null, competenceMonth: competenceMonthToDate(month) },
      include,
    })
    const today = clock.today()
    const date =
      query.date ??
      (balance
        ? dateToIsoDate(balance.referenceDate)
        : month === clock.currentMonth()
          ? today
          : dateInMonth(month, 31))
    const previous = await prisma.balance.findFirst({
      where: {
        userId,
        deletedAt: null,
        referenceDate: { lt: isoDateToDate(date) },
        ...(balance && { id: { not: balance.id } }),
      },
      orderBy: { referenceDate: 'desc' },
      include,
    })
    const { timing, source } = await settingsOf(userId)
    const [flows, dividends, data, accounts] = await Promise.all([
      loadFlows(userId, source),
      loadDividendFlows(userId),
      loadPortfolioData(prisma, userId),
      prisma.account.findMany({ where: { userId, deletedAt: null } }),
    ])
    const cache = await quotes.cached(autoTickers(data))
    const prevDate = previous ? dateToIsoDate(previous.referenceDate) : null
    const periodFlows = flowsInPeriod(flows, prevDate, date)
    const saved = new Map(
      (balance?.items ?? []).map((item) => [
        item.kind === 'cash' ? `cash:${item.accountId}` : item.assetId,
        item,
      ]),
    )
    const before = new Map(
      (previous?.items ?? []).map((item) => [
        item.kind === 'cash' ? `cash:${item.accountId}` : item.assetId,
        centsToNumber(item.valueCents),
      ]),
    )
    const classOrder = new Map(data.classes.map((item, index) => [item.id, index]))
    const kindOf = new Map(data.classes.map((item) => [item.id, item.kind]))
    const accountName = new Map(accounts.map((item) => [item.id, item.name]))

    const rows: BalanceFormRow[] = []
    for (const asset of data.assets) {
      const fixed = kindOf.get(asset.assetClassId) === 'fixed_income' || !asset.ticker
      let quantity = '0'
      let costCents = 0
      try {
        const position = computePosition(
          asset.trades.filter((trade) => dateToIsoDate(trade.tradeDate) <= date).map(tradeInput),
        )
        quantity = position.quantity.toString()
        costCents = position.costCents
      } catch (error) {
        if (!(error instanceof PortfolioError)) throw error
      }
      const item = saved.get(asset.id)
      const held = fixed ? costCents > 0 : quantity !== '0'
      if (!item && !held && !before.has(asset.id)) continue
      const choice = choosePrice(asset, asset.ticker ? cache.get(asset.ticker) : undefined)
      const price = item?.price?.toString() ?? choice.price
      rows.push({
        kind: 'asset',
        assetId: asset.id,
        assetClassId: asset.assetClassId,
        accountId: asset.accountId,
        label: asset.ticker ?? asset.name,
        name: asset.name,
        ticker: asset.ticker,
        manualValue: fixed,
        quantity: fixed ? null : (item?.quantity?.toString() ?? quantity),
        price: fixed ? null : price,
        valueCents: item
          ? centsToNumber(item.valueCents)
          : fixed
            ? null
            : price
              ? balanceItemValue(quantity, price)
              : null,
        dy: decimalOrNull(item?.dy ?? null),
        pvp: decimalOrNull(item?.pvp ?? null),
        previousValueCents: before.get(asset.id) ?? null,
      })
    }
    rows.sort(
      (a, b) =>
        (classOrder.get(a.assetClassId ?? '') ?? 99) -
          (classOrder.get(b.assetClassId ?? '') ?? 99) ||
        (accountName.get(a.accountId ?? '') ?? '').localeCompare(
          accountName.get(b.accountId ?? '') ?? '',
        ) ||
        a.label.localeCompare(b.label),
    )
    // Saldo em conta: corretoras dos ativos e as que já tinham saldo.
    const cashAccounts = new Set<string>()
    for (const row of rows) if (row.accountId) cashAccounts.add(row.accountId)
    for (const key of [...saved.keys(), ...before.keys()]) {
      if (typeof key === 'string' && key.startsWith('cash:') && key !== 'cash:null')
        cashAccounts.add(key.slice(5))
    }
    for (const id of [...cashAccounts].sort((a, b) =>
      (accountName.get(a) ?? '').localeCompare(accountName.get(b) ?? ''),
    )) {
      if (!accountName.has(id)) continue
      const item = saved.get(`cash:${id}`)
      rows.push({
        kind: 'cash',
        assetId: null,
        assetClassId: null,
        accountId: id,
        label: `Saldo em conta · ${accountName.get(id)}`,
        name: accountName.get(id) ?? '',
        ticker: null,
        manualValue: true,
        quantity: null,
        price: null,
        valueCents: item ? centsToNumber(item.valueCents) : null,
        dy: null,
        pvp: null,
        previousValueCents: before.get(`cash:${id}`) ?? null,
      })
    }
    const body: BalanceFormResponse = {
      competenceMonth: month,
      referenceDate: date as BalanceFormResponse['referenceDate'],
      balance: balance ? toBalance(balance) : null,
      rows,
      previous: previous
        ? {
            id: previous.id,
            competenceMonth: monthOf(previous.competenceMonth),
            referenceDate: dateToIsoDate(previous.referenceDate),
            totalCents: centsToNumber(previous.totalCents),
          }
        : null,
      contributionsCents: sumFlows(periodFlows),
      dividendsCents: sumFlows(flowsInPeriod(dividends, prevDate, date)),
      contributionTiming: timing,
      flows: periodFlows.map((flow) => ({
        date: flow.date as BalanceFormResponse['referenceDate'],
        amountCents: flow.amountCents,
      })),
    }
    res.json(body)
  })

  router.get('/balances/:id', async (req, res) => {
    const userId = userIdOf(req)
    const row = await ensureFound(
      prisma.balance.findFirst({ where: { id: paramId(req), userId, deletedAt: null }, include }),
      'Balanço não encontrado',
    )
    res.json(toBalance(row))
  })

  /** Monta as linhas (rótulos congelados) validando que ativos e contas são do usuário. */
  async function itemsData(userId: string, input: z.output<typeof saveBalanceRequestSchema>) {
    const assetIds = [
      ...new Set(input.items.flatMap((item) => (item.assetId ? [item.assetId] : []))),
    ]
    const accountIds = [
      ...new Set(input.items.flatMap((item) => (item.accountId ? [item.accountId] : []))),
    ]
    const [assets, accounts] = await Promise.all([
      prisma.asset.findMany({ where: { userId, deletedAt: null, id: { in: assetIds } } }),
      prisma.account.findMany({ where: { userId, deletedAt: null, id: { in: accountIds } } }),
    ])
    if (assets.length !== assetIds.length) throw validationError('Ativo não encontrado')
    if (accounts.length !== accountIds.length) throw validationError('Conta não encontrada')
    const assetById = new Map(assets.map((item) => [item.id, item]))
    const accountById = new Map(accounts.map((item) => [item.id, item]))
    const seen = new Set<string>()
    return input.items.map((item, index) => {
      const key = item.kind === 'cash' ? `cash:${item.accountId ?? ''}` : (item.assetId ?? '')
      if (seen.has(key)) throw validationError('Ativo ou conta repetido no balanço')
      seen.add(key)
      if (item.kind === 'cash') {
        const account = item.accountId ? accountById.get(item.accountId) : undefined
        return {
          kind: 'cash',
          assetId: null,
          assetClassId: null,
          accountId: account?.id ?? null,
          label: account ? `Saldo em conta · ${account.name}` : item.label || 'Saldo em conta',
          ticker: null,
          quantity: null,
          price: null,
          valueCents: BigInt(item.valueCents),
          dy: null,
          pvp: null,
          sortOrder: index,
        }
      }
      const asset = assetById.get(item.assetId ?? '') as NonNullable<
        ReturnType<typeof assetById.get>
      >
      const value =
        item.quantity && item.price ? balanceItemValue(item.quantity, item.price) : item.valueCents
      return {
        kind: 'asset',
        assetId: asset.id,
        assetClassId: asset.assetClassId,
        accountId: asset.accountId,
        label: asset.ticker ?? asset.name,
        ticker: asset.ticker,
        quantity: item.quantity ?? null,
        price: item.price ?? null,
        valueCents: BigInt(value),
        dy: item.dy ?? null,
        pvp: item.pvp ?? null,
        sortOrder: index,
      }
    })
  }

  const total = (items: { valueCents: bigint }[]) =>
    items.reduce((sum, item) => sum + item.valueCents, 0n)

  router.post('/balances', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(saveBalanceRequestSchema, req.body)
    const items = await itemsData(userId, input)
    const competenceMonth = competenceMonthToDate(input.competenceMonth)
    const exists = await prisma.balance.findFirst({
      where: { userId, competenceMonth, deletedAt: null },
    })
    if (exists) throw conflict('Já existe um balanço deste mês: edite o existente')
    const row = await prisma.balance.create({
      data: {
        userId,
        competenceMonth,
        referenceDate: isoDateToDate(input.referenceDate),
        totalCents: total(items),
        notes: input.notes ?? null,
        items: { create: items },
      },
      include,
    })
    res.status(201).json(toBalance(row))
  })

  const owned = (userId: string, id: string) =>
    ensureFound(
      prisma.balance.findFirst({ where: { id, userId, deletedAt: null }, include }),
      'Balanço não encontrado',
    )

  router.put('/balances/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await owned(userId, paramId(req))
    if (current.status === 'closed') throw conflict('Balanço fechado: reabra para editar')
    const input = parse(saveBalanceRequestSchema, req.body)
    const items = await itemsData(userId, input)
    const competenceMonth = competenceMonthToDate(input.competenceMonth)
    const clash = await prisma.balance.findFirst({
      where: { userId, competenceMonth, deletedAt: null, id: { not: current.id } },
    })
    if (clash) throw conflict('Já existe um balanço deste mês')
    const row = await prisma.$transaction(async (tx) => {
      await tx.balanceItem.deleteMany({ where: { balanceId: current.id } })
      return tx.balance.update({
        where: { id: current.id },
        data: {
          competenceMonth,
          referenceDate: isoDateToDate(input.referenceDate),
          totalCents: total(items),
          notes: input.notes ?? null,
          items: { create: items },
        },
        include,
      })
    })
    res.json(toBalance(row))
  })

  /**
   * RB-04: congela aportes e proventos do período. Se é o balanço mais recente, o saldo de
   * cada renda fixa (e o preço dos ativos de preço manual) vira o valor atual do ativo.
   */
  router.post('/balances/:id/close', async (req, res) => {
    const userId = userIdOf(req)
    const current = await owned(userId, paramId(req))
    if (current.status === 'closed') throw conflict('Balanço já está fechado')
    const { source } = await settingsOf(userId)
    const previous = await prisma.balance.findFirst({
      where: { userId, deletedAt: null, referenceDate: { lt: current.referenceDate } },
      orderBy: { referenceDate: 'desc' },
    })
    const later = await prisma.balance.count({
      where: { userId, deletedAt: null, referenceDate: { gt: current.referenceDate } },
    })
    const date = dateToIsoDate(current.referenceDate)
    const prevDate = previous ? dateToIsoDate(previous.referenceDate) : null
    const [flows, dividends] = await Promise.all([
      loadFlows(userId, source),
      loadDividendFlows(userId),
    ])
    const row = await prisma.$transaction(async (tx) => {
      if (later === 0) {
        const at = current.referenceDate
        for (const item of current.items) {
          if (item.kind !== 'asset' || !item.assetId) continue
          const asset = await tx.asset.findFirst({ where: { id: item.assetId, userId } })
          if (!asset) continue
          if (asset.quoteMode === 'manual' && item.quantity === null) {
            if (!asset.manualValueAt || asset.manualValueAt <= at) {
              await tx.asset.update({
                where: { id: asset.id },
                data: { manualValueCents: item.valueCents, manualValueAt: at },
              })
            }
          } else if (asset.quoteMode === 'manual' && item.price !== null) {
            if (!asset.manualPriceAt || asset.manualPriceAt <= at) {
              await tx.asset.update({
                where: { id: asset.id },
                data: { manualPrice: item.price, manualPriceAt: at },
              })
            }
          }
        }
      }
      return tx.balance.update({
        where: { id: current.id },
        data: {
          status: 'closed',
          closedAt: clock.now(),
          contributionsCents: BigInt(sumFlows(flowsInPeriod(flows, prevDate, date))),
          dividendsCents: BigInt(sumFlows(flowsInPeriod(dividends, prevDate, date))),
        },
        include,
      })
    })
    res.json(toBalance(row))
  })

  router.post('/balances/:id/reopen', async (req, res) => {
    const userId = userIdOf(req)
    const current = await owned(userId, paramId(req))
    if (current.status !== 'closed') throw conflict('Balanço já está aberto')
    const row = await prisma.balance.update({
      where: { id: current.id },
      data: { status: 'draft', closedAt: null, contributionsCents: null, dividendsCents: null },
      include,
    })
    res.json(toBalance(row))
  })

  router.delete('/balances/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await owned(userId, paramId(req))
    await prisma.balance.update({ where: { id: current.id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  /** RB-30: máximo, mínimo, último DY/P-VP por ativo, com o preço de hoje e o PM. */
  router.get('/observed-prices', async (req, res) => {
    const userId = userIdOf(req)
    const items = await prisma.balanceItem.findMany({
      where: {
        kind: 'asset',
        price: { not: null },
        balance: { userId, deletedAt: null },
      },
      include: { balance: { select: { referenceDate: true } } },
    })
    const data = await loadPortfolioData(prisma, userId)
    const cache = await quotes.cached(autoTickers(data))
    const portfolio = buildPortfolio(
      data,
      cache,
      {
        provider: quotes.provider.name,
        enabled: quotes.provider.enabled,
        budgetLeft: 0,
        pending: 0,
      },
      clock.today(),
    )
    const positions = new Map(portfolio.positions.map((item) => [item.asset.id, item]))
    const keyOf = (item: { assetId: string | null; ticker: string | null; label: string }) =>
      item.assetId ?? item.ticker ?? item.label
    const meta = new Map<
      string,
      { assetId: string | null; ticker: string | null; name: string; assetClassId: string | null }
    >()
    for (const item of items) {
      meta.set(keyOf(item), {
        assetId: item.assetId,
        ticker: item.ticker,
        name: positions.get(item.assetId ?? '')?.asset.name ?? item.label,
        assetClassId: item.assetClassId,
      })
    }
    const list = observedPrices(
      items.map((item) => ({
        key: keyOf(item),
        date: dateToIsoDate(item.balance.referenceDate),
        price: item.price?.toString() ?? '0',
        dy: item.dy?.toString() ?? null,
        pvp: item.pvp?.toString() ?? null,
      })),
      new Map(
        [...meta.entries()].map(([key, value]) => [
          key,
          positions.get(value.assetId ?? '')?.price ?? null,
        ]),
      ),
    )
    const body: { data: ObservedPriceValue[] } = {
      data: list.map((item) => {
        const info = meta.get(item.key)
        const position = positions.get(info?.assetId ?? '')
        return {
          ...item,
          max: { ...item.max, date: item.max.date as ObservedPriceValue['max']['date'] },
          min: { ...item.min, date: item.min.date as ObservedPriceValue['min']['date'] },
          last: { ...item.last, date: item.last.date as ObservedPriceValue['last']['date'] },
          history: item.history.map((entry) => ({
            ...entry,
            date: entry.date as ObservedPriceValue['last']['date'],
          })),
          assetId: info?.assetId ?? null,
          ticker: info?.ticker ?? null,
          name: info?.name ?? item.key,
          assetClassId: info?.assetClassId ?? null,
          currentPrice: position?.price ?? null,
          avgPrice: position && position.quantity !== '0' ? position.avgPrice : null,
        }
      }),
    }
    res.json(body)
  })

  return router
}
