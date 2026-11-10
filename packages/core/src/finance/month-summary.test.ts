import { describe, expect, it } from 'vitest'
import {
  computeMonthSummary,
  defaultStatusFor,
  isNatureAllowed,
  plannedProgress,
  recurringIncomeForMonth,
  resolveSavingsGoal,
  shareOfIncome,
  type SummaryTransaction,
} from './month-summary.ts'
import type { RecurrenceRule } from './recurrence.ts'

function template(
  partial: Partial<RecurrenceRule> & { type: 'income' | 'expense'; amountCents: number },
) {
  return {
    frequency: 'monthly' as const,
    monthOfYear: null,
    dayOfMonth: 5,
    startMonth: '2026-11',
    endMonth: null,
    isActive: true,
    ...partial,
  }
}

describe('Meta no onboarding — valor ↔ % da renda', () => {
  it('soma só receitas recorrentes que ocorrem no mês', () => {
    const templates = [
      template({ type: 'income', amountCents: 600_000 }),
      template({ type: 'income', amountCents: 50_000 }),
      template({ type: 'expense', amountCents: 200_000 }),
      template({ type: 'income', amountCents: 99_999, isActive: false }),
      template({ type: 'income', amountCents: 99_999, startMonth: '2026-12' }),
      template({ type: 'income', amountCents: 99_999, endMonth: '2026-10', startMonth: '2026-01' }),
      template({ type: 'income', amountCents: 99_999, frequency: 'yearly', monthOfYear: 3 }),
    ]
    expect(recurringIncomeForMonth(templates, '2026-11')).toBe(650_000)
  })

  it('sem modelos de receita → renda zero', () => {
    expect(recurringIncomeForMonth([], '2026-11')).toBe(0)
    expect(
      recurringIncomeForMonth([template({ type: 'expense', amountCents: 1000 })], '2026-11'),
    ).toBe(0)
  })

  it('valor fixo vira fração da renda', () => {
    expect(shareOfIncome(120_000, 600_000)).toBe(0.2)
    expect(shareOfIncome(600_000, 600_000)).toBe(1)
    expect(shareOfIncome(900_000, 600_000)).toBe(1.5)
    expect(shareOfIncome(0, 600_000)).toBe(0)
  })

  it('arredonda a 0,01 ponto percentual (half-even)', () => {
    expect(shareOfIncome(100_000, 300_000)).toBe(0.3333)
    expect(shareOfIncome(1, 20_000)).toBe(0) // 0,00005 → empate, vai para o par (0)
    expect(shareOfIncome(3, 20_000)).toBe(0.0002) // 0,00015 → par acima
  })

  it('sem renda → null (não há o que comparar)', () => {
    expect(shareOfIncome(120_000, 0)).toBeNull()
    expect(shareOfIncome(120_000, -100)).toBeNull()
  })

  it('valores que não são centavos inteiros são erro', () => {
    expect(() => shareOfIncome(10.5, 600_000)).toThrow()
    expect(() => shareOfIncome(100, 0.1)).toThrow()
  })
})

let sequence = 0
function tx(
  partial: Partial<SummaryTransaction> & Pick<SummaryTransaction, 'type' | 'amountCents'>,
): SummaryTransaction {
  sequence += 1
  return {
    id: `t${sequence}`,
    nature: partial.type === 'income' ? 'fixed' : 'variable',
    status: 'forecast',
    parentPlannedId: null,
    ...partial,
  }
}

const noGoal = { monthOverrideCents: null, defaultGoal: { mode: 'none' as const } }

describe('regras de natureza e status', () => {
  it('naturezas por tipo', () => {
    expect(isNatureAllowed('income', 'extra')).toBe(true)
    // Parcela de um parcelado a receber.
    expect(isNatureAllowed('income', 'installment')).toBe(true)
    expect(isNatureAllowed('income', 'variable')).toBe(false)
    expect(isNatureAllowed('income', 'planned')).toBe(false)
    expect(isNatureAllowed('expense', 'planned')).toBe(true)
    expect(isNatureAllowed('expense', 'extra')).toBe(false)
  })

  it('RF-24: status padrão', () => {
    expect(defaultStatusFor('variable')).toBe('settled')
    expect(defaultStatusFor('extra')).toBe('settled')
    expect(defaultStatusFor('fixed')).toBe('forecast')
    expect(defaultStatusFor('installment')).toBe('forecast')
    expect(defaultStatusFor('planned')).toBe('forecast')
    expect(defaultStatusFor('variable', 'credit')).toBe('forecast')
    expect(defaultStatusFor('variable', 'pix')).toBe('settled')
  })
})

