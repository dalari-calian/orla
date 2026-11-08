import {
  competenceMonthToDate,
  isCompetenceMonth,
  statementDates,
  statementStatus,
  sumCents,
  type CompetenceMonth,
} from '@orla/core'
import type { CardStatement } from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router, type Request } from 'express'
import type { Clock } from '../lib/clock.ts'
import { ensureFound, paramId } from '../lib/db.ts'
import { notFound } from '../lib/errors.ts'
import { financeSettings, toTransaction, transactionInclude } from '../lib/finance.ts'
import { userIdOf } from '../middleware/auth.ts'

function paramMonth(req: Request): CompetenceMonth {
  const value = req.params.month
  if (!isCompetenceMonth(value)) throw notFound('Mês inválido (use AAAA-MM)')
  return value
}

/** /credit-cards/:id/statements/:month — fatura do cartão (RF-31/32). */
export function cardStatementsRouter(prisma: PrismaClient, clock: Clock): Router {
  const router = Router()

  async function load(req: Request): Promise<CardStatement> {
    const userId = userIdOf(req)
    const card = await ensureFound(
      prisma.creditCard.findFirst({ where: { id: paramId(req), userId, deletedAt: null } }),
      'Cartão não encontrado',
    )
    const month = paramMonth(req)
    const competenceMonth = competenceMonthToDate(month)
    const { cardCompetence } = await financeSettings(prisma, userId)
    const [rows, future] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, creditCardId: card.id, competenceMonth, deletedAt: null, type: 'expense' },
        include: transactionInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          creditCardId: card.id,
          competenceMonth: { gt: competenceMonth },
          deletedAt: null,
          type: 'expense',
          status: 'forecast',
        },
        _sum: { amountCents: true },
      }),
    ])
    const transactions = rows.map(toTransaction)
    const dates = statementDates(month, card, cardCompetence)
    const settled = transactions.filter((item) => item.status === 'settled')
    return {
      creditCardId: card.id,
      month,
      ...dates,
      status: statementStatus({
        closingDate: dates.closingDate,
        today: clock.today(),
        transactionCount: transactions.length,
        allSettled: settled.length === transactions.length,
      }),
      totalCents: sumCents(transactions.map((item) => item.amountCents)),
      settledCents: sumCents(settled.map((item) => item.amountCents)),
      futureTotalCents: Number(future._sum.amountCents ?? 0n),
      transactions,
    }
  }

  router.get('/credit-cards/:id/statements/:month', async (req, res) => {
    res.json(await load(req))
  })

  /** Marcar fatura como paga → todos os lançamentos dela realizados (RF-31). */
  router.post('/credit-cards/:id/statements/:month/pay', async (req, res) => {
    const statement = await load(req)
    const ids = statement.transactions
      .filter((item) => item.status === 'forecast')
      .map((item) => item.id)
    if (ids.length > 0) {
      await prisma.transaction.updateMany({
        where: { id: { in: ids }, userId: userIdOf(req) },
        data: { status: 'settled' },
      })
    }
    res.json(await load(req))
  })

  return router
}
