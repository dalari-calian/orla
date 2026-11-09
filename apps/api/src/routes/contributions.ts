import {
  competenceMonthToDate,
  dateToIsoDate,
  isoDateToCompetenceMonth,
  isoDateToDate,
  isManualQuoteKind,
  normalizeTicker,
  tradeTotalCents,
  type AssetClassKind,
} from '@orla/core'
import {
  competenceMonthSchema,
  createContributionRequestSchema,
  executeContributionPlanRequestSchema,
  saveContributionPlanRequestSchema,
  updateContributionRequestSchema,
  type Contribution,
  type ContributionPlan,
  type NewPlanAsset,
  type PlanItem,
} from '@orla/contracts'
import { Prisma, type PrismaClient } from '@orla/db'
import { Router } from 'express'
import { z } from 'zod'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber, ensureFound, paramId, toIso } from '../lib/db.ts'
import { conflict, validationError } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'
import type { QuoteService } from '../services/quotes.ts'

type PlanRow = Prisma.ContributionPlanGetPayload<{ include: { items: true } }>
type ContributionRow = Prisma.ContributionGetPayload<object>

const monthOf = (date: Date) => dateToIsoDate(date).slice(0, 7)

function toPlan(row: PlanRow): ContributionPlan {
  const items: PlanItem[] = [...row.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      id: item.id,
      assetId: item.assetId,
      newAsset: (item.newAsset as NewPlanAsset | null) ?? null,
      mode: item.mode as PlanItem['mode'],
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      valueCents: centsToNumber(item.valueCents),
      sortOrder: item.sortOrder,
      executedTradeId: item.executedTradeId,
      executedAt: item.executedAt ? toIso(item.executedAt) : null,
    }))
  return {
    id: row.id,
    competenceMonth: monthOf(row.competenceMonth),
    name: row.name,
    totalCents: centsToNumber(row.totalCents),
    status: row.status as ContributionPlan['status'],
    classSplit: row.classSplit as Record<string, string>,
    isPrimary: row.isPrimary,
    executedAt: row.executedAt ? toIso(row.executedAt) : null,
    items,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function toContribution(row: ContributionRow): Contribution {
  return {
    id: row.id,
    date: dateToIsoDate(row.date),
    competenceMonth: monthOf(row.competenceMonth),
    amountCents: centsToNumber(row.amountCents),
    accountId: row.accountId,
    notes: row.notes,
    contributionPlanId: row.contributionPlanId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const listQuerySchema = z.object({ month: competenceMonthSchema.optional() })
const rangeQuerySchema = z.object({
  from: competenceMonthSchema.optional(),
  to: competenceMonthSchema.optional(),
})

/**
 * /contribution-plans (simulações, RA-30) e /contributions (aportes externos). O cálculo da
 * simulação é do core, no navegador; aqui só valida, salva e efetiva (RA-31/32).
 */
export function contributionsRouter(
  prisma: PrismaClient,
  clock: Clock,
  quotes: QuoteService,
): Router {
  const router = Router()
  const include = { items: true } as const

  const ownedPlan = (userId: string, id: string) =>
    ensureFound(
      prisma.contributionPlan.findFirst({ where: { id, userId, deletedAt: null }, include }),
      'Simulação não encontrada',
    )

  /** Classes e ativos citados existem e são do usuário. */
  async function checkRefs(
    userId: string,
    input: z.output<typeof saveContributionPlanRequestSchema>,
  ): Promise<void> {
    const classIds = new Set([
      ...Object.keys(input.classSplit),
      ...input.items.flatMap((item) => (item.newAsset ? [item.newAsset.assetClassId] : [])),
    ])
    const classes = await prisma.assetClass.count({
      where: { userId, deletedAt: null, id: { in: [...classIds] } },
    })
    if (classes !== classIds.size) throw validationError('Classe de ativo não encontrada')
    const assetIds = new Set(input.items.flatMap((item) => (item.assetId ? [item.assetId] : [])))
    const assets = await prisma.asset.count({
      where: { userId, deletedAt: null, id: { in: [...assetIds] } },
    })
    if (assets !== assetIds.size) throw validationError('Ativo não encontrado')
  }

  const itemData = (input: z.output<typeof saveContributionPlanRequestSchema>, offset: number) =>
    input.items.map((item, index) => ({
      assetId: item.assetId ?? null,
      newAsset: item.newAsset
        ? ({
            ...item.newAsset,
            ticker: item.newAsset.ticker ? normalizeTicker(item.newAsset.ticker) : null,
          } as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      mode: item.mode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      valueCents: BigInt(item.valueCents),
      sortOrder: offset + index,
    }))

  /** Marca como principal e tira a marca das outras do mesmo mês. */
  async function makePrimary(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    month: Date,
  ) {
    await tx.contributionPlan.updateMany({
      where: { userId, competenceMonth: month, isPrimary: true, id: { not: id } },
      data: { isPrimary: false },
    })
    await tx.contributionPlan.update({ where: { id }, data: { isPrimary: true } })
  }

  router.get('/contribution-plans', async (req, res) => {
    const userId = userIdOf(req)
    const query = parse(listQuerySchema, req.query)
    const rows = await prisma.contributionPlan.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(query.month && { competenceMonth: competenceMonthToDate(query.month) }),
      },
      include,
      orderBy: [{ competenceMonth: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })
    res.json({ data: rows.map(toPlan), nextCursor: null })
  })

  router.get('/contribution-plans/:id', async (req, res) => {
    res.json(toPlan(await ownedPlan(userIdOf(req), paramId(req))))
  })

  router.post('/contribution-plans', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(saveContributionPlanRequestSchema, req.body)
    await checkRefs(userId, input)
    const month = competenceMonthToDate(input.competenceMonth)
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.contributionPlan.count({
        where: { userId, competenceMonth: month, deletedAt: null, isPrimary: true },
      })
      const created = await tx.contributionPlan.create({
        data: {
          userId,
          competenceMonth: month,
          name: input.name,
          totalCents: BigInt(input.totalCents),
          classSplit: input.classSplit,
          items: { create: itemData(input, 0) },
        },
      })
      // A primeira do mês vira a principal (RA-30).
      if (input.isPrimary || existing === 0) await makePrimary(tx, userId, created.id, month)
      return tx.contributionPlan.findUniqueOrThrow({ where: { id: created.id }, include })
    })
    res.status(201).json(toPlan(row))
  })

  /** Salva o rascunho (substitui os itens ainda não comprados). */
  router.put('/contribution-plans/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ownedPlan(userId, paramId(req))
    if (current.status !== 'draft') throw conflict('Simulação já efetivada: crie outra')
    const input = parse(saveContributionPlanRequestSchema, req.body)
    await checkRefs(userId, input)
    const month = competenceMonthToDate(input.competenceMonth)
    const executed = current.items.filter((item) => item.executedAt)
    const row = await prisma.$transaction(async (tx) => {
      await tx.contributionPlanItem.deleteMany({ where: { planId: current.id, executedAt: null } })
      await tx.contributionPlan.update({
        where: { id: current.id },
        data: {
          competenceMonth: month,
          name: input.name,
          totalCents: BigInt(input.totalCents),
          classSplit: input.classSplit,
          items: { create: itemData(input, executed.length) },
        },
      })
      if (input.isPrimary) await makePrimary(tx, userId, current.id, month)
      return tx.contributionPlan.findUniqueOrThrow({ where: { id: current.id }, include })
    })
    res.json(toPlan(row))
  })

  router.delete('/contribution-plans/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ownedPlan(userId, paramId(req))
    if (current.items.some((item) => item.executedAt)) {
      throw conflict('Esta simulação já tem compras efetivadas e não pode ser excluída')
    }
    await prisma.contributionPlan.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), isPrimary: false },
    })
    res.status(204).end()
  })

  /** "Comprei" (RA-31/32): compras + um aporte com o total; ativos novos são criados. */
  router.post('/contribution-plans/:id/execute', async (req, res) => {
    const userId = userIdOf(req)
    const plan = await ownedPlan(userId, paramId(req))
    if (plan.status !== 'draft') throw conflict('Simulação já efetivada')
    const input = parse(executeContributionPlanRequestSchema, req.body)
    const byId = new Map(plan.items.map((item) => [item.id, item]))
    for (const entry of input.items) {
      const item = byId.get(entry.itemId)
      if (!item) throw validationError('Item não pertence a esta simulação')
      if (item.executedAt) throw conflict('Um dos itens já foi efetivado')
    }
    if (new Set(input.items.map((entry) => entry.itemId)).size !== input.items.length) {
      throw validationError('Item repetido')
    }
    if (input.accountId) {
      await ensureFound(
        prisma.account.findFirst({ where: { id: input.accountId, userId, deletedAt: null } }),
        'Conta não encontrada',
      )
    }
    const tradeDate = isoDateToDate(input.date)
    const now = clock.now()
    const created: string[] = []
    const newTickers: string[] = []

    const result = await prisma.$transaction(async (tx) => {
      let total = 0
      for (const entry of input.items) {
        const item = byId.get(entry.itemId)
        if (!item) continue
        // Ativo: existente (do usuário) ou novo (cria; reaproveita se o ticker já existe).
        let asset = item.assetId
          ? await tx.asset.findFirst({
              where: { id: item.assetId, userId, deletedAt: null },
              include: { assetClass: true },
            })
          : null
        if (item.assetId && !asset) throw validationError('Um dos ativos foi excluído')
        if (!asset) {
          const spec = item.newAsset as NewPlanAsset
          const assetClass = await tx.assetClass.findFirst({
            where: { id: spec.assetClassId, userId, deletedAt: null },
          })
          if (!assetClass) throw validationError('Classe de ativo não encontrada')
          const ticker = spec.ticker ? normalizeTicker(spec.ticker) : null
          const existing = ticker
            ? await tx.asset.findFirst({
                where: {
                  userId,
                  deletedAt: null,
                  accountId: null,
                  ticker: { equals: ticker, mode: 'insensitive' },
                },
                include: { assetClass: true },
              })
            : null
          if (existing) asset = existing
          else {
            const manual = isManualQuoteKind(assetClass.kind as AssetClassKind) || !ticker
            asset = await tx.asset.create({
              data: {
                userId,
                assetClassId: assetClass.id,
                ticker,
                name: spec.name,
                quoteMode: manual ? 'manual' : 'auto',
              },
              include: { assetClass: true },
            })
            created.push(ticker ?? spec.name)
            if (ticker && !manual) newTickers.push(ticker)
          }
        }
        const fixed = asset.assetClass.kind === 'fixed_income' || !asset.ticker
        const totalCents =
          entry.totalCents ??
          tradeTotalCents(entry.quantity, entry.unitPrice, fixed ? 0 : entry.feesCents)
        if (totalCents <= 0) throw validationError('Informe quantidade e preço de cada item')
        const trade = await tx.assetTrade.create({
          data: {
            userId,
            assetId: asset.id,
            kind: fixed ? 'fixed_income_deposit' : 'buy',
            tradeDate,
            quantity: fixed ? '1' : entry.quantity,
            unitPrice: fixed ? (totalCents / 100).toFixed(2) : entry.unitPrice,
            feesCents: BigInt(fixed ? 0 : entry.feesCents),
            totalCents: BigInt(totalCents),
            contributionPlanId: plan.id,
            source: 'contribution',
          },
        })
        await tx.contributionPlanItem.update({
          where: { id: item.id },
          data: { executedTradeId: trade.id, executedAt: now, assetId: asset.id },
        })
        total += totalCents
      }

      const contribution = await tx.contribution.create({
        data: {
          userId,
          date: tradeDate,
          competenceMonth: plan.competenceMonth,
          amountCents: BigInt(total),
          accountId: input.accountId ?? null,
          contributionPlanId: plan.id,
          notes: plan.name,
        },
      })
      const pending = plan.items.filter(
        (item) => !item.executedAt && !input.items.some((entry) => entry.itemId === item.id),
      )
      await tx.contributionPlan.update({
        where: { id: plan.id },
        data: pending.length === 0 ? { status: 'executed', executedAt: now } : {},
      })
      // A meta funciona como uma conta do mês: soma o que foi investido.
      if (input.registerInvested) {
        const settings = await tx.monthSettings.findUnique({
          where: { userId_competenceMonth: { userId, competenceMonth: plan.competenceMonth } },
        })
        const invested = (settings?.goalInvestedCents ?? 0n) + BigInt(total)
        await tx.monthSettings.upsert({
          where: { userId_competenceMonth: { userId, competenceMonth: plan.competenceMonth } },
          create: { userId, competenceMonth: plan.competenceMonth, goalInvestedCents: invested },
          update: { goalInvestedCents: invested },
        })
      }
      return {
        plan: await tx.contributionPlan.findUniqueOrThrow({ where: { id: plan.id }, include }),
        contribution,
      }
    })
    if (newTickers.length > 0) quotes.refreshInBackground(newTickers, 5)
    res.json({
      plan: toPlan(result.plan),
      contribution: toContribution(result.contribution),
      tradesCreated: input.items.length,
      assetsCreated: created,
    })
  })

  // ─── Aportes externos ──────────────────────────────────────────────────────

  router.get('/contributions', async (req, res) => {
    const userId = userIdOf(req)
    const query = parse(rangeQuerySchema, req.query)
    const rows = await prisma.contribution.findMany({
      where: {
        userId,
        deletedAt: null,
        competenceMonth: {
          ...(query.from && { gte: competenceMonthToDate(query.from) }),
          ...(query.to && { lte: competenceMonthToDate(query.to) }),
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })
    res.json({ data: rows.map(toContribution), nextCursor: null })
  })

  async function checkAccount(userId: string, accountId: string | null | undefined) {
    if (!accountId) return
    await ensureFound(
      prisma.account.findFirst({ where: { id: accountId, userId, deletedAt: null } }),
      'Conta não encontrada',
    )
  }

  router.post('/contributions', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createContributionRequestSchema, req.body)
    await checkAccount(userId, input.accountId)
    const row = await prisma.contribution.create({
      data: {
        userId,
        date: isoDateToDate(input.date),
        competenceMonth: competenceMonthToDate(isoDateToCompetenceMonth(input.date)),
        amountCents: BigInt(input.amountCents),
        accountId: input.accountId ?? null,
        notes: input.notes ?? null,
      },
    })
    res.status(201).json(toContribution(row))
  })

  router.patch('/contributions/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.contribution.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Aporte não encontrado',
    )
    const input = parse(updateContributionRequestSchema, req.body)
    await checkAccount(userId, input.accountId)
    const row = await prisma.contribution.update({
      where: { id: current.id },
      data: {
        ...(input.date && {
          date: isoDateToDate(input.date),
          competenceMonth: competenceMonthToDate(isoDateToCompetenceMonth(input.date)),
        }),
        ...(input.amountCents !== undefined && { amountCents: BigInt(input.amountCents) }),
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    })
    res.json(toContribution(row))
  })

  router.delete('/contributions/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await ensureFound(
      prisma.contribution.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Aporte não encontrado',
    )
    await prisma.contribution.update({ where: { id: current.id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  return router
}
