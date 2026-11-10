/**
 * Resumo do mês e meta de investimento (docs/04 §6, RF-17, RF-22, RF-50, RF-51).
 */
import { assertCents, percentOfCents, sumCents, type Cents } from '../money/cents.ts'
import { Decimal } from '../money/decimal.ts'
import { templateOccursIn, type RecurrenceRule } from './recurrence.ts'

export type TransactionType = 'income' | 'expense'
export type TransactionNature =
  | 'fixed'
  | 'variable'
  | 'planned'
  | 'installment'
  | 'extra'
  /** Saldo do mês anterior (RF-54): só a API cria; nunca é lançado à mão. */
  | 'carryover'
export type TransactionStatus = 'forecast' | 'settled'

/**
 * Naturezas válidas para cada tipo (receita: fixa, extra ou parcela de um parcelado a
 * receber; despesa: as outras). Parcela nunca é lançada à mão — nasce do parcelamento.
 */
export const NATURES_BY_TYPE: Record<TransactionType, readonly TransactionNature[]> = {
  income: ['fixed', 'extra', 'installment'],
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

/**
 * Renda prevista do mês pelos modelos recorrentes de receita (salário base etc.).
 * Usada para mostrar a meta nas duas formas antes de existir lançamento no mês.
 */
export function recurringIncomeForMonth(
  templates: readonly (RecurrenceRule & { type: TransactionType; amountCents: Cents })[],
  month: string,
): Cents {
  return sumCents(
    templates
      .filter((template) => template.type === 'income' && templateOccursIn(template, month))
      .map((template) => template.amountCents),
  )
}

/**
 * Fração da renda que um valor representa (0.2 = 20%), arredondada a 4 casas
 * (0,01 ponto percentual). `null` sem renda — não há o que comparar.
 */
export function shareOfIncome(amountCents: Cents, incomeCents: Cents): number | null {
  assertCents(amountCents)
  assertCents(incomeCents)
  if (incomeCents <= 0) return null
  return new Decimal(amountCents)
    .dividedBy(incomeCents)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
    .toNumber()
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
  /** Quanto da meta já foi investido no mês (0 = nada ainda). */
  goalInvestedCents: Cents
  /** Quanto falta investir para cumprir a meta (0 = cumprida). */
  goalRemainingCents: Cents
  /** entradas previstas − saídas previstas − max(meta, investido) + saldo anterior */
  projectedSurplusCents: Cents
  /**
   * Saldo trazido do mês anterior, com sinal (RF-54). Fica fora de entradas/saídas e da
   * base da meta em %; soma na sobra e no saldo.
   */
  carryoverCents: Cents
  /** entradas recebidas − saídas pagas − investido + saldo anterior (a meta é uma conta do mês) */
  currentBalanceCents: Cents
  /** Quanto ainda dá para gastar sem furar a meta (sobra prevista, se positiva). */
  freeToSpendCents: Cents
  /** Sobra prevista negativa → "você vai furar a meta em R$ X". */
  goalShortfallCents: Cents
}

/**
 * RF-51: fórmulas do mês. A meta de investimento é tratada como uma conta a pagar: reserva o
 * valor inteiro na sobra prevista desde o começo do mês, e o que já foi investido sai do saldo.
 * Investir menos que a meta não libera a diferença (continua "faltando investir"); investir
 * mais reserva o que foi investido.
 */
export function computeMonthSummary(
  transactions: readonly SummaryTransaction[],
  goal: {
    monthOverrideCents: Cents | null
    defaultGoal: SavingsGoalSetting
    /** Quanto já foi investido no mês (null = nada registrado). */
    investedCents?: Cents | null
  },
): MonthSummary {
  const carryoverCents = sumCents(
    transactions
      .filter((item) => item.nature === 'carryover')
      .map((item) => (item.type === 'income' ? item.amountCents : -item.amountCents)),
  )
  const regular = transactions.filter((item) => item.nature !== 'carryover')
  const income = regular.filter((item) => item.type === 'income')
  const expenses = regular.filter((item) => item.type === 'expense')

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
  const goalInvestedCents = goal.investedCents ?? 0
  const reservedForGoal = Math.max(savingsGoalCents, goalInvestedCents)
  const projectedSurplusCents =
    incomeForecastCents - expenseForecastCents - reservedForGoal + carryoverCents
  return {
    incomeForecastCents,
    incomeSettledCents,
    expenseForecastCents,
    expenseSettledCents,
    savingsGoalCents,
    goalInvestedCents,
    goalRemainingCents: Math.max(savingsGoalCents - goalInvestedCents, 0),
    carryoverCents,
    projectedSurplusCents,
    currentBalanceCents:
      incomeSettledCents - expenseSettledCents - goalInvestedCents + carryoverCents,
    freeToSpendCents: Math.max(projectedSurplusCents, 0),
    goalShortfallCents: Math.max(-projectedSurplusCents, 0),
  }
}