describe('RF-50 — meta de investimento', () => {
  it('valor do mês tem prioridade sobre o padrão', () => {
    expect(resolveSavingsGoal(500_00, { mode: 'fixed', amountCents: 1_200_00 }, 6_000_00)).toBe(
      500_00,
    )
    expect(resolveSavingsGoal(0, { mode: 'fixed', amountCents: 1_200_00 }, 6_000_00)).toBe(0)
  })

  it('valor fixo, percentual e sem meta', () => {
    expect(resolveSavingsGoal(null, { mode: 'fixed', amountCents: 1_200_00 }, 6_000_00)).toBe(
      1_200_00,
    )
    expect(resolveSavingsGoal(null, { mode: 'percent', percent: '20' }, 6_000_00)).toBe(1_200_00)
    expect(resolveSavingsGoal(null, { mode: 'none' }, 6_000_00)).toBe(0)
  })

  it('meta em % com receita extra no mês', () => {
    const summary = computeMonthSummary(
      [
        tx({ type: 'income', amountCents: 6_000_00 }),
        tx({ type: 'income', nature: 'extra', status: 'settled', amountCents: 300_00 }),
      ],
      { monthOverrideCents: null, defaultGoal: { mode: 'percent', percent: '20' } },
    )
    // 20% de 6.300,00
    expect(summary.savingsGoalCents).toBe(1_260_00)
  })

  it('percentual arredonda em centavos', () => {
    expect(resolveSavingsGoal(null, { mode: 'percent', percent: '12.5' }, 333_33)).toBe(41_67)
  })
})

describe('RF-51 — resumo do mês', () => {
  it('entradas, saídas, meta, sobra e saldo', () => {
    const summary = computeMonthSummary(
      [
        tx({ type: 'income', amountCents: 6_000_00, status: 'settled' }),
        tx({ type: 'income', nature: 'extra', amountCents: 300_00 }),
        tx({ type: 'expense', nature: 'fixed', amountCents: 1_500_00, status: 'settled' }),
        tx({ type: 'expense', nature: 'installment', amountCents: 250_00 }),
        tx({ type: 'expense', amountCents: 80_00, status: 'settled' }),
      ],
      { monthOverrideCents: null, defaultGoal: { mode: 'fixed', amountCents: 1_200_00 } },
    )
    expect(summary).toEqual({
      incomeForecastCents: 6_300_00,
      incomeSettledCents: 6_000_00,
      expenseForecastCents: 1_830_00,
      expenseSettledCents: 1_580_00,
      savingsGoalCents: 1_200_00,
      goalInvestedCents: 0,
      goalRemainingCents: 1_200_00,
      carryoverCents: 0,
      projectedSurplusCents: 3_270_00,
      currentBalanceCents: 4_420_00,
      freeToSpendCents: 3_270_00,
      goalShortfallCents: 0,
    })
  })

  it('sobra negativa → alerta de furar a meta', () => {
    const summary = computeMonthSummary(
      [tx({ type: 'income', amountCents: 1_000_00 }), tx({ type: 'expense', amountCents: 900_00 })],
      { monthOverrideCents: 200_00, defaultGoal: { mode: 'none' } },
    )
    expect(summary.projectedSurplusCents).toBe(-100_00)
    expect(summary.freeToSpendCents).toBe(0)
    expect(summary.goalShortfallCents).toBe(100_00)
  })

  it('mês vazio', () => {
    expect(computeMonthSummary([], noGoal).projectedSurplusCents).toBe(0)
  })
})

