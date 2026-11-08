/**
 * Dashboard de Finanças e projeção (docs/04 §6–8, RF-51, RF-52, RF-61).
 * Funções puras sobre lançamentos já carregados; a API só junta os dados.
 */
import { addDaysIso, compareMonths } from '../dates/calendar.ts'
import { addMonths } from '../dates/competence-month.ts'
import { sumCents, type Cents } from '../money/cents.ts'
import { plannedProgress, type MonthSummary, type SummaryTransaction } from './month-summary.ts'

export interface DashboardTransaction extends SummaryTransaction {
  competenceMonth: string
  date: string
  description: string
  categoryId: string | null
  accountId: string | null
  payeeId: string | null
  paymentMethod: string | null
  creditCardId: string | null
}

export interface ExpenseShare<T extends DashboardTransaction = DashboardTransaction> {
  transaction: T
  /** Quanto o lançamento pesa nas saídas (planejamento com gastos: só o que ainda reserva). */
  amountCents: Cents
}

/**
 * Despesas com o valor que contam nas saídas previstas — a mesma regra do resumo
 * (RF-22), então a soma das quebras (categoria, forma, conta…) bate com "Saídas".
 */
export function effectiveExpenses<T extends DashboardTransaction>(
  transactions: readonly T[],
): ExpenseShare<T>[] {
  const out: ExpenseShare<T>[] = []
  for (const item of transactions) {
    if (item.type !== 'expense') continue
    const hasChildren =
      item.nature === 'planned' && transactions.some((other) => other.parentPlannedId === item.id)
    const amountCents = hasChildren
      ? plannedProgress(item, transactions).reservedCents
      : item.amountCents
    if (amountCents !== 0) out.push({ transaction: item, amountCents })
  }
  return out
}

export interface Breakdown<K> {
  key: K
  amountCents: Cents
  /** Fração do total (0–1). */
  share: number
}

