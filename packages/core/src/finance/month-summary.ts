/**
 * Resumo do mês e meta de investimento (docs/04 §6, RF-17, RF-22, RF-50, RF-51).
 */
import { percentOfCents, sumCents, type Cents } from '../money/cents.ts'

export type TransactionType = 'income' | 'expense'
export type TransactionNature = 'fixed' | 'variable' | 'planned' | 'installment' | 'extra'
export type TransactionStatus = 'forecast' | 'settled'

/** Naturezas válidas para cada tipo (receita: fixa ou extra; despesa: as outras). */
export const NATURES_BY_TYPE: Record<TransactionType, readonly TransactionNature[]> = {
  income: ['fixed', 'extra'],
  expense: ['fixed', 'variable', 'planned', 'installment'],
}

export function isNatureAllowed(type: TransactionType, nature: TransactionNature): boolean {
  return NATURES_BY_TYPE[type].includes(nature)
}

/**
 * RF-24: gastos do dia e receitas extras nascem realizados; fixas, parcelas e planejamentos,
 * previstos. No crédito o dinheiro só sai quando a fatura é paga (RF-31), então a compra
 * nasce prevista e vira realizada ao marcar a fatura como paga.
 */
export function defaultStatusFor(
  nature: TransactionNature,
  paymentMethod?: string | null,
): TransactionStatus {
  if (paymentMethod === 'credit') return 'forecast'
  return nature === 'variable' || nature === 'extra' ? 'settled' : 'forecast'
}

export type SavingsGoalSetting =
  { mode: 'none' } | { mode: 'fixed'; amountCents: Cents } | { mode: 'percent'; percent: string }

/**
 * RF-50: meta do mês = valor do mês (`month_settings`) se houver; senão a meta padrão,
 * em valor fixo ou % das entradas previstas do mês.
 */
export function resolveSavingsGoal(
  monthOverrideCents: Cents | null,
  defaultGoal: SavingsGoalSetting,
  incomeForecastCents: Cents,
): Cents {
  if (monthOverrideCents !== null) return monthOverrideCents
  if (defaultGoal.mode === 'fixed') return defaultGoal.amountCents
  if (defaultGoal.mode === 'percent')
    return percentOfCents(incomeForecastCents, defaultGoal.percent)
  return 0
}

export interface SummaryTransaction {
  id: string
  type: TransactionType
  nature: TransactionNature
  status: TransactionStatus
  amountCents: Cents
  /** Gasto vinculado a um planejamento (RF-22). */
  parentPlannedId: string | null
}

export interface PlannedProgress {
  plannedCents: Cents
  /** Σ gastos vinculados (todos os status). */
  spentCents: Cents
  /** Quanto do planejamento ainda conta como previsto (0 depois de concluído). */
  reservedCents: Cents
}

/**
 * RF-22: um planejamento com gastos vinculados conta, na previsão do mês,
 * `max(planejado, Σ gastos)`. Os gastos já entram por conta própria, então o
 * planejamento contribui só com a sobra reservada `max(planejado − Σ gastos, 0)`
 * enquanto está previsto; ao concluí-lo (realizado), passa a valer só o que foi gasto.
 * Sem gastos vinculados, ele é um lançamento comum com o próprio valor.
 */
export function plannedProgress(
  planned: Pick<SummaryTransaction, 'id' | 'status' | 'amountCents'>,
  transactions: readonly SummaryTransaction[],
): PlannedProgress {
  const children = transactions.filter((item) => item.parentPlannedId === planned.id)
  const spentCents = sumCents(children.map((item) => item.amountCents))
  let reservedCents = planned.amountCents
  if (children.length > 0) {
    reservedCents =
      planned.status === 'forecast' ? Math.max(planned.amountCents - spentCents, 0) : 0
  }
  return { plannedCents: planned.amountCents, spentCents, reservedCents }
}

export interface MonthSummary {
  incomeForecastCents: Cents
  incomeSettledCents: Cents
  expenseForecastCents: Cents
  expenseSettledCents: Cents
  savingsGoalCents: Cents
  /** entradas previstas − saídas previstas − meta */
  projectedSurplusCents: Cents
  /** entradas recebidas − saídas pagas */
  currentBalanceCents: Cents
  /** Quanto ainda dá para gastar sem furar a meta (sobra prevista, se positiva). */
  freeToSpendCents: Cents
  /** Sobra prevista negativa → "você vai furar a meta em R$ X". */
  goalShortfallCents: Cents
}

/** RF-51: fórmulas do mês. */
export function computeMonthSummary(
  transactions: readonly SummaryTransaction[],
  goal: { monthOverrideCents: Cents | null; defaultGoal: SavingsGoalSetting },
): MonthSummary {
  const income = transactions.filter((item) => item.type === 'income')
  const expenses = transactions.filter((item) => item.type === 'expense')

  const incomeForecastCents = sumCents(income.map((item) => item.amountCents))
  const incomeSettledCents = sumCents(
    income.filter((item) => item.status === 'settled').map((item) => item.amountCents),
  )

  let expenseForecastCents = 0
  let expenseSettledCents = 0
  for (const item of expenses) {
    const hasChildren =
      item.nature === 'planned' && transactions.some((other) => other.parentPlannedId === item.id)
    if (hasChildren) {
      // Os gastos vinculados já somam por si; o planejamento soma só o que ainda reserva.
      expenseForecastCents += plannedProgress(item, transactions).reservedCents
      continue
    }
    expenseForecastCents += item.amountCents
    if (item.status === 'settled') expenseSettledCents += item.amountCents
  }

  const savingsGoalCents = resolveSavingsGoal(
    goal.monthOverrideCents,
    goal.defaultGoal,
    incomeForecastCents,
  )
  const projectedSurplusCents = incomeForecastCents - expenseForecastCents - savingsGoalCents
  return {
    incomeForecastCents,
    incomeSettledCents,
    expenseForecastCents,
    expenseSettledCents,
    savingsGoalCents,
    projectedSurplusCents,
    currentBalanceCents: incomeSettledCents - expenseSettledCents,
    freeToSpendCents: Math.max(projectedSurplusCents, 0),
    goalShortfallCents: Math.max(-projectedSurplusCents, 0),
  }
}
