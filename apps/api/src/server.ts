import { createPrismaClient } from '@orla/db'
import { parseAdminUsernames } from '@orla/core'
import { createApp } from './app.ts'
import { loadEnv } from './env.ts'
import { BrapiProvider } from './services/quotes.ts'

const env = loadEnv()
const prisma = createPrismaClient(env.DATABASE_URL)

const app = createApp({
  prisma,
  version: process.env.npm_package_version ?? '0.0.0',
  timezone: env.APP_TIMEZONE,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`
  },
  appOrigin: env.APP_ORIGIN,
  // Em localhost os navegadores aceitam cookie Secure, mas o Vite/HTTP local simplifica sem ele.
  secureCookies: env.NODE_ENV === 'production',
  jwtSecret: env.JWT_SECRET,
  refreshPepper: env.REFRESH_TOKEN_PEPPER,
  signupMode: env.SIGNUP_MODE,
  inviteCode: env.SIGNUP_INVITE_CODE,
  quoteProvider: new BrapiProvider(env.BRAPI_TOKEN),
  quotesMonthlyBudget: env.QUOTES_MONTHLY_BUDGET,
  cronSecret: env.CRON_SECRET,
  adminUsernames: parseAdminUsernames(env.ADMIN_USERNAMES),
})

const server = app.listen(env.API_PORT, () => {
  console.info(`API do Orla em http://localhost:${env.API_PORT}/api/v1/health`)
})

function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0))
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