/** Soma por chave, do maior para o menor, com a participação de cada um no total. */
export function breakdownBy<K>(
  items: readonly ExpenseShare[],
  keyOf: (transaction: DashboardTransaction) => K,
): Breakdown<K>[] {
  const totals = new Map<K, Cents>()
  for (const item of items) {
    const key = keyOf(item.transaction)
    totals.set(key, (totals.get(key) ?? 0) + item.amountCents)
  }
  const total = sumCents([...totals.values()])
  return [...totals.entries()]
    .map(([key, amountCents]) => ({
      key,
      amountCents,
      share: total === 0 ? 0 : amountCents / total,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)
}

export interface CategoryBreakdown {
  categoryId: string | null
  amountCents: Cents
  previousCents: Cents
  /** atual − anterior (positivo = gastou mais). */
  deltaCents: Cents
  share: number
}

/**
 * Gastos por categoria (doc 04 §8.3), somando subcategorias na categoria principal,
 * com a variação contra o período anterior. Categorias que só existiam no anterior
 * aparecem com valor 0 (o gasto sumiu — também é informação).
 */
export function categoryBreakdown(
  current: readonly ExpenseShare[],
  previous: readonly ExpenseShare[],
  parentOf: (categoryId: string) => string | null,
): CategoryBreakdown[] {
  const rootOf = (transaction: DashboardTransaction) =>
    transaction.categoryId === null
      ? null
      : (parentOf(transaction.categoryId) ?? transaction.categoryId)
  const now = new Map(breakdownBy(current, rootOf).map((item) => [item.key, item]))
  const before = new Map(breakdownBy(previous, rootOf).map((item) => [item.key, item.amountCents]))
  const keys = new Set([...now.keys(), ...before.keys()])
  return [...keys]
    .map((categoryId) => {
      const amountCents = now.get(categoryId)?.amountCents ?? 0
      const previousCents = before.get(categoryId) ?? 0
      return {
        categoryId,
        amountCents,
        previousCents,
        deltaCents: amountCents - previousCents,
        share: now.get(categoryId)?.share ?? 0,
      }
    })
    .sort((a, b) => b.amountCents - a.amountCents || b.previousCents - a.previousCents)
}

export type BudgetLevel = 'ok' | 'warning' | 'exceeded'

export interface BudgetStatus {
  categoryId: string
  budgetCents: Cents
  spentCents: Cents
  /** gasto / teto (pode passar de 1). */
  ratio: number
  level: BudgetLevel
}

/** RF-61: alerta a partir de 80% do teto; estourado a partir de 100%. */
export function budgetLevel(spentCents: Cents, budgetCents: Cents): BudgetLevel {
  if (budgetCents <= 0) return spentCents > 0 ? 'exceeded' : 'ok'
  if (spentCents >= budgetCents) return 'exceeded'
  if (spentCents * 5 >= budgetCents * 4) return 'warning'
  return 'ok'
}

/**
 * RF-61: teto mensal por categoria. O teto de uma categoria principal cobre também as
 * subcategorias. Em períodos de vários meses, o teto é multiplicado pelo nº de meses.
 * Ordena do mais perto de estourar para o mais folgado.
 */
export function budgetStatuses(
  categories: readonly { id: string; parentId: string | null; monthlyBudgetCents: Cents | null }[],
  expenses: readonly ExpenseShare[],
  months = 1,
): BudgetStatus[] {
  return categories
    .filter((category) => category.monthlyBudgetCents !== null)
    .map((category) => {
      const ids = new Set([
        category.id,
        ...categories.filter((child) => child.parentId === category.id).map((child) => child.id),
      ])
      const spentCents = sumCents(
        expenses
          .filter((item) => item.transaction.categoryId && ids.has(item.transaction.categoryId))
          .map((item) => item.amountCents),
      )
      const budgetCents = (category.monthlyBudgetCents ?? 0) * months
      return {
        categoryId: category.id,
        budgetCents,
        spentCents,
        ratio: budgetCents === 0 ? (spentCents > 0 ? 1 : 0) : spentCents / budgetCents,
        level: budgetLevel(spentCents, budgetCents),
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

export interface TopPayee {
  payeeId: string
  amountCents: Cents
  count: number
}

/** Top estabelecimentos (doc 04 §8.9): onde mais saiu dinheiro, com o nº de compras. */
export function topPayees(expenses: readonly ExpenseShare[], limit = 5): TopPayee[] {
  const totals = new Map<string, TopPayee>()
  for (const item of expenses) {
    const payeeId = item.transaction.payeeId
    if (!payeeId) continue
    const current = totals.get(payeeId) ?? { payeeId, amountCents: 0, count: 0 }
    current.amountCents += item.amountCents
    current.count += 1
    totals.set(payeeId, current)
  }
  return [...totals.values()]
    .sort((a, b) => b.amountCents - a.amountCents || b.count - a.count)
    .slice(0, limit)
}

/** Soma dois resumos (períodos de vários meses). */
export function addSummaries(a: MonthSummary, b: MonthSummary): MonthSummary {
  const projectedSurplusCents = a.projectedSurplusCents + b.projectedSurplusCents
  return {
    incomeForecastCents: a.incomeForecastCents + b.incomeForecastCents,
    incomeSettledCents: a.incomeSettledCents + b.incomeSettledCents,
    expenseForecastCents: a.expenseForecastCents + b.expenseForecastCents,
    expenseSettledCents: a.expenseSettledCents + b.expenseSettledCents,
    savingsGoalCents: a.savingsGoalCents + b.savingsGoalCents,
    goalInvestedCents: a.goalInvestedCents + b.goalInvestedCents,
    goalRemainingCents: a.goalRemainingCents + b.goalRemainingCents,
    projectedSurplusCents,
    currentBalanceCents: a.currentBalanceCents + b.currentBalanceCents,
    freeToSpendCents: Math.max(projectedSurplusCents, 0),
    goalShortfallCents: Math.max(-projectedSurplusCents, 0),
  }
}

export const EMPTY_SUMMARY: MonthSummary = {
  incomeForecastCents: 0,
  incomeSettledCents: 0,
  expenseForecastCents: 0,
  expenseSettledCents: 0,
  savingsGoalCents: 0,
  goalInvestedCents: 0,
  goalRemainingCents: 0,
  projectedSurplusCents: 0,
  currentBalanceCents: 0,
  freeToSpendCents: 0,
  goalShortfallCents: 0,
}

export type DashboardPeriod = 'month' | 'quarter' | 'year'

/**
 * Meses do período do dashboard (doc 10): o mês escolhido; ele e os 2 anteriores;
 * ou o ano civil dele inteiro. E o período anterior equivalente, para comparar.
 */
export function periodMonths(
  month: string,
  period: DashboardPeriod,
): { months: string[]; previous: string[] } {
  const range = (from: string, count: number) =>
    Array.from({ length: count }, (_, index) => addMonths(from, index))
  if (period === 'month') return { months: [month], previous: [addMonths(month, -1)] }
  if (period === 'quarter') {
    const from = addMonths(month, -2)
    return { months: range(from, 3), previous: range(addMonths(from, -3), 3) }
  }
  const from = `${month.slice(0, 4)}-01`
  return { months: range(from, 12), previous: range(addMonths(from, -12), 12) }
}

// ─── Próximos vencimentos (doc 04 §8.8) ──────────────────────────────────────

export interface UpcomingStatement {
  creditCardId: string
  competenceMonth: string
  dueDate: string
  /** Σ do que ainda está previsto na fatura. */
  amountCents: Cents
}

export type UpcomingItem<T extends DashboardTransaction = DashboardTransaction> =
  | { kind: 'transaction'; date: string; amountCents: Cents; transaction: T }
  | { kind: 'statement'; date: string; amountCents: Cents; statement: UpcomingStatement }

/**
 * Contas previstas que vencem de hoje até `days` dias à frente: despesas previstas fora
 * do crédito (fixas, boletos, planejamentos sem gastos) e faturas a pagar. Compras no
 * crédito não entram sozinhas — o que vence é a fatura. Atrasados (antes de hoje) também
 * entram, no topo, para não serem esquecidos.
 */
export function upcomingBills<T extends DashboardTransaction>(input: {
  transactions: readonly T[]
  statements: readonly UpcomingStatement[]
  today: string
  days?: number
}): UpcomingItem<T>[] {
  const until = addDaysIso(input.today, input.days ?? 7)
  const items: UpcomingItem<T>[] = []
  const effective = new Map(
    effectiveExpenses(input.transactions).map((item) => [item.transaction.id, item.amountCents]),
  )
  for (const transaction of input.transactions) {
    if (transaction.type !== 'expense' || transaction.status !== 'forecast') continue
    if (transaction.paymentMethod === 'credit' || transaction.creditCardId) continue
    if (transaction.parentPlannedId || transaction.date > until) continue
    const amountCents = effective.get(transaction.id)
    if (!amountCents) continue
    items.push({ kind: 'transaction', date: transaction.date, amountCents, transaction })
  }
  for (const statement of input.statements) {
    if (statement.amountCents <= 0 || statement.dueDate > until) continue
    if (statement.dueDate < input.today) continue
    items.push({
      kind: 'statement',
      date: statement.dueDate,
      amountCents: statement.amountCents,
      statement,
    })
  }
  return items.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : b.amountCents - a.amountCents,
  )
}

// ─── Projeção (RF-52) ────────────────────────────────────────────────────────

export interface ProjectionRow {
  month: string
  incomeCents: Cents
  fixedCents: Cents
  installmentCents: Cents
  plannedCents: Cents
  variableCents: Cents
  goalCents: Cents
  /** entradas − saídas − meta */
  surplusCents: Cents
}

/**
 * Uma linha da projeção a partir dos lançamentos do mês (reais + previstos dos modelos)
 * e da meta resolvida. Saídas quebradas por natureza; a soma bate com o resumo do mês.
 */
export function projectionRow(
  month: string,
  transactions: readonly DashboardTransaction[],
  summary: MonthSummary,
): ProjectionRow {
  const byNature = (nature: string) =>
    sumCents(
      effectiveExpenses(transactions)
        .filter((item) => item.transaction.nature === nature)
        .map((item) => item.amountCents),
    )
  return {
    month,
    incomeCents: summary.incomeForecastCents,
    fixedCents: byNature('fixed'),
    installmentCents: byNature('installment'),
    plannedCents: byNature('planned'),
    variableCents: byNature('variable') + byNature('extra'),
    // A meta reserva o maior entre o planejado e o já investido (como na sobra do mês).
    goalCents: Math.max(summary.savingsGoalCents, summary.goalInvestedCents),
    surplusCents: summary.projectedSurplusCents,
  }
}

/** Primeiro mês com sobra negativa (você vai furar a meta), ou `null`. */
export function firstNegativeMonth(rows: readonly ProjectionRow[]): string | null {
  const sorted = [...rows].sort((a, b) => compareMonths(a.month, b.month))
  return sorted.find((row) => row.surplusCents < 0)?.month ?? null
}