describe('Meta como conta do mês (investido)', () => {
  const salary = tx({ type: 'income', amountCents: 9_900_00, status: 'settled' })
  const goal = { monthOverrideCents: 1_900_00, defaultGoal: { mode: 'none' as const } }

  it('nada investido: a sobra já desconta a meta, o saldo ainda não', () => {
    const summary = computeMonthSummary([salary], goal)
    expect(summary.projectedSurplusCents).toBe(8_000_00)
    expect(summary.currentBalanceCents).toBe(9_900_00)
    expect(summary.goalInvestedCents).toBe(0)
    expect(summary.goalRemainingCents).toBe(1_900_00)
  })

  it('meta investida inteira: sai do saldo e a sobra não muda', () => {
    const summary = computeMonthSummary([salary], { ...goal, investedCents: 1_900_00 })
    expect(summary.currentBalanceCents).toBe(8_000_00)
    expect(summary.projectedSurplusCents).toBe(8_000_00)
    expect(summary.goalRemainingCents).toBe(0)
  })

  it('investiu menos: a diferença continua reservada (falta investir)', () => {
    const summary = computeMonthSummary([salary], { ...goal, investedCents: 1_000_00 })
    expect(summary.currentBalanceCents).toBe(8_900_00)
    expect(summary.projectedSurplusCents).toBe(8_000_00)
    expect(summary.goalRemainingCents).toBe(900_00)
  })

  it('investiu mais que a meta: reserva o que foi investido', () => {
    const summary = computeMonthSummary([salary], { ...goal, investedCents: 2_500_00 })
    expect(summary.currentBalanceCents).toBe(7_400_00)
    expect(summary.projectedSurplusCents).toBe(7_400_00)
    expect(summary.goalRemainingCents).toBe(0)
  })

  it('sem meta e sem investimento: nada muda', () => {
    const summary = computeMonthSummary([salary], { ...noGoal, investedCents: null })
    expect(summary.projectedSurplusCents).toBe(9_900_00)
    expect(summary.currentBalanceCents).toBe(9_900_00)
  })
})

describe('RF-22 — planejamento com gastos vinculados', () => {
  it('gastos abaixo do planejado: a previsão continua sendo o planejado', () => {
    const planned = tx({ type: 'expense', nature: 'planned', amountCents: 200_00 })
    const child = tx({
      type: 'expense',
      amountCents: 120_00,
      status: 'settled',
      parentPlannedId: planned.id,
    })
    const summary = computeMonthSummary([planned, child], noGoal)
    expect(summary.expenseForecastCents).toBe(200_00)
    expect(summary.expenseSettledCents).toBe(120_00)
    expect(plannedProgress(planned, [planned, child])).toEqual({
      plannedCents: 200_00,
      spentCents: 120_00,
      reservedCents: 80_00,
    })
  })

  it('gastos acima do planejado: vale o que foi gasto', () => {
    const planned = tx({ type: 'expense', nature: 'planned', amountCents: 200_00 })
    const a = tx({
      type: 'expense',
      amountCents: 150_00,
      status: 'settled',
      parentPlannedId: planned.id,
    })
    const b = tx({
      type: 'expense',
      amountCents: 90_00,
      status: 'settled',
      parentPlannedId: planned.id,
    })
    const summary = computeMonthSummary([planned, a, b], noGoal)
    expect(summary.expenseForecastCents).toBe(240_00)
    expect(summary.expenseSettledCents).toBe(240_00)
  })

  it('planejamento concluído libera a sobra não usada', () => {
    const planned = tx({
      type: 'expense',
      nature: 'planned',
      amountCents: 200_00,
      status: 'settled',
    })
    const child = tx({
      type: 'expense',
      amountCents: 120_00,
      status: 'settled',
      parentPlannedId: planned.id,
    })
    const summary = computeMonthSummary([planned, child], noGoal)
    expect(summary.expenseForecastCents).toBe(120_00)
    expect(summary.expenseSettledCents).toBe(120_00)
  })

  it('planejamento sem gastos vinculados é um lançamento comum (realizar)', () => {
    const forecast = tx({ type: 'expense', nature: 'planned', amountCents: 200_00 })
    expect(computeMonthSummary([forecast], noGoal).expenseForecastCents).toBe(200_00)
    const realized = tx({
      type: 'expense',
      nature: 'planned',
      amountCents: 180_00,
      status: 'settled',
    })
    expect(computeMonthSummary([realized], noGoal).expenseSettledCents).toBe(180_00)
  })
})
