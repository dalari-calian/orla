import { describe, expect, it } from 'vitest'
import {
  carryoverEntry,
  decideCarryover,
  monthName,
  signedCarryoverCents,
  type CarryoverInput,
} from './carryover.ts'
import { computeMonthSummary, type SummaryTransaction } from './month-summary.ts'
import { addSummaries, effectiveExpenses, EMPTY_SUMMARY } from './dashboard.ts'

// Vendo dezembro, já em dezembro: novembro terminou.
const base: CarryoverInput = {
  month: '2026-12',
  currentMonth: '2026-12',
  mode: 'ask',
  previousBalanceCents: 5000,
  appliedCents: null,
  dismissed: false,
}

describe('RF-55 — decidir o saldo do mês anterior', () => {
  it('ask: oferece o saldo de novembro', () => {
    expect(decideCarryover(base)).toEqual({
      state: 'offer',
      previousMonth: '2026-11',
      previousBalanceCents: 5000,
      appliedCents: null,
      previousMonthOpen: false,
    })
  })

  it('ask: oferece também saldo negativo (faltou)', () => {
    expect(decideCarryover({ ...base, previousBalanceCents: -3000 }).state).toBe('offer')
  })

  it('ask com o mês anterior em andamento: oferece e avisa que pode mudar', () => {
    const decision = decideCarryover({ ...base, currentMonth: '2026-11' })
    expect(decision.state).toBe('offer')
    expect(decision.previousMonthOpen).toBe(true)
  })

  it('mês anterior ainda no futuro: nada (é projeção, não saldo)', () => {
    expect(decideCarryover({ ...base, currentMonth: '2026-10' }).state).toBe('none')
  })

  it('saldo zero, desligado ou ignorado: nada', () => {
    expect(decideCarryover({ ...base, previousBalanceCents: 0 }).state).toBe('none')
    expect(decideCarryover({ ...base, mode: 'off' }).state).toBe('none')
    expect(decideCarryover({ ...base, dismissed: true }).state).toBe('none')
  })

  it('auto: aplica quando o mês anterior terminou; antes disso, espera', () => {
    expect(decideCarryover({ ...base, mode: 'auto' }).state).toBe('apply')
    expect(decideCarryover({ ...base, mode: 'auto', currentMonth: '2026-11' }).state).toBe('none')
    expect(decideCarryover({ ...base, mode: 'auto', dismissed: true }).state).toBe('none')
  })

  it('aplicado e igual ao saldo: applied', () => {
    expect(decideCarryover({ ...base, appliedCents: 5000 }).state).toBe('applied')
    // Desligar depois não esconde o que já foi aplicado.
    expect(decideCarryover({ ...base, appliedCents: 5000, mode: 'off' }).state).toBe('applied')
  })

  it('aplicado e o mês anterior mudou: stale (ask/off) ou sincroniza (auto)', () => {
    expect(decideCarryover({ ...base, appliedCents: 8000 }).state).toBe('stale')
    expect(decideCarryover({ ...base, appliedCents: 8000, mode: 'off' }).state).toBe('stale')
    expect(decideCarryover({ ...base, appliedCents: 8000, mode: 'auto' }).state).toBe('apply')
    // Saldo voltou a zero depois de aplicado: também é mudança.
    expect(decideCarryover({ ...base, appliedCents: 8000, previousBalanceCents: 0 }).state).toBe(
      'stale',
    )
  })

  it('auto com o mês anterior em andamento não sincroniza: avisa (stale)', () => {
    expect(
      decideCarryover({ ...base, appliedCents: 8000, mode: 'auto', currentMonth: '2026-11' }).state,
    ).toBe('stale')
  })

  it('virada de ano: janeiro olha dezembro do ano anterior', () => {
    const decision = decideCarryover({ ...base, month: '2027-01', currentMonth: '2027-01' })
    expect(decision.previousMonth).toBe('2026-12')
    expect(decision.state).toBe('offer')
  })

  it('valores que não são centavos inteiros são erro', () => {
    expect(() => decideCarryover({ ...base, previousBalanceCents: 10.5 })).toThrow()
    expect(() => decideCarryover({ ...base, appliedCents: 0.1 })).toThrow()
  })
})

