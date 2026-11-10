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
import { applyCarryover, dismissCarryover, resolveCarryover } from '../lib/carryover.ts'
import type { Clock } from '../lib/clock.ts'
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
export function monthsRouter(prisma: PrismaClient, clock: Clock): Router {
  const router = Router()

  router.get('/months/:month', async (req, res) => {
    const userId = userIdOf(req)
    const month = paramMonth(req)
    const competenceMonth = competenceMonthToDate(month)

    await materializeMonth(prisma, userId, month)
    // Antes de ler o mês: no modo automático isso cria/atualiza o saldo anterior.
    const carryover = await resolveCarryover(prisma, userId, month, clock)
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
    const invested = centsToNumber(monthSettings?.goalInvestedCents ?? null)
    const body: MonthResponse = {
      month,
      summary: computeMonthSummary(transactions, {
        monthOverrideCents: monthGoal,
        defaultGoal: settings.savingsGoal,
        investedCents: invested,
      }),
      settings: {
        savingsGoalCents: monthGoal,
        goalInvestedCents: invested,
        defaultSavingsGoal: settings.savingsGoal as SavingsGoal,
        notes: monthSettings?.notes ?? null,
      },
      carryover,
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
      ...(input.goalInvestedCents !== undefined && {
        goalInvestedCents:
          input.goalInvestedCents === null ? null : BigInt(input.goalInvestedCents),
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
      goalInvestedCents: centsToNumber(row.goalInvestedCents),
      notes: row.notes,
    }
    res.json(body)
  })

  /** RF-56: leva (ou atualiza) o saldo atual do mês anterior para este mês. */
  router.post('/months/:month/carryover', async (req, res) => {
    await applyCarryover(prisma, userIdOf(req), paramMonth(req))
    res.status(204).end()
  })

  /** RF-55: "Ignorar" — tira o saldo levado e não oferece de novo neste mês. */
  router.delete('/months/:month/carryover', async (req, res) => {
    await dismissCarryover(prisma, userIdOf(req), paramMonth(req))
    res.status(204).end()
  })

  return router
}
