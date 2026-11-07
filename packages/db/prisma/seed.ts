// Dados de exemplo para desenvolvimento local: `pnpm db:seed` (idempotente).
import { DEFAULT_CATEGORIES } from '@orla/core'
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

  // Mesmo estado de um cadastro novo, mas com o onboarding já concluído.
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, onboardingCompletedAt: new Date() },
  })

  const hasCategories = await prisma.category.count({ where: { userId: user.id } })
  if (hasCategories === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((category, index) => ({
        userId: user.id,
        kind: category.kind,
        name: category.name,
        icon: category.icon,
        color: category.color,
        sortOrder: index,
      })),
    })
  }

  const hasAccounts = await prisma.account.count({ where: { userId: user.id } })
  if (hasAccounts === 0) {
    const nubank = await prisma.account.create({
      data: { userId: user.id, name: 'Nubank', kind: 'checking', color: '#8A05BE' },
    })
    await prisma.account.create({
      data: { userId: user.id, name: 'Rico', kind: 'brokerage', color: '#FF5A00' },
    })
    await prisma.creditCard.create({
      data: {
        userId: user.id,
        accountId: nubank.id,
        name: 'Nubank Roxinho',
        closingDay: 3,
        dueDay: 10,
      },
    })
  }

  console.info(`Seed ok — usuário "${user.username}" (senha: ${DEMO_PASSWORD}).`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
