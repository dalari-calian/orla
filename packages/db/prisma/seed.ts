// Dados de exemplo para desenvolvimento local: `pnpm db:seed` (idempotente).
import {
  addMonths,
  buildInstallmentSchedule,
  competenceMonthToDate,
  currentCompetenceMonth,
  dateInMonth,
  DEFAULT_CATEGORIES,
  isoDateToDate,
} from '@orla/core'
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

  await seedFinances(user.id)

  console.info(`Seed ok — usuário "${user.username}" (senha: ${DEMO_PASSWORD}).`)
}

/**
 * Fase 2: salário, contas fixas, um planejamento anual, um parcelamento e alguns gastos do
 * mês atual. Só roda se o demo ainda não tem modelos recorrentes (idempotente).
 */
async function seedFinances(userId: string): Promise<void> {
  if ((await prisma.recurringTemplate.count({ where: { userId } })) > 0) return

  const month = currentCompetenceMonth()
  const categories = await prisma.category.findMany({ where: { userId, deletedAt: null } })
  const category = (kind: string, name: string) =>
    categories.find((item) => item.kind === kind && item.name === name)?.id ?? null
  const nubank = await prisma.account.findFirst({ where: { userId, name: 'Nubank' } })
  const card = await prisma.creditCard.findFirst({ where: { userId, deletedAt: null } })
  if (!nubank || !card) return

  await prisma.userSettings.update({
    where: { userId },
    data: { defaultSavingsGoalCents: 120000n, defaultSavingsGoalPct: null },
  })

  const start = competenceMonthToDate(addMonths(month, -2))
  await prisma.recurringTemplate.createMany({
    data: [
      {
        userId,
        type: 'income',
        nature: 'fixed',
        frequency: 'monthly',
        description: 'Salário',
        amountCents: 600000n,
        dayOfMonth: 5,
        startMonth: start,
        categoryId: category('income', 'Salário'),
        accountId: nubank.id,
      },
      {
        userId,
        type: 'expense',
        nature: 'fixed',
        frequency: 'monthly',
        description: 'Aluguel',
        amountCents: 150000n,
        dayOfMonth: 10,
        startMonth: start,
        categoryId: category('expense', 'Moradia'),
        paymentMethod: 'boleto',
        accountId: nubank.id,
      },
      {
        userId,
        type: 'expense',
        nature: 'fixed',
        frequency: 'monthly',
        description: 'Netflix',
        amountCents: 5590n,
        dayOfMonth: 15,
        startMonth: start,
        categoryId: category('expense', 'Assinaturas'),
        paymentMethod: 'credit',
        creditCardId: card.id,
      },
      {
        userId,
        type: 'expense',
        nature: 'planned',
        frequency: 'yearly',
        monthOfYear: 10,
        description: 'Meu aniversário',
        amountCents: 20000n,
        dayOfMonth: 20,
        startMonth: start,
        categoryId: category('expense', 'Lazer'),
      },
    ],
  })

  // Nintendo Switch 12× de R$ 166,67, já na parcela 2 neste mês.
  const schedule = buildInstallmentSchedule({
    totalCents: 200000,
    count: 12,
    firstCompetenceMonth: addMonths(month, -1),
    currentInstallment: 2,
  })
  const plan = await prisma.installmentPlan.create({
    data: {
      userId,
      description: 'Nintendo Switch',
      categoryId: category('expense', 'Lazer'),
      creditCardId: card.id,
      paymentMethod: 'credit',
      purchaseDate: isoDateToDate(dateInMonth(addMonths(month, -2), 20)),
      totalCents: 200000n,
      installmentsCount: 12,
      firstCompetenceMonth: competenceMonthToDate(addMonths(month, -1)),
    },
  })
  await prisma.transaction.createMany({
    data: schedule.map((item) => ({
      userId,
      type: 'expense',
      nature: 'installment',
      status: item.status,
      description: 'Nintendo Switch',
      amountCents: BigInt(item.amountCents),
      competenceMonth: competenceMonthToDate(item.competenceMonth),
      date: isoDateToDate(dateInMonth(item.competenceMonth, card.dueDay)),
      categoryId: plan.categoryId,
      paymentMethod: 'credit',
      creditCardId: card.id,
      installmentPlanId: plan.id,
      installmentNumber: item.number,
      source: 'plan',
    })),
  })

  // Alguns gastos do dia neste mês.
  const competenceMonth = competenceMonthToDate(month)
  await prisma.transaction.createMany({
    data: [
      { description: 'Mercado', amountCents: 23450n, day: 2, category: 'Mercado', method: 'debit' },
      {
        description: 'iFood',
        amountCents: 4590n,
        day: 3,
        category: 'Alimentação fora',
        method: 'pix',
      },
      { description: 'Uber', amountCents: 1870n, day: 4, category: 'Transporte', method: 'pix' },
    ].map((item) => ({
      userId,
      type: 'expense',
      nature: 'variable',
      status: 'settled',
      description: item.description,
      amountCents: item.amountCents,
      competenceMonth,
      date: isoDateToDate(dateInMonth(month, item.day)),
      categoryId: category('expense', item.category),
      paymentMethod: item.method,
      accountId: nubank.id,
    })),
  })
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