describe('RF-56 — lançamento do saldo', () => {
  it('positivo vira entrada "Saldo de <mês>"', () => {
    expect(carryoverEntry(5000, '2026-11')).toEqual({
      type: 'income',
      amountCents: 5000,
      description: 'Saldo de novembro',
    })
  })

  it('negativo vira saída "Faltou em <mês>" com valor positivo', () => {
    expect(carryoverEntry(-3000, '2026-03')).toEqual({
      type: 'expense',
      amountCents: 3000,
      description: 'Faltou em março',
    })
  })

  it('zero não gera lançamento', () => {
    expect(carryoverEntry(0, '2026-11')).toBeNull()
  })

  it('sinal de volta a partir do tipo', () => {
    expect(signedCarryoverCents({ type: 'income', amountCents: 5000 })).toBe(5000)
    expect(signedCarryoverCents({ type: 'expense', amountCents: 3000 })).toBe(-3000)
  })

  it('nome dos meses', () => {
    expect(monthName('2026-01')).toBe('janeiro')
    expect(monthName('2026-12')).toBe('dezembro')
  })
})

describe('RF-54 — saldo anterior no resumo do mês', () => {
  let seq = 0
  const tx = (
    partial: Partial<SummaryTransaction> & Pick<SummaryTransaction, 'type' | 'amountCents'>,
  ): SummaryTransaction => ({
    id: `c${++seq}`,
    nature: partial.type === 'income' ? 'fixed' : 'variable',
    status: 'settled',
    parentPlannedId: null,
    ...partial,
  })
  const salary = tx({ type: 'income', amountCents: 600_000, status: 'forecast' })
  const rent = tx({ type: 'expense', amountCents: 200_000, nature: 'fixed', status: 'forecast' })
  const percentGoal = {
    monthOverrideCents: null,
    defaultGoal: { mode: 'percent' as const, percent: '20' },
  }

  it('sobra positiva entra na sobra e no saldo, mas não nas entradas nem na meta em %', () => {
    const carry = tx({ type: 'income', amountCents: 5000, nature: 'carryover' })
    const summary = computeMonthSummary([salary, rent, carry], percentGoal)
    expect(summary.incomeForecastCents).toBe(600_000)
    expect(summary.incomeSettledCents).toBe(0)
    expect(summary.savingsGoalCents).toBe(120_000) // 20% do salário, sem o saldo
    expect(summary.carryoverCents).toBe(5000)
    expect(summary.projectedSurplusCents).toBe(600_000 - 200_000 - 120_000 + 5000)
    expect(summary.currentBalanceCents).toBe(5000)
  })

  it('faltou no mês anterior: reduz a sobra e o saldo, não conta como gasto', () => {
    const carry = tx({ type: 'expense', amountCents: 3000, nature: 'carryover' })
    const transactions = [salary, rent, carry]
    const summary = computeMonthSummary(transactions, percentGoal)
    expect(summary.expenseForecastCents).toBe(200_000)
    expect(summary.expenseSettledCents).toBe(0)
    expect(summary.carryoverCents).toBe(-3000)
    expect(summary.projectedSurplusCents).toBe(600_000 - 200_000 - 120_000 - 3000)
    expect(summary.currentBalanceCents).toBe(-3000)
    // Fora das quebras do dashboard (categoria, conta…).
    const dashboardItems = transactions.map((item) => ({
      ...item,
      competenceMonth: '2026-12',
      date: '2026-12-01',
      description: '',
      categoryId: null,
      accountId: null,
      payeeId: null,
      paymentMethod: null,
      creditCardId: null,
    }))
    expect(effectiveExpenses(dashboardItems).map((share) => share.transaction.id)).toEqual([
      rent.id,
    ])
  })

  it('sem saldo anterior: zero', () => {
    expect(computeMonthSummary([salary], percentGoal).carryoverCents).toBe(0)
  })

  it('somar resumos soma o saldo anterior', () => {
    const carry = tx({ type: 'income', amountCents: 5000, nature: 'carryover' })
    const summary = computeMonthSummary([carry], percentGoal)
    expect(addSummaries(EMPTY_SUMMARY, summary).carryoverCents).toBe(5000)
  })
})
