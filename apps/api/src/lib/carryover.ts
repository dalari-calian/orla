import {
  addMonths,
  CARRYOVER_MODES,
  carryoverEntry,
  compareMonths,
  competenceMonthToDate,
  computeMonthSummary,
  decideCarryover,
  signedCarryoverCents,
  type CarryoverMode,
} from '@orla/core'
import type { MonthCarryover } from '@orla/contracts'
import { Prisma, type PrismaClient } from '@orla/db'
import { centsToNumber } from './db.ts'
import { financeSettings, materializeMonth, toTransaction, transactionInclude } from './finance.ts'
import type { Clock } from './clock.ts'

/** Saldo do mês anterior (RF-54..56): leitura, decisão e aplicação. */

export async function carryoverMode(prisma: PrismaClient, userId: string): Promise<CarryoverMode> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { carryoverMode: true },
  })
  const mode = row?.carryoverMode
  return (CARRYOVER_MODES as readonly string[]).includes(mode ?? '')
    ? (mode as CarryoverMode)
    : 'ask'
}

/** Saldo atual de um mês (mesma conta do resumo) e quantos lançamentos ainda estão previstos. */
export async function monthBalance(
  prisma: PrismaClient,
  userId: string,
  month: string,
): Promise<{ balanceCents: number; pendingCount: number }> {
  const competenceMonth = competenceMonthToDate(month)
  const [rows, monthSettings, settings] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, competenceMonth, deletedAt: null },
      include: transactionInclude,
    }),
    prisma.monthSettings.findUnique({
      where: { userId_competenceMonth: { userId, competenceMonth } },
    }),
    financeSettings(prisma, userId),
  ])
  const transactions = rows.map(toTransaction)
  const summary = computeMonthSummary(transactions, {
    monthOverrideCents: centsToNumber(monthSettings?.savingsGoalCents ?? null),
    defaultGoal: settings.savingsGoal,
    investedCents: centsToNumber(monthSettings?.goalInvestedCents ?? null),
  })
  return {
    balanceCents: summary.currentBalanceCents,
    pendingCount: transactions.filter(
      (item) => item.status === 'forecast' && item.nature !== 'carryover',
    ).length,
  }
}

function findCarryover(db: PrismaClient | Prisma.TransactionClient, userId: string, month: string) {
  return db.transaction.findFirst({
    where: {
      userId,
      competenceMonth: competenceMonthToDate(month),
      nature: 'carryover',
      deletedAt: null,
    },
  })
}

/**
 * Leva o saldo atual do mês anterior para `month` (cria, atualiza ou — se o saldo
 * zerou — remove o lançamento). Idempotente.
 */
export async function applyCarryover(
  prisma: PrismaClient,
  userId: string,
  month: string,
): Promise<void> {
  const previousMonth = addMonths(month, -1)
  const { balanceCents } = await monthBalance(prisma, userId, previousMonth)
  const entry = carryoverEntry(balanceCents, previousMonth)
  const competenceMonth = competenceMonthToDate(month)

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await findCarryover(tx, userId, month)
      if (!entry) {
        if (existing) {
          await tx.transaction.update({
            where: { id: existing.id },
            data: { deletedAt: new Date() },
          })
        }
        return
      }
      const data = {
        type: entry.type,
        amountCents: BigInt(entry.amountCents),
        description: entry.description,
      }
      if (existing) {
        await tx.transaction.update({ where: { id: existing.id }, data })
        return
      }
      await tx.transaction.create({
        data: {
          ...data,
          userId,
          nature: 'carryover',
          // O dinheiro já está na conta: entra realizado, no dia 1 do mês.
          status: 'settled',
          competenceMonth,
          date: competenceMonth,
          source: 'manual',
        },
      })
      // Levar de novo desfaz um "Ignorar" anterior.
      await tx.monthSettings.updateMany({
        where: { userId, competenceMonth },
        data: { carryoverDismissedAt: null },
      })
    })
  } catch (error) {
    // Duas aberturas simultâneas do mês (modo automático): a outra já criou.
    const duplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    if (!duplicate) throw error
  }
}

/** "Ignorar": remove o saldo levado (se houver) e não oferece de novo neste mês. */
export async function dismissCarryover(
  prisma: PrismaClient,
  userId: string,
  month: string,
): Promise<void> {
  const competenceMonth = competenceMonthToDate(month)
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { userId, competenceMonth, nature: 'carryover', deletedAt: null },
      data: { deletedAt: new Date() },
    }),
    prisma.monthSettings.upsert({
      where: { userId_competenceMonth: { userId, competenceMonth } },
      create: { userId, competenceMonth, carryoverDismissedAt: new Date() },
      update: { carryoverDismissedAt: new Date() },
    }),
  ])
}

/**
 * RF-55: estado do saldo anterior visto de `month`. No modo automático, já aplica
 * (ou sincroniza) quando o mês anterior terminou — por isso roda antes de ler o mês.
 */
export async function resolveCarryover(
  prisma: PrismaClient,
  userId: string,
  month: string,
  clock: Clock,
): Promise<MonthCarryover> {
  const previousMonth = addMonths(month, -1)
  const currentMonth = clock.currentMonth()
  const competenceMonth = competenceMonthToDate(month)

  // Mês anterior já começou: abre os modelos dele para o saldo e os previstos baterem.
  if (compareMonths(previousMonth, currentMonth) <= 0) {
    await materializeMonth(prisma, userId, previousMonth)
  }
  const [mode, previous, existing, monthSettings] = await Promise.all([
    carryoverMode(prisma, userId),
    monthBalance(prisma, userId, previousMonth),
    findCarryover(prisma, userId, month),
    prisma.monthSettings.findUnique({
      where: { userId_competenceMonth: { userId, competenceMonth } },
      select: { carryoverDismissedAt: true },
    }),
  ])
  const appliedCents = existing
    ? signedCarryoverCents({
        type: existing.type,
        amountCents: centsToNumber(existing.amountCents),
      })
    : null
  const decision = decideCarryover({
    month,
    currentMonth,
    mode,
    previousBalanceCents: previous.balanceCents,
    appliedCents,
    dismissed: monthSettings?.carryoverDismissedAt != null,
  })

  if (decision.state === 'apply') {
    await applyCarryover(prisma, userId, month)
    return {
      ...decision,
      // Saldo zero sincronizado = lançamento removido.
      state: previous.balanceCents === 0 ? 'none' : 'applied',
      appliedCents: previous.balanceCents === 0 ? null : previous.balanceCents,
      previousPendingCount: previous.pendingCount,
    }
  }
  return { ...decision, state: decision.state, previousPendingCount: previous.pendingCount }
}
