import { createPrismaClient, type PrismaClient } from '@orla/db'
import type { Express } from 'express'
import request from 'supertest'
import { createApp, type AppDeps } from '../../src/app.ts'
import { testDatabaseUrl } from './database-url.ts'

export const INVITE_CODE = 'convite-de-teste'
export const PASSWORD = 'senha-forte-123'

let prisma: PrismaClient | undefined

/** PrismaClient único por arquivo de teste, apontando para o banco `orla_test`. */
export function testPrisma(): PrismaClient {
  prisma ??= createPrismaClient(testDatabaseUrl())
  return prisma
}

export function makeApp(overrides: Partial<AppDeps> = {}): Express {
  const db = testPrisma()
  return createApp({
    prisma: db,
    version: 'test',
    timezone: 'America/Sao_Paulo',
    checkDatabase: async () => {
      await db.$queryRaw`SELECT 1`
    },
    appOrigin: 'http://localhost:5173',
    secureCookies: false,
    jwtSecret: 'segredo-de-teste-com-mais-de-32-caracteres!!',
    refreshPepper: 'pepper-de-teste-com-mais-de-32-caracteres!!',
    signupMode: 'invite',
    inviteCode: INVITE_CODE,
    // Os testes criam muitos usuários pelo mesmo IP; o limite de login fica no padrão (5).
    rateLimits: { signupPerMinute: 10_000 },
    ...overrides,
  })
}

/** Apaga todos os dados (as tabelas de domínio caem em cascata a partir de users). */
export async function resetDatabase(): Promise<void> {
  await testPrisma().$executeRawUnsafe(
    'TRUNCATE TABLE users, quotes_cache, provider_cache, provider_usage CASCADE',
  )
}

/** Cadastra um usuário e devolve um agent do supertest já logado (com os cookies). */
export async function signUp(app: Express, username: string) {
  const agent = request.agent(app)
  const res = await agent
    .post('/api/v1/auth/register')
    .send({ username, password: PASSWORD, inviteCode: INVITE_CODE })
  if (res.status !== 201)
    throw new Error(`Cadastro falhou: ${res.status} ${JSON.stringify(res.body)}`)
  return { agent, user: res.body as { id: string; username: string } }
}
