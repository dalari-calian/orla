import {
  addMonths,
  competenceMonthToDate,
  compareMonths,
  computeMonthSummary,
  dateToCompetenceMonth,
  templateDateIn,
  templatesToMaterialize,
  type DashboardTransaction,
  type MonthSummary,
} from '@orla/core'
import { centsToNumber } from './db.ts'
import {
  financeSettings,
  nextMonthDate,
  templateRule,
  toTransaction,
  transactionInclude,
  type Db,
  type FinanceSettings,
} from './finance.ts'

export interface MonthData {
  month: string
  /** Lançamentos reais do mês + os previstos dos modelos que o mês ainda não materializou. */
  transactions: DashboardTransaction[]
  summary: MonthSummary
}

/** Todos os meses de `from` a `to` (inclusive). */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  for (let month = from; compareMonths(month, to) <= 0; month = addMonths(month, 1)) {
    months.push(month)
  }
  return months
}

/**
 * Carrega vários meses de uma vez para o dashboard e a projeção, **sem gravar nada**:
 * meses ainda não abertos ganham os lançamentos previstos dos modelos recorrentes em
 * memória (os mesmos que a materialização da RF-11 criaria ao abrir o mês).
 */
export async function loadMonths(
  db: Db,
  userId: string,
  from: string,
  to: string,
  settings?: FinanceSettings,
): Promise<Map<string, MonthData>> {
  const gte = competenceMonthToDate(from)
  const lt = nextMonthDate(to)
  const [rows, templates, monthSettings, finance] = await Promise.all([
    // Inclui excluídos: um lançamento gerado e apagado não pode "voltar" como previsto.
    db.transaction.findMany({
      where: { userId, competenceMonth: { gte, lt } },
      include: transactionInclude,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    db.recurringTemplate.findMany({ where: { userId, deletedAt: null, isActive: true } }),
    db.monthSettings.findMany({ where: { userId, competenceMonth: { gte, lt } } }),
    settings ? Promise.resolve(settings) : financeSettings(db, userId),
  ])
  const rules = templates.map(templateRule)
  const goals = new Map<string, { goal: number | null; invested: number | null }>(
    monthSettings.map((row) => [
      dateToCompetenceMonth(row.competenceMonth),
      {
        goal: centsToNumber(row.savingsGoalCents),
        invested: centsToNumber(row.goalInvestedCents),
      },
    ]),
  )

  const result = new Map<string, MonthData>()
  for (const month of monthRange(from, to)) {
    const inMonth = rows.filter((row) => dateToCompetenceMonth(row.competenceMonth) === month)
    const real: DashboardTransaction[] = inMonth
      .filter((row) => row.deletedAt === null)
      .map(toTransaction)
    const generated = new Set(inMonth.map((row) => row.recurringTemplateId ?? ''))
    const virtual: DashboardTransaction[] = templatesToMaterialize(rules, month, generated).map(
      (template) => ({
        id: `template:${template.id}:${month}`,
        type: template.type === 'income' ? 'income' : 'expense',
        nature: template.nature === 'planned' ? 'planned' : 'fixed',
        status: 'forecast',
        amountCents: centsToNumber(template.amountCents),
        parentPlannedId: null,
        competenceMonth: month,
        date: templateDateIn(template, month),
        description: template.description,
        categoryId: template.categoryId,
        accountId: template.accountId,
        payeeId: template.payeeId,
        paymentMethod: template.paymentMethod,
        creditCardId: template.creditCardId,
      }),
    )
    const transactions = [...real, ...virtual]
    result.set(month, {
      month,
      transactions,
      summary: computeMonthSummary(transactions, {
        monthOverrideCents: goals.get(month)?.goal ?? null,
        investedCents: goals.get(month)?.invested ?? null,
        defaultGoal: finance.savingsGoal,
      }),
    })
  }
  return result
}
