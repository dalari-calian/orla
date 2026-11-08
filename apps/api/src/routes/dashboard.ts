import {
  addDaysIso,
  addMonths,
  addSummaries,
  breakdownBy,
  budgetStatuses,
  categoryBreakdown,
  competenceMonthToDate,
  effectiveExpenses,
  EMPTY_SUMMARY,
  firstNegativeMonth,
  isCompetenceMonth,
  isoDateToDate,
  periodMonths,
  projectionRow,
  statementDates,
  sumCents,
  topPayees,
  upcomingBills,
  type CompetenceMonth,
  type ExpenseShare,
} from '@orla/core'
import {
  dashboardQuerySchema,
  projectionQuerySchema,
  upcomingQuerySchema,
  type DashboardResponse,
  type PaymentMethod,
  type ProjectionResponse,
  type UpcomingResponse,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router, type Request } from 'express'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber } from '../lib/db.ts'
import { notFound } from '../lib/errors.ts'
import {
  financeSettings,
  materializeMonth,
  nextMonthDate,
  toTransaction,
  transactionInclude,
} from '../lib/finance.ts'
import { loadMonths, type MonthData } from '../lib/month-data.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

function paramMonth(req: Request): CompetenceMonth {
  const value = req.params.month
  if (!isCompetenceMonth(value)) throw notFound('Mês inválido (use AAAA-MM)')
  return value
}

function pick(data: Map<string, MonthData>, months: readonly string[]): MonthData[] {
  return months.flatMap((month) => {
    const item = data.get(month)
    return item ? [item] : []
  })
}

/** Despesas efetivas de vários meses (o RF-22 vale dentro de cada mês). */
function expensesOf(months: readonly MonthData[]): ExpenseShare[] {
  return months.flatMap((item) => effectiveExpenses(item.transactions))
}

/** Dashboard (doc 04 §8), projeção (RF-52) e próximos vencimentos (doc 04 §8.8). */
export function dashboardRouter(prisma: PrismaClient, clock: Clock): Router {
  const router = Router()

  router.get('/months/:month/dashboard', async (req, res) => {
    const userId = userIdOf(req)
    const month = paramMonth(req)
    const { period } = parse(dashboardQuerySchema, req.query)
    const { months, previous } = periodMonths(month, period)
    const last = months[months.length - 1] ?? month
    const evolutionFrom = addMonths(last, -11)
    const from = previous[0] && previous[0] < evolutionFrom ? previous[0] : evolutionFrom

    const [data, categories] = await Promise.all([
      loadMonths(prisma, userId, from, last),
      prisma.category.findMany({
        where: { userId, deletedAt: null, kind: 'expense' },
        select: { id: true, parentId: true, monthlyBudgetCents: true },
      }),
    ])
    const current = pick(data, months)
    const before = pick(data, previous)
    const expenses = expensesOf(current)
    const parents = new Map(categories.map((category) => [category.id, category.parentId]))

    const body: DashboardResponse = {
      month,
      period,
      months,
      summary: current.reduce((total, item) => addSummaries(total, item.summary), EMPTY_SUMMARY),
      previousSummary: before.reduce(
        (total, item) => addSummaries(total, item.summary),
        EMPTY_SUMMARY,
      ),
      byCategory: categoryBreakdown(expenses, expensesOf(before), (id) => parents.get(id) ?? null),
      byPaymentMethod: breakdownBy(expenses, (item) => item.paymentMethod).map(
        ({ key, amountCents, share }) => ({
          paymentMethod: key as PaymentMethod | null,
          amountCents,
          share,
        }),
      ),
      byAccount: breakdownBy(expenses, (item) => item.accountId).map(
        ({ key, amountCents, share }) => ({ accountId: key, amountCents, share }),
      ),
      byCard: breakdownBy(
        expenses.filter((item) => item.transaction.creditCardId !== null),
        (item) => item.creditCardId ?? '',
      ).map(({ key, amountCents, share }) => ({ creditCardId: key, amountCents, share })),
      topPayees: topPayees(expenses, 5),
      budgets: budgetStatuses(
        categories.map((category) => ({
          id: category.id,
          parentId: category.parentId,
          monthlyBudgetCents: centsToNumber(category.monthlyBudgetCents),
        })),
        expenses,
        months.length,
      ),
      evolution: pick(
        data,
        Array.from({ length: 12 }, (_, i) => addMonths(evolutionFrom, i)),
      ).map((item) => ({
        month: item.month,
        incomeCents: item.summary.incomeForecastCents,
        expenseCents: item.summary.expenseForecastCents,
        // Mês sem nenhum lançamento (antes de começar a usar o app): sem meta, sobra zero.
        surplusCents: item.transactions.length === 0 ? 0 : item.summary.projectedSurplusCents,
      })),
    }
    res.json(body)
  })

  router.get('/projection', async (req, res) => {
    const userId = userIdOf(req)
    const query = parse(projectionQuerySchema, req.query)
    const from = query.from ?? clock.currentMonth()
    const to = addMonths(from, query.months - 1)
    const data = await loadMonths(prisma, userId, from, to)
    const rows = [...data.values()].map((item) =>
      projectionRow(item.month, item.transactions, item.summary),
    )
    const body: ProjectionResponse = { from, rows, firstNegativeMonth: firstNegativeMonth(rows) }
    res.json(body)
  })

  router.get('/upcoming', async (req, res) => {
    const userId = userIdOf(req)
    const { days } = parse(upcomingQuerySchema, req.query)
    const today = clock.today()
    const month = clock.currentMonth()
    const next = addMonths(month, 1)
    // O que vence nos próximos dias pode ser do mês que vem: abre os dois meses (RF-11).
    await materializeMonth(prisma, userId, month)
    await materializeMonth(prisma, userId, next)

    const [rows, cards, settings] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          type: 'expense',
          competenceMonth: {
            gte: competenceMonthToDate(addMonths(month, -1)),
            lt: nextMonthDate(addMonths(next, 1)),
          },
        },
        include: transactionInclude,
      }),
      prisma.creditCard.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, closingDay: true, dueDay: true },
      }),
      financeSettings(prisma, userId),
    ])
    const transactions = rows.map(toTransaction)
    // Atrasados até 31 dias para trás; mais antigos que isso já viraram outra conversa.
    const recent = transactions.filter(
      (item) => isoDateToDate(item.date) >= isoDateToDate(addDaysIso(today, -31)),
    )

    const statements = cards.flatMap((card) =>
      [month, next, addMonths(next, 1)].map((competenceMonth) => ({
        creditCardId: card.id,
        competenceMonth,
        dueDate: statementDates(competenceMonth, card, settings.cardCompetence).dueDate,
        amountCents: sumCents(
          transactions
            .filter(
              (item) =>
                item.creditCardId === card.id &&
                item.competenceMonth === competenceMonth &&
                item.status === 'forecast',
            )
            .map((item) => item.amountCents),
        ),
      })),
    )

    const items = upcomingBills({ transactions: recent, statements, today, days })
    const body: UpcomingResponse = {
      today,
      items: items.map((item) =>
        item.kind === 'transaction'
          ? {
              kind: 'transaction',
              date: item.date,
              amountCents: item.amountCents,
              transaction: item.transaction,
            }
          : {
              kind: 'statement',
              date: item.date,
              amountCents: item.amountCents,
              creditCardId: item.statement.creditCardId,
              competenceMonth: item.statement.competenceMonth,
            },
      ),
    }
    res.json(body)
  })

  return router
}
