import type { SignupMode } from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import express, { type Express } from 'express'
import { createClock } from './lib/clock.ts'
import { dashboardRouter } from './routes/dashboard.ts'
import { exportsRouter } from './routes/exports.ts'
import { feedbackRouter } from './routes/feedback.ts'
import { importsRouter } from './routes/imports.ts'
import { RateLimiter } from './lib/rate-limit.ts'
import { requireAuth } from './middleware/auth.ts'
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts'
import { originCheck } from './middleware/origin-check.ts'
import { securityHeaders } from './middleware/security-headers.ts'
import { accountsRouter } from './routes/accounts.ts'
import { authRouter } from './routes/auth.ts'
import { cardStatementsRouter } from './routes/card-statements.ts'
import { categoriesRouter } from './routes/categories.ts'
import { creditCardsRouter } from './routes/credit-cards.ts'
import { healthRouter } from './routes/health.ts'
import { installmentPlansRouter } from './routes/installment-plans.ts'
import { jobsRouter } from './routes/jobs.ts'
import { portfolioRouter } from './routes/portfolio.ts'
import { monthsRouter } from './routes/months.ts'
import { payeesRouter } from './routes/payees.ts'
import { recurringTemplatesRouter } from './routes/recurring-templates.ts'
import { settingsRouter } from './routes/settings.ts'
import { transactionsRouter } from './routes/transactions.ts'
import { AuthService } from './services/auth.ts'
import { BrapiProvider, QuoteService, type QuoteProvider } from './services/quotes.ts'

export interface AppDeps {
  prisma: PrismaClient
  version: string
  timezone: string
  /** Deve lançar erro se o banco não responder (usado pelo /health). */
  checkDatabase: () => Promise<void>
  appOrigin: string
  /** Cookies `Secure` (true fora do ambiente local). */
  secureCookies: boolean
  jwtSecret: string
  refreshPepper: string
  signupMode: SignupMode
  inviteCode: string | undefined
  /** Tentativas por minuto (RNF-22). Padrão: 5 de login por IP+usuário e 5 cadastros por IP. */
  rateLimits?: { loginPerMinute?: number; signupPerMinute?: number }
  /** Relógio (os testes fixam a data). Padrão: agora. */
  now?: () => Date
  /** Provedor de cotações (os testes injetam um falso). Padrão: brapi sem token = desligado. */
  quoteProvider?: QuoteProvider
  /** Chamadas ao provedor por mês (padrão 13 mil, RC-32). */
  quotesMonthlyBudget?: number
  /** Segredo do cron de cotações; sem ele, /jobs/quotes responde 401. */
  cronSecret?: string | undefined
  /** Donos do app (ADMIN_USERNAMES, minúsculos): fila de relatos em /admin/feedback. */
  adminUsernames?: readonly string[]
}

/** Monta o app Express. Dependências injetadas para facilitar testes. */
export function createApp(deps: AppDeps): Express {
  const { prisma } = deps
  const clock = createClock(deps.timezone, deps.now)
  const auth = new AuthService(prisma, {
    jwtSecret: deps.jwtSecret,
    refreshPepper: deps.refreshPepper,
    signupMode: deps.signupMode,
    inviteCode: deps.inviteCode,
    adminUsernames: deps.adminUsernames ?? [],
  })

  const quotes = new QuoteService(prisma, deps.quoteProvider ?? new BrapiProvider(undefined), {
    monthlyBudget: deps.quotesMonthlyBudget ?? 13_000,
    now: deps.now ?? (() => new Date()),
  })

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(securityHeaders)
  // Backup completo e lotes de importação podem passar de 1 MB; o resto continua limitado.
  app.use(['/api/v1/restore', '/api/v1/imports'], express.json({ limit: '25mb' }))
  app.use(express.json({ limit: '1mb' }))

  const v1 = express.Router()
  v1.use(originCheck(deps.appOrigin))
  v1.use(healthRouter(deps))
  v1.use(jobsRouter(prisma, quotes, deps.cronSecret))
  v1.use(
    authRouter({
      prisma,
      auth,
      secureCookies: deps.secureCookies,
      loginLimiter: new RateLimiter(deps.rateLimits?.loginPerMinute ?? 5, 60_000),
      signupLimiter: new RateLimiter(deps.rateLimits?.signupPerMinute ?? 5, 60_000),
    }),
  )

  // Daqui para baixo, tudo exige sessão e é filtrado pelo usuário dela.
  const authed = express.Router()
  authed.use(requireAuth(auth))
  authed.use(settingsRouter(prisma))
  authed.use(accountsRouter(prisma))
  authed.use(creditCardsRouter(prisma))
  authed.use(categoriesRouter(prisma))
  authed.use(payeesRouter(prisma))
  authed.use(recurringTemplatesRouter(prisma, clock))
  authed.use(cardStatementsRouter(prisma, clock))
  authed.use(transactionsRouter(prisma))
  authed.use(monthsRouter(prisma))
  authed.use(installmentPlansRouter(prisma, clock))
  authed.use(dashboardRouter(prisma, clock))
  authed.use(importsRouter(prisma, clock))
  authed.use(exportsRouter(prisma))
  authed.use(portfolioRouter(prisma, clock, quotes))
  authed.use(feedbackRouter(prisma, auth))
  v1.use(authed)

  app.use('/api/v1', v1)
  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
