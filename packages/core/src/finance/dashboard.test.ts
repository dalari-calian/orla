import { describe, expect, it } from 'vitest'
import { addDaysIso } from '../dates/calendar.ts'
import {
  addSummaries,
  breakdownBy,
  budgetLevel,
  budgetStatuses,
  categoryBreakdown,
  effectiveExpenses,
  EMPTY_SUMMARY,
  firstNegativeMonth,
  periodMonths,
  projectionRow,
  topPayees,
  upcomingBills,
  type DashboardTransaction,
} from './dashboard.ts'
import { computeMonthSummary } from './month-summary.ts'

let sequence = 0
function tx(
  partial: Partial<DashboardTransaction> & Pick<DashboardTransaction, 'amountCents'>,
): DashboardTransaction {
  sequence += 1
  return {
    id: `t${sequence}`,
    type: 'expense',
    nature: 'variable',
    status: 'settled',
    parentPlannedId: null,
    competenceMonth: '2026-11',
    date: '2026-11-10',
    description: `item ${sequence}`,
    categoryId: null,
    accountId: null,
    payeeId: null,
    paymentMethod: 'pix',
    creditCardId: null,
    ...partial,
  }
}

const noGoal = { monthOverrideCents: null, defaultGoal: { mode: 'none' as const } }

describe('effectiveExpenses', () => {
  it('ignora receitas e conta planejamento com gastos só pelo que ainda reserva (RF-22)', () => {
    const planned = tx({ id: 'p', nature: 'planned', status: 'forecast', amountCents: 50_000 })
    const child = tx({ amountCents: 20_000, parentPlannedId: 'p' })
    const income = tx({ type: 'income', nature: 'fixed', amountCents: 600_000 })
    const items = effectiveExpenses([planned, child, income])
    expect(items.map((item) => [item.transaction.id, item.amountCents])).toEqual([
      ['p', 30_000],
      [child.id, 20_000],
    ])
  })

  it('planejamento estourado não reserva nada (some da lista) e bate com o resumo', () => {
    const planned = tx({ id: 'p2', nature: 'planned', status: 'forecast', amountCents: 10_000 })
    const child = tx({ amountCents: 15_000, parentPlannedId: 'p2' })
    const fixed = tx({ nature: 'fixed', status: 'forecast', amountCents: 150_000 })
    const all = [planned, child, fixed]
    const items = effectiveExpenses(all)
    expect(items.map((item) => item.transaction.id)).toEqual([child.id, fixed.id])
    const total = items.reduce((sum, item) => sum + item.amountCents, 0)
    expect(total).toBe(computeMonthSummary(all, noGoal).expenseForecastCents)
  })
})

describe('breakdownBy', () => {
  it('soma por chave, ordena do maior e calcula a participação', () => {
    const items = effectiveExpenses([
      tx({ paymentMethod: 'pix', amountCents: 1_000 }),
      tx({ paymentMethod: 'credit', amountCents: 6_000 }),
      tx({ paymentMethod: 'pix', amountCents: 1_000 }),
    ])
    expect(breakdownBy(items, (item) => item.paymentMethod)).toEqual([
      { key: 'credit', amountCents: 6_000, share: 0.75 },
      { key: 'pix', amountCents: 2_000, share: 0.25 },
    ])
  })

  it('lista vazia → nada', () => {
    expect(breakdownBy([], (item) => item.accountId)).toEqual([])
  })
})

describe('categoryBreakdown', () => {
  const parents: Record<string, string | null> = { food: null, ifood: 'food', home: null }
  const parentOf = (id: string) => parents[id] ?? null

  it('soma subcategorias na principal e compara com o período anterior', () => {
    const current = effectiveExpenses([
      tx({ categoryId: 'food', amountCents: 10_000 }),
      tx({ categoryId: 'ifood', amountCents: 5_000 }),
      tx({ categoryId: null, amountCents: 1_000 }),
    ])
    const previous = effectiveExpenses([
      tx({ categoryId: 'food', amountCents: 20_000 }),
      tx({ categoryId: 'home', amountCents: 7_000 }),
    ])
    const result = categoryBreakdown(current, previous, parentOf)
    expect(result.map((row) => [row.categoryId, row.amountCents, row.deltaCents])).toEqual([
      ['food', 15_000, -5_000],
      [null, 1_000, 1_000],
      ['home', 0, -7_000],
    ])
    expect(result[0]?.share).toBeCloseTo(15 / 16)
    expect(result[2]?.share).toBe(0)
  })
})

