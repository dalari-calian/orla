import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createPrismaClient } from '@orla/db'
import { testDatabaseUrl } from './database-url.ts'

/** Cria o banco de teste se ainda não existir (conectando no banco administrativo `postgres`). */
async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url)
  const name = target.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Nome de banco de teste inválido: ${name}`)

  const admin = new URL(url)
  admin.pathname = '/postgres'
  const prisma = createPrismaClient(admin.toString())
  try {
    const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${name}) AS "exists"`
    if (!rows[0]?.exists) await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Prepara o banco de teste uma vez por execução: cria se precisar e aplica as migrations
 * pendentes (`migrate deploy`, não destrutivo). Cada teste limpa os dados com TRUNCATE.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl()
  await ensureDatabase(url)
  const dbPackageDir = fileURLToPath(new URL('../../../../packages/db', import.meta.url))
  execSync('pnpm exec prisma migrate deploy', {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}
