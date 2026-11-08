import {
  addMonths,
  competenceMonthToDate,
  dateToCompetenceMonth,
  dateInMonth,
  dateToIsoDate,
  isoDateToCompetenceMonth,
  isoDateToDate,
  parseIsoDate,
  statementCompetenceMonth,
  statementDates,
  templateDateIn,
  templatesToMaterialize,
  type CardCompetenceMode,
  type SavingsGoalSetting,
} from '@orla/core'
import type {
  PaymentMethod,
  Transaction,
  TransactionNature,
  TransactionStatus,
  TransactionType,
} from '@orla/contracts'
import type { Prisma, PrismaClient } from '@orla/db'
import { centsToNumber, toIso } from './db.ts'
import { validationError } from './errors.ts'

/** Cliente do Prisma ou um cliente de transação (`$transaction(async (tx) => ...)`). */
export type Db = PrismaClient | Prisma.TransactionClient

// ─── Lançamentos ─────────────────────────────────────────────────────────────

/** Junta o nº total de parcelas do parcelamento (para exibir "3/12"). */
export const transactionInclude = {
  installmentPlan: { select: { installmentsCount: true } },
} as const

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>

/** Linha do banco → DTO. Os enums em texto são garantidos pelas CHECKs da migration. */
export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as TransactionType,
    nature: row.nature as TransactionNature,
    status: row.status as TransactionStatus,
    description: row.description,
    amountCents: centsToNumber(row.amountCents),
    competenceMonth: dateToCompetenceMonth(row.competenceMonth),
    date: dateToIsoDate(row.date),
    categoryId: row.categoryId,
    accountId: row.accountId,
    payeeId: row.payeeId,
    paymentMethod: row.paymentMethod as PaymentMethod | null,
    creditCardId: row.creditCardId,
    recurringTemplateId: row.recurringTemplateId,
    installmentPlanId: row.installmentPlanId,
    installmentNumber: row.installmentNumber,
    installmentsCount: row.installmentPlan?.installmentsCount ?? null,
    parentPlannedId: row.parentPlannedId,
    isOverride: row.isOverride,
    tags: row.tags,
    notes: row.notes,
    source: row.source as Transaction['source'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

// ─── Referências do próprio usuário ──────────────────────────────────────────

function invalidRef(path: string, message: string): never {
  throw validationError(message, { fields: [{ path, message }] })
}

export interface RefInput {
  categoryId?: string | null | undefined
  /** Tipo exigido da categoria (receita/despesa). */
  categoryKind?: TransactionType | undefined
  accountId?: string | null | undefined
  payeeId?: string | null | undefined
  creditCardId?: string | null | undefined
}

export interface CardRef {
  id: string
  closingDay: number
  dueDay: number
}

/**
 * Garante que cada referência existe, não está excluída e é do usuário — senão 400
 * com o campo (nunca revela se o ID existe para outro usuário). Devolve o cartão,
 * que é usado na regra de fatura.
 */
export async function assertRefs(
  db: Db,
  userId: string,
  refs: RefInput,
): Promise<{ card: CardRef | null }> {
  if (refs.categoryId) {
    const category = await db.category.findFirst({
      where: { id: refs.categoryId, userId, deletedAt: null },
      select: { kind: true },
    })
    if (!category) invalidRef('categoryId', 'Categoria não encontrada')
    if (refs.categoryKind && category.kind !== refs.categoryKind) {
      invalidRef(
        'categoryId',
        refs.categoryKind === 'income'
          ? 'Escolha uma categoria de receita'
          : 'Escolha uma categoria de despesa',
      )
    }
  }
  if (refs.accountId) {
    const account = await db.account.findFirst({
      where: { id: refs.accountId, userId, deletedAt: null },
      select: { id: true },
    })
    if (!account) invalidRef('accountId', 'Conta não encontrada')
  }
  if (refs.payeeId) {
    const payee = await db.payee.findFirst({
      where: { id: refs.payeeId, userId, deletedAt: null },
      select: { id: true },
    })
    if (!payee) invalidRef('payeeId', 'Estabelecimento não encontrado')
  }
  let card: CardRef | null = null
  if (refs.creditCardId) {
    card = await db.creditCard.findFirst({
      where: { id: refs.creditCardId, userId, deletedAt: null },
      select: { id: true, closingDay: true, dueDay: true },
    })
    if (!card) invalidRef('creditCardId', 'Cartão não encontrado')
  }
  return { card }
}

// ─── Preferências usadas nos cálculos ────────────────────────────────────────

export interface FinanceSettings {
  cardCompetence: CardCompetenceMode
  savingsGoal: SavingsGoalSetting
}

export async function financeSettings(db: Db, userId: string): Promise<FinanceSettings> {
  const row = await db.userSettings.findUnique({ where: { userId } })
  let savingsGoal: SavingsGoalSetting = { mode: 'none' }
  if (row?.defaultSavingsGoalCents != null) {
    savingsGoal = { mode: 'fixed', amountCents: centsToNumber(row.defaultSavingsGoalCents) }
  } else if (row?.defaultSavingsGoalPct != null) {
    savingsGoal = { mode: 'percent', percent: row.defaultSavingsGoalPct.toString() }
  }
  return {
    cardCompetence: row?.cardCompetence === 'closing_month' ? 'closing_month' : 'due_month',
    savingsGoal,
  }
}

// ─── Materialização dos modelos recorrentes (RF-11) ──────────────────────────

type TemplateRow = Prisma.RecurringTemplateGetPayload<object>

/** Linha do modelo → regra de recorrência do core (meses como `YYYY-MM`). */
export function templateRule(template: TemplateRow) {
  return {
    ...template,
    frequency: template.frequency === 'yearly' ? ('yearly' as const) : ('monthly' as const),
    startMonth: dateToCompetenceMonth(template.startMonth),
    endMonth: template.endMonth ? dateToCompetenceMonth(template.endMonth) : null,
  }
}

/**
 * Cria os lançamentos previstos dos modelos ativos que ainda não têm lançamento no mês.
 * Idempotente: o índice único (modelo, mês) + `skipDuplicates` cobrem requisições em paralelo,
 * e um lançamento gerado que foi excluído conta como existente (não reaparece).
 */
export async function materializeMonth(db: Db, userId: string, month: string): Promise<void> {
  const templates = await db.recurringTemplate.findMany({
    where: { userId, deletedAt: null, isActive: true },
  })
  if (templates.length === 0) return

  const competenceMonth = competenceMonthToDate(month)
  const existing = await db.transaction.findMany({
    where: {
      userId,
      competenceMonth,
      recurringTemplateId: { in: templates.map((template) => template.id) },
    },
    select: { recurringTemplateId: true },
  })
  const generated = new Set(existing.map((row) => row.recurringTemplateId ?? ''))
  const missing = templatesToMaterialize(templates.map(templateRule), month, generated)
  if (missing.length === 0) return

  await db.transaction.createMany({
    skipDuplicates: true,
    data: missing.map((template) => ({
      userId,
      type: template.type,
      nature: template.nature,
      status: 'forecast',
      description: template.description,
      amountCents: template.amountCents,
      competenceMonth,
      date: isoDateToDate(templateDateIn(template, month)),
      categoryId: template.categoryId,
      accountId: template.accountId,
      payeeId: template.payeeId,
      paymentMethod: template.paymentMethod,
      creditCardId: template.creditCardId,
      recurringTemplateId: template.id,
      source: 'template',
    })),
  })
}

/** Primeiro dia do mês seguinte (limite exclusivo para filtros de mês). */
export function nextMonthDate(month: string): Date {
  return competenceMonthToDate(addMonths(month, 1))
}

// ─── Competência e datas ─────────────────────────────────────────────────────

/**
 * Competência de um lançamento (RF-02/03): informada pelo usuário, ou a da fatura
 * no crédito, ou o mês da data.
 */
export function resolveCompetence(input: {
  competenceMonth?: string | undefined
  date: string
  card: CardRef | null
  mode: 'due_month' | 'closing_month'
}): string {
  if (input.competenceMonth) return input.competenceMonth
  if (input.card) return statementCompetenceMonth(input.date, input.card, input.mode)
  return isoDateToCompetenceMonth(input.date)
}

/**
 * Data de cada parcela: no crédito, o vencimento da fatura; senão o mesmo dia da compra
 * em cada mês (dia 31 em mês curto → último dia).
 */
export function installmentDate(
  competenceMonth: string,
  purchaseDate: string,
  card: CardRef | null,
  mode: CardCompetenceMode,
): Date {
  if (card) return isoDateToDate(statementDates(competenceMonth, card, mode).dueDate)
  return isoDateToDate(dateInMonth(competenceMonth, parseIsoDate(purchaseDate).day))
}