describe('orçamento por categoria (RF-61)', () => {
  it('níveis: abaixo de 80% ok, a partir de 80% alerta, a partir de 100% estourado', () => {
    expect(budgetLevel(79_99, 100_00)).toBe('ok')
    expect(budgetLevel(80_00, 100_00)).toBe('warning')
    expect(budgetLevel(99_99, 100_00)).toBe('warning')
    expect(budgetLevel(100_00, 100_00)).toBe('exceeded')
    expect(budgetLevel(0, 0)).toBe('ok')
    expect(budgetLevel(1, 0)).toBe('exceeded')
  })

  it('teto da principal cobre subcategorias; período de 3 meses multiplica o teto', () => {
    const categories = [
      { id: 'food', parentId: null, monthlyBudgetCents: 100_00 },
      { id: 'ifood', parentId: 'food', monthlyBudgetCents: null },
      { id: 'fun', parentId: null, monthlyBudgetCents: 50_00 },
      { id: 'home', parentId: null, monthlyBudgetCents: null },
    ]
    const expenses = effectiveExpenses([
      tx({ categoryId: 'food', amountCents: 60_00 }),
      tx({ categoryId: 'ifood', amountCents: 30_00 }),
      tx({ categoryId: 'fun', amountCents: 10_00 }),
      tx({ categoryId: 'home', amountCents: 999_00 }),
    ])
    expect(budgetStatuses(categories, expenses)).toEqual([
      { categoryId: 'food', budgetCents: 100_00, spentCents: 90_00, ratio: 0.9, level: 'warning' },
      { categoryId: 'fun', budgetCents: 50_00, spentCents: 10_00, ratio: 0.2, level: 'ok' },
    ])
    expect(budgetStatuses(categories, expenses, 3)[0]).toMatchObject({
      categoryId: 'food',
      budgetCents: 300_00,
      level: 'ok',
    })
  })

  it('teto zero com gasto conta como estourado', () => {
    const [status] = budgetStatuses(
      [{ id: 'x', parentId: null, monthlyBudgetCents: 0 }],
      effectiveExpenses([tx({ categoryId: 'x', amountCents: 1 })]),
    )
    expect(status).toMatchObject({ ratio: 1, level: 'exceeded' })
  })
})

describe('topPayees', () => {
  it('ordena por valor (empate: mais compras) e limita', () => {
    const items = effectiveExpenses([
      tx({ payeeId: 'a', amountCents: 1_000 }),
      tx({ payeeId: 'b', amountCents: 500 }),
      tx({ payeeId: 'b', amountCents: 500 }),
      tx({ payeeId: 'c', amountCents: 300 }),
      tx({ payeeId: null, amountCents: 9_000 }),
    ])
    expect(topPayees(items, 2)).toEqual([
      { payeeId: 'b', amountCents: 1_000, count: 2 },
      { payeeId: 'a', amountCents: 1_000, count: 1 },
    ])
  })
})

describe('períodos do dashboard', () => {
  it('mês, trimestre (com virada de ano) e ano civil, com o período anterior', () => {
    expect(periodMonths('2026-11', 'month')).toEqual({ months: ['2026-11'], previous: ['2026-10'] })
    expect(periodMonths('2026-02', 'quarter')).toEqual({
      months: ['2025-12', '2026-01', '2026-02'],
      previous: ['2025-09', '2025-10', '2025-11'],
    })
    const year = periodMonths('2026-11', 'year')
    expect(year.months).toHaveLength(12)
    expect(year.months[0]).toBe('2026-01')
    expect(year.months[11]).toBe('2026-12')
    expect(year.previous[0]).toBe('2025-01')
  })

  it('soma resumos e recalcula livre/furo pela sobra somada', () => {
    const a = computeMonthSummary(
      [tx({ type: 'income', nature: 'fixed', amountCents: 1_000 }), tx({ amountCents: 300 })],
      noGoal,
    )
    const b = computeMonthSummary([tx({ amountCents: 1_500 })], noGoal)
    const total = addSummaries(addSummaries(EMPTY_SUMMARY, a), b)
    expect(total.projectedSurplusCents).toBe(-800)
    expect(total.freeToSpendCents).toBe(0)
    expect(total.goalShortfallCents).toBe(800)
    expect(total.expenseSettledCents).toBe(1_800)
  })
})

