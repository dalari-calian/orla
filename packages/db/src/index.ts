import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'

export * from './generated/prisma/client.ts'

/** Cria um PrismaClient usando o driver `pg` (Postgres local/Docker ou qualquer Postgres). */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
