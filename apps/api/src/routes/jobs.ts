import { timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@orla/db'
import { Router, type Request } from 'express'
import { unauthorized } from '../lib/errors.ts'
import type { QuoteService } from '../services/quotes.ts'

/** Tickers por execução do cron (o orçamento mensal continua valendo). */
const JOB_LIMIT = 200

function authorized(req: Request, secret: string): boolean {
  const header = req.get('authorization') ?? ''
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''))
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * GET /jobs/quotes (RC-32): cron diário ao fim do pregão. Atualiza só os tickers vencidos de
 * todos os usuários, respeitando a validade do cache e o orçamento do mês.
 */
export function jobsRouter(
  prisma: PrismaClient,
  quotes: QuoteService,
  cronSecret: string | undefined,
): Router {
  const router = Router()
  router.get('/jobs/quotes', async (req, res) => {
    if (!cronSecret || !authorized(req, cronSecret)) throw unauthorized('Não autorizado')
    const rows = await prisma.asset.findMany({
      where: { deletedAt: null, isArchived: false, quoteMode: 'auto', ticker: { not: null } },
      select: { ticker: true },
      distinct: ['ticker'],
    })
    const tickers = rows.map((row) => row.ticker as string)
    const result = await quotes.refresh(tickers, JOB_LIMIT)
    res.json({ tickers: tickers.length, ...result, budgetLeft: await quotes.budgetLeft() })
  })
  return router
}