describe('próximos vencimentos (doc 04 §8.8)', () => {
  const today = '2026-11-28'

  it('contas previstas até 7 dias (atravessando o mês) e faturas; crédito e pagos ficam de fora', () => {
    const rent = tx({
      nature: 'fixed',
      status: 'forecast',
      paymentMethod: 'boleto',
      date: '2026-12-03',
      amountCents: 150_000,
    })
    const late = tx({
      nature: 'fixed',
      status: 'forecast',
      paymentMethod: 'boleto',
      date: '2026-11-20',
      amountCents: 9_000,
    })
    const far = tx({
      nature: 'fixed',
      status: 'forecast',
      paymentMethod: 'boleto',
      date: '2026-12-06',
      amountCents: 1,
    })
    const paid = tx({ nature: 'fixed', status: 'settled', date: '2026-11-29', amountCents: 1 })
    const credit = tx({
      status: 'forecast',
      paymentMethod: 'credit',
      creditCardId: 'c',
      date: '2026-11-29',
      amountCents: 1,
    })
    const income = tx({
      type: 'income',
      nature: 'fixed',
      status: 'forecast',
      date: '2026-11-29',
      amountCents: 1,
    })
    const result = upcomingBills({
      transactions: [rent, late, far, paid, credit, income],
      statements: [
        {
          creditCardId: 'c',
          competenceMonth: '2026-12',
          dueDate: '2026-12-01',
          amountCents: 50_000,
        },
        { creditCardId: 'd', competenceMonth: '2026-12', dueDate: '2026-12-02', amountCents: 0 },
        { creditCardId: 'e', competenceMonth: '2026-11', dueDate: '2026-11-10', amountCents: 10 },
      ],
      today,
    })
    expect(result.map((item) => [item.kind, item.date, item.amountCents])).toEqual([
      ['transaction', '2026-11-20', 9_000],
      ['statement', '2026-12-01', 50_000],
      ['transaction', '2026-12-03', 150_000],
    ])
  })

  it('planejamento com gastos vence só pelo que ainda reserva', () => {
    const planned = tx({
      id: 'pl',
      nature: 'planned',
      status: 'forecast',
      paymentMethod: null,
      date: '2026-11-30',
      amountCents: 1_000,
    })
    const child = tx({
      parentPlannedId: 'pl',
      status: 'forecast',
      paymentMethod: 'pix',
      date: '2026-11-29',
      amountCents: 400,
    })
    const result = upcomingBills({ transactions: [planned, child], statements: [], today })
    expect(result.map((item) => item.amountCents)).toEqual([600])
  })

  it('addDaysIso atravessa mês e ano', () => {
    expect(addDaysIso('2026-12-28', 7)).toBe('2027-01-04')
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('projeção (RF-52)', () => {
  it('quebra saídas por natureza, bate com o resumo e acha o primeiro mês negativo', () => {
    const items = [
      tx({ type: 'income', nature: 'fixed', amountCents: 600_000 }),
      tx({ nature: 'fixed', amountCents: 150_000 }),
      tx({ nature: 'installment', amountCents: 16_666 }),
      tx({ nature: 'planned', status: 'forecast', amountCents: 20_000 }),
      tx({ nature: 'variable', amountCents: 5_000 }),
    ]
    const summary = computeMonthSummary(items, {
      monthOverrideCents: null,
      defaultGoal: { mode: 'fixed', amountCents: 120_000 },
    })
    const row = projectionRow('2026-11', items, summary)
    expect(row).toEqual({
      month: '2026-11',
      incomeCents: 600_000,
      fixedCents: 150_000,
      installmentCents: 16_666,
      plannedCents: 20_000,
      variableCents: 5_000,
      goalCents: 120_000,
      surplusCents: 288_334,
    })
    const negative = { ...row, month: '2027-02', surplusCents: -1 }
    const later = { ...row, month: '2027-05', surplusCents: -5 }
    expect(firstNegativeMonth([later, row, negative])).toBe('2027-02')
    expect(firstNegativeMonth([row])).toBeNull()
  })
})
