import { createPrismaClient } from '@orla/db'
import { createApp } from './app.ts'
import { loadEnv } from './env.ts'

const env = loadEnv()
const prisma = createPrismaClient(env.DATABASE_URL)

const app = createApp({
  version: process.env.npm_package_version ?? '0.0.0',
  timezone: env.APP_TIMEZONE,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`
  },
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
