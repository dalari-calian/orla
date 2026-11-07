// Dados de exemplo para desenvolvimento local: `pnpm db:seed`.
import bcrypt from 'bcryptjs'
import { createPrismaClient } from '../src/index.ts'
import { loadRootEnv } from '../src/load-env.ts'

loadRootEnv()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl)
  throw new Error('DATABASE_URL não definida. Crie o .env a partir do .env.example.')

const prisma = createPrismaClient(databaseUrl)

const DEMO_USERNAME = 'demo'
const DEMO_PASSWORD = 'orla1234'

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const user = await prisma.user.upsert({
    where: { username: DEMO_USERNAME },
    update: {},
    create: { username: DEMO_USERNAME, passwordHash, displayName: 'Usuário Demo' },
  })
  console.info(`Seed ok — usuário "${user.username}" (senha: ${DEMO_PASSWORD}).`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
