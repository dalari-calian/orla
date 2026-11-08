import {
  buildInstallmentSchedule,
  competenceMonthToDate,
  computePayoff,
  dateToCompetenceMonth,
  dateToIsoDate,
  firstMonthFromCurrentInstallment,
  installmentIndicators,
  installmentTotal,
  isoDateToCompetenceMonth,
  isoDateToDate,
  monthlyCommitment,
  payoffTotal,
  planInstallmentEdit,
  statementCompetenceMonth,
  type InstallmentLike,
  type InstallmentPlanStatus,
} from '@orla/core'
import {
  createInstallmentPlanRequestSchema,
  payoffInstallmentPlanRequestSchema,
  updateInstallmentPlanRequestSchema,
  type InstallmentPlan,
  type InstallmentPlanDetail,
  type InstallmentSummary,
  type ListResponse,
  type PaymentMethod,
} from '@orla/contracts'
import type { Prisma, PrismaClient } from '@orla/db'
import { Router } from 'express'
import { z } from 'zod'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber, ensureFound, paramId, toIso } from '../lib/db.ts'
import { conflict } from '../lib/errors.ts'
import {
  assertRefs,
  installmentDate,
  financeSettings,
  toTransaction,
  transactionInclude,
} from '../lib/finance.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

const planInclude = {
  transactions: {
    where: { deletedAt: null },
    include: transactionInclude,
    orderBy: [{ installmentNumber: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  },
} satisfies Prisma.InstallmentPlanInclude

type PlanRow = Prisma.InstallmentPlanGetPayload<{ include: typeof planInclude }>

/** Parcelas no formato do core (a quitação antecipada entra como "parcela 0" realizada). */
function installmentsOf(row: PlanRow): InstallmentLike[] {
  return row.transactions.map((item) => ({
    number: item.installmentNumber ?? 0,
    competenceMonth: dateToCompetenceMonth(item.competenceMonth),
    amountCents: centsToNumber(item.amountCents),
    status: item.status === 'settled' ? 'settled' : 'forecast',
  }))
}

function toPlan(row: PlanRow, viewMonth: string): InstallmentPlan {
  const base = {
    totalCents: centsToNumber(row.totalCents),
    count: row.installmentsCount,
    firstCompetenceMonth: dateToCompetenceMonth(row.firstCompetenceMonth),
    status: row.status as InstallmentPlanStatus,
  }
  return {
    id: row.id,
    description: row.description,
    payeeId: row.payeeId,
    categoryId: row.categoryId,
    creditCardId: row.creditCardId,
    accountId: row.accountId,
    paymentMethod: row.paymentMethod as PaymentMethod,
    purchaseDate: dateToIsoDate(row.purchaseDate),
    totalCents: base.totalCents,
    installmentsCount: base.count,
    firstCompetenceMonth: base.firstCompetenceMonth,
    status: base.status,
    paidOffAt: row.paidOffAt ? dateToIsoDate(row.paidOffAt) : null,
    payoffDiscountCents: centsToNumber(row.payoffDiscountCents),
    notes: row.notes,
    indicators: installmentIndicators(base, installmentsOf(row), viewMonth),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const listQuerySchema = z.object({
  status: z.enum(['active', 'finished', 'all']).default('active'),
})

/** /installment-plans — compras parceladas (RF-40..48). */
export function installmentPlansRouter(prisma: PrismaClient, clock: Clock): Router {
  const router = Router()

  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.installmentPlan.findFirst({
        where: { id, userId, deletedAt: deleted ? { not: null } : null },
        include: planInclude,
      }),
      'Parcelamento não encontrado',
    )

  const detail = (row: PlanRow): InstallmentPlanDetail => ({
    plan: toPlan(row, clock.currentMonth()),
    installments: row.transactions.map(toTransaction),
  })

  router.get('/installment-plans', async (req, res) => {
    const { status } = parse(listQuerySchema, req.query)
    const rows = await prisma.installmentPlan.findMany({
      where: {
        userId: userIdOf(req),
        deletedAt: null,
        ...(status === 'active' && { status: 'active' }),
        ...(status === 'finished' && { status: { in: ['paid_off', 'canceled'] } }),
      },
      include: planInclude,
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
    })
    const month = clock.currentMonth()
    let plans = rows.map((row) => toPlan(row, month))
    // "Finalizados" também inclui os ativos cuja última parcela já passou e foi paga.
    if (status === 'active')
      plans = plans.filter(
        (plan) => plan.indicators.remainingCents > 0 || plan.indicators.remainingCount > 0,
      )
    if (status === 'finished') {
      const finishedActive = rows
        .filter((row) => row.status === 'active')
        .map((row) => toPlan(row, month))
        .filter(
          (plan) => plan.indicators.remainingCents === 0 && plan.indicators.remainingCount === 0,
        )
      plans = [...plans, ...finishedActive]
    }
    const body: ListResponse<InstallmentPlan> = { data: plans, nextCursor: null }
    res.json(body)
  })

  router.get('/installment-plans/summary', async (req, res) => {
    const userId = userIdOf(req)
    const month = clock.currentMonth()
    const rows = await prisma.installmentPlan.findMany({
      where: { userId, deletedAt: null, status: 'active' },
      include: planInclude,
    })
    const plans = rows.map((row) => ({ row, plan: toPlan(row, month) }))
    const byCard = new Map<string | null, number>()
    for (const { plan } of plans) {
      byCard.set(
        plan.creditCardId,
        (byCard.get(plan.creditCardId) ?? 0) + plan.indicators.remainingCents,
      )
    }
    const commitment = monthlyCommitment(
      rows.flatMap((row) => installmentsOf(row)),
      month,
      12,
    )
    const body: InstallmentSummary = {
      payoffTotalCents: payoffTotal(plans.map(({ plan }) => plan.indicators)),
      activeCount: plans.filter(({ plan }) => plan.indicators.remainingCents > 0).length,
      byCard: [...byCard.entries()]
        .filter(([, remainingCents]) => remainingCents > 0)
        .map(([creditCardId, remainingCents]) => ({ creditCardId, remainingCents })),
      monthly: commitment.months,
      freeFromMonth: commitment.freeFromMonth,
    }
    res.json(body)
  })

  router.get('/installment-plans/:id', async (req, res) => {
    res.json(detail(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/installment-plans', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createInstallmentPlanRequestSchema, req.body)
    const isCredit = input.paymentMethod === 'credit'
    const { card } = await assertRefs(prisma, userId, {
      categoryId: input.categoryId,
      categoryKind: 'expense',
      accountId: input.accountId,
      payeeId: input.payeeId,
      creditCardId: isCredit ? input.creditCardId : null,
    })
    const { cardCompetence } = await financeSettings(prisma, userId)

    const totalCents =
      input.totalCents ?? installmentTotal(input.installmentCents ?? 0, input.installmentsCount)
    // 1ª competência: informada; ou derivada de "estou na parcela k" neste mês (RF-43);
    // ou a fatura da compra no crédito / o mês da compra (RF-42).
    const firstCompetenceMonth =
      input.firstCompetenceMonth ??
      (input.currentInstallment
        ? firstMonthFromCurrentInstallment(clock.currentMonth(), input.currentInstallment)
        : card
          ? statementCompetenceMonth(input.purchaseDate, card, cardCompetence)
          : isoDateToCompetenceMonth(input.purchaseDate))
    const schedule = buildInstallmentSchedule({
      totalCents,
      count: input.installmentsCount,
      firstCompetenceMonth,
      currentInstallment: input.currentInstallment,
    })

    const row = await prisma.$transaction(async (tx) => {
      const plan = await tx.installmentPlan.create({
        data: {
          userId,
          description: input.description,
          payeeId: input.payeeId ?? null,
          categoryId: input.categoryId ?? null,
          paymentMethod: input.paymentMethod,
          creditCardId: isCredit ? (input.creditCardId ?? null) : null,
          accountId: input.accountId ?? null,
          purchaseDate: isoDateToDate(input.purchaseDate),
          totalCents: BigInt(totalCents),
          installmentsCount: input.installmentsCount,
          firstCompetenceMonth: competenceMonthToDate(firstCompetenceMonth),
          notes: input.notes ?? null,
        },
      })
      await tx.transaction.createMany({
        data: schedule.map((item) => ({
          userId,
          type: 'expense',
          nature: 'installment',
          status: item.status,
          description: input.description,
          amountCents: BigInt(item.amountCents),
          competenceMonth: competenceMonthToDate(item.competenceMonth),
          date: installmentDate(item.competenceMonth, input.purchaseDate, card, cardCompetence),
          categoryId: plan.categoryId,
          accountId: plan.accountId,
          payeeId: plan.payeeId,
          paymentMethod: plan.paymentMethod,
          creditCardId: plan.creditCardId,
          installmentPlanId: plan.id,
          installmentNumber: item.number,
          source: 'plan',
        })),
      })
      return tx.installmentPlan.findUniqueOrThrow({ where: { id: plan.id }, include: planInclude })
    })
    res.status(201).json(detail(row))
  })

  router.patch('/installment-plans/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await findOwned(userId, paramId(req))
    const input = parse(updateInstallmentPlanRequestSchema, req.body)
    const amountsChange =
      input.totalCents !== undefined ||
      input.installmentsCount !== undefined ||
      input.firstCompetenceMonth !== undefined
    if (amountsChange && current.status !== 'active') {
      throw conflict('Só parcelamentos ativos podem mudar valores ou parcelas')
    }
    const creditCardId =
      current.paymentMethod === 'credit' && input.creditCardId !== undefined
        ? input.creditCardId
        : current.creditCardId
    if (current.paymentMethod === 'credit' && !creditCardId) {
      throw conflict('Parcelamento no crédito precisa de um cartão')
    }
    const { card } = await assertRefs(prisma, userId, {
      categoryId: input.categoryId,
      categoryKind: 'expense',
      accountId: input.accountId,
      payeeId: input.payeeId,
      creditCardId: input.creditCardId !== undefined ? creditCardId : undefined,
    })
    const { cardCompetence } = await financeSettings(prisma, userId)
    const cardRef =
      card ??
      (creditCardId
        ? await prisma.creditCard.findFirst({
            where: { id: creditCardId, userId },
            select: { id: true, closingDay: true, dueDay: true },
          })
        : null)

    const totalCents = input.totalCents ?? centsToNumber(current.totalCents)
    const count = input.installmentsCount ?? current.installmentsCount
    const firstCompetenceMonth =
      input.firstCompetenceMonth ?? dateToCompetenceMonth(current.firstCompetenceMonth)
    const purchaseDate = dateToIsoDate(current.purchaseDate)
    const numbered = current.transactions.filter((item) => item.installmentNumber !== null)
    const edit = amountsChange
      ? planInstallmentEdit({
          totalCents,
          count,
          firstCompetenceMonth,
          existing: numbered.map((item) => ({
            id: item.id,
            number: item.installmentNumber ?? 0,
            amountCents: centsToNumber(item.amountCents),
            status: item.status === 'settled' ? 'settled' : 'forecast',
            isOverride: item.isOverride,
          })),
        })
      : null

    const shared = {
      description: input.description ?? current.description,
      categoryId: input.categoryId !== undefined ? input.categoryId : current.categoryId,
      payeeId: input.payeeId !== undefined ? input.payeeId : current.payeeId,
      accountId: input.accountId !== undefined ? input.accountId : current.accountId,
      creditCardId,
    }
    const now = new Date()

    const row = await prisma.$transaction(async (tx) => {
      await tx.installmentPlan.update({
        where: { id: current.id },
        data: {
          ...shared,
          totalCents: BigInt(totalCents),
          installmentsCount: count,
          firstCompetenceMonth: competenceMonthToDate(firstCompetenceMonth),
          ...(input.notes !== undefined && { notes: input.notes }),
        },
      })
      // Descrição, categoria, cartão... vão para as parcelas previstas não editadas.
      await tx.transaction.updateMany({
        where: {
          installmentPlanId: current.id,
          deletedAt: null,
          status: 'forecast',
          isOverride: false,
        },
        data: shared,
      })
      if (edit) {
        for (const item of edit.update) {
          await tx.transaction.update({
            where: { id: item.id },
            data: {
              amountCents: BigInt(item.amountCents),
              competenceMonth: competenceMonthToDate(item.competenceMonth),
              date: installmentDate(item.competenceMonth, purchaseDate, cardRef, cardCompetence),
            },
          })
        }
        if (edit.remove.length > 0) {
          await tx.transaction.updateMany({
            where: { id: { in: edit.remove } },
            data: { deletedAt: now },
          })
        }
        if (edit.create.length > 0) {
          await tx.transaction.createMany({
            data: edit.create.map((item) => ({
              userId,
              type: 'expense',
              nature: 'installment',
              status: 'forecast',
              description: shared.description,
              amountCents: BigInt(item.amountCents),
              competenceMonth: competenceMonthToDate(item.competenceMonth),
              date: installmentDate(item.competenceMonth, purchaseDate, cardRef, cardCompetence),
              categoryId: shared.categoryId,
              accountId: shared.accountId,
              payeeId: shared.payeeId,
              paymentMethod: current.paymentMethod,
              creditCardId: shared.creditCardId,
              installmentPlanId: current.id,
              installmentNumber: item.number,
              source: 'plan',
            })),
          })
        }
      }
      return tx.installmentPlan.findUniqueOrThrow({
        where: { id: current.id },
        include: planInclude,
      })
    })
    res.json(detail(row))
  })

  router.post('/installment-plans/:id/payoff', async (req, res) => {
    const userId = userIdOf(req)
    const current = await findOwned(userId, paramId(req))
    if (current.status !== 'active') throw conflict('Este parcelamento não está ativo')
    const input = parse(payoffInstallmentPlanRequestSchema, req.body)
    const { indicators } = toPlan(current, clock.currentMonth())
    const payoff = computePayoff(indicators.remainingCents, input.amountCents)
    const forecastIds = current.transactions
      .filter((item) => item.status === 'forecast')
      .map((item) => item.id)
    const now = new Date()

    const row = await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { id: { in: forecastIds } },
        data: { deletedAt: now },
      })
      await tx.transaction.create({
        data: {
          userId,
          type: 'expense',
          nature: 'installment',
          status: 'settled',
          description: `Quitação: ${current.description}`,
          amountCents: BigInt(payoff.amountCents),
          competenceMonth: competenceMonthToDate(
            input.competenceMonth ?? isoDateToCompetenceMonth(input.date),
          ),
          date: isoDateToDate(input.date),
          categoryId: current.categoryId,
          accountId: current.accountId,
          payeeId: current.payeeId,
          paymentMethod: current.paymentMethod,
          creditCardId: current.creditCardId,
          installmentPlanId: current.id,
          installmentNumber: null,
          source: 'plan',
        },
      })
      return tx.installmentPlan.update({
        where: { id: current.id },
        data: {
          status: 'paid_off',
          paidOffAt: isoDateToDate(input.date),
          payoffDiscountCents: BigInt(payoff.discountCents),
        },
        include: planInclude,
      })
    })
    res.json(detail(row))
  })

  router.post('/installment-plans/:id/cancel', async (req, res) => {
    const current = await findOwned(userIdOf(req), paramId(req))
    if (current.status !== 'active') throw conflict('Este parcelamento não está ativo')
    const now = new Date()
    const row = await prisma.$transaction(async (tx) => {
      // RF-48: estorno — saem as parcelas ainda previstas; as pagas ficam no histórico.
      await tx.transaction.updateMany({
        where: { installmentPlanId: current.id, deletedAt: null, status: 'forecast' },
        data: { deletedAt: now },
      })
      return tx.installmentPlan.update({
        where: { id: current.id },
        data: { status: 'canceled' },
        include: planInclude,
      })
    })
    res.json(detail(row))
  })

  router.delete('/installment-plans/:id', async (req, res) => {
    const current = await findOwned(userIdOf(req), paramId(req))
    const now = new Date()
    // Excluir = cadastro errado: some o parcelamento e todas as parcelas (com desfazer).
    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { installmentPlanId: current.id, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.installmentPlan.update({ where: { id: current.id }, data: { deletedAt: now } }),
    ])
    res.status(204).end()
  })

  router.post('/installment-plans/:id/restore', async (req, res) => {
    const current = await findOwned(userIdOf(req), paramId(req), true)
    const row = await prisma.$transaction(async (tx) => {
      if (current.deletedAt) {
        await tx.transaction.updateMany({
          where: { installmentPlanId: current.id, deletedAt: current.deletedAt },
          data: { deletedAt: null },
        })
      }
      return tx.installmentPlan.update({
        where: { id: current.id },
        data: { deletedAt: null },
        include: planInclude,
      })
    })
    res.json(detail(row))
  })

  return router
}
