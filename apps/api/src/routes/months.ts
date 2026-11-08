import {
  competenceMonthToDate,
  computeMonthSummary,
  isCompetenceMonth,
  type CompetenceMonth,
} from '@orla/core'
import {
  updateMonthSettingsRequestSchema,
  type MonthResponse,
  type MonthSettingsResponse,
  type SavingsGoal,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router, type Request } from 'express'
import { centsToNumber } from '../lib/db.ts'
import { notFound } from '../lib/errors.ts'
import {
  financeSettings,
  materializeMonth,
  toTransaction,
  transactionInclude,
} from '../lib/finance.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

/** `:month` da URL (`YYYY-MM`); formato inválido é tratado como inexistente (404). */
function paramMonth(req: Request): CompetenceMonth {
  const value = req.params.month
  if (!isCompetenceMonth(value)) throw notFound('Mês inválido (use AAAA-MM)')
  return value
}

/** /months/:month — o mês inteiro: lançamentos (com os modelos materializados) e resumo. */
export function monthsRouter(prisma: PrismaClient): Router {
  const router = Router()

  router.get('/months/:month', async (req, res) => {
    const userId = userIdOf(req)
    const month = paramMonth(req)
    const competenceMonth = competenceMonthToDate(month)

    await materializeMonth(prisma, userId, month)
    const [rows, monthSettings, settings] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, competenceMonth, deletedAt: null },
        include: transactionInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.monthSettings.findUnique({
        where: { userId_competenceMonth: { userId, competenceMonth } },
      }),
      financeSettings(prisma, userId),
    ])

    const transactions = rows.map(toTransaction)
    const monthGoal = centsToNumber(monthSettings?.savingsGoalCents ?? null)
    const body: MonthResponse = {
      month,
      summary: computeMonthSummary(transactions, {
        monthOverrideCents: monthGoal,
        defaultGoal: settings.savingsGoal,
      }),
      settings: {
        savingsGoalCents: monthGoal,
        defaultSavingsGoal: settings.savingsGoal as SavingsGoal,
        notes: monthSettings?.notes ?? null,
      },
      transactions,
    }
    res.json(body)
  })

  router.patch('/months/:month/settings', async (req, res) => {
    const userId = userIdOf(req)
    const month = paramMonth(req)
    const input = parse(updateMonthSettingsRequestSchema, req.body)
    const competenceMonth = competenceMonthToDate(month)
    const data = {
      ...(input.savingsGoalCents !== undefined && {
        savingsGoalCents: input.savingsGoalCents === null ? null : BigInt(input.savingsGoalCents),
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
    }
    const row = await prisma.monthSettings.upsert({
      where: { userId_competenceMonth: { userId, competenceMonth } },
      create: { userId, competenceMonth, ...data },
      update: data,
    })
    const body: MonthSettingsResponse = {
      savingsGoalCents: centsToNumber(row.savingsGoalCents),
      notes: row.notes,
    }
    res.json(body)
  })

  return router
}
