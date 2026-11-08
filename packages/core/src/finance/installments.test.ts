import { describe, expect, it } from 'vitest'
import {
  buildInstallmentSchedule,
  computePayoff,
  firstMonthFromCurrentInstallment,
  installmentIndicators,
  installmentTotal,
  monthlyCommitment,
  payoffTotal,
  planInstallmentEdit,
  splitInstallments,
  type ExistingInstallment,
} from './installments.ts'

describe('RF-41 — divisão das parcelas', () => {
  it('R$ 100,00 em 3× → 33,34 + 33,33 + 33,33', () => {
    expect(splitInstallments(100_00, 3)).toEqual([33_34, 33_33, 33_33])
  })

  it('parcela única fica com o total', () => {
    expect(splitInstallments(1_234_56, 1)).toEqual([1_234_56])
  })

  it('total pelo valor da parcela', () => {
    expect(installmentTotal(166_67, 12)).toBe(2_000_04)
  })

  it('rejeita entradas inválidas', () => {
    expect(() => splitInstallments(0, 3)).toThrow('maior que zero')
    expect(() => splitInstallments(2, 3)).toThrow('R$ 0,01')
    expect(() => splitInstallments(100, 0)).toThrow('entre 1 e')
    expect(() => splitInstallments(100, 1.5)).toThrow('entre 1 e')
    expect(() => installmentTotal(0, 3)).toThrow('maior que zero')
    expect(() => installmentTotal(Number.MAX_SAFE_INTEGER, 2)).toThrow('grande demais')
  })
})

describe('RF-42/43 — geração das parcelas', () => {
  it('competências consecutivas, virando o ano', () => {
    const schedule = buildInstallmentSchedule({
      totalCents: 300_00,
      count: 3,
      firstCompetenceMonth: '2026-11',
    })
    expect(schedule.map((item) => item.competenceMonth)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(schedule.every((item) => item.status === 'forecast')).toBe(true)
  })

  it('cadastro já na parcela 5/12 → 4 realizadas e 8 previstas, falta pagar correto', () => {
    const schedule = buildInstallmentSchedule({
      totalCents: 1_200_00,
      count: 12,
      firstCompetenceMonth: '2026-07',
      currentInstallment: 5,
    })
    expect(schedule.filter((item) => item.status === 'settled')).toHaveLength(4)
    expect(schedule.filter((item) => item.status === 'forecast')).toHaveLength(8)
    expect(schedule[4]).toMatchObject({ number: 5, competenceMonth: '2026-11' })

    const indicators = installmentIndicators(
      { totalCents: 1_200_00, count: 12, firstCompetenceMonth: '2026-07', status: 'active' },
      schedule,
      '2026-11',
    )
    expect(indicators).toMatchObject({
      currentNumber: 5,
      phase: 'running',
      paidCents: 400_00,
      remainingCents: 800_00,
      paidCount: 4,
      remainingCount: 8,
      lastCompetenceMonth: '2027-06',
    })
    expect(indicators.progress).toBeCloseTo(1 / 3)
  })

  it('a 1ª competência sai da parcela atual', () => {
    expect(firstMonthFromCurrentInstallment('2026-11', 5)).toBe('2026-07')
    expect(firstMonthFromCurrentInstallment('2026-11', 1)).toBe('2026-11')
    expect(() => firstMonthFromCurrentInstallment('2026-11', 0)).toThrow('inválida')
  })

  it('parcela atual fora do intervalo é rejeitada', () => {
    expect(() =>
      buildInstallmentSchedule({
        totalCents: 100_00,
        count: 3,
        firstCompetenceMonth: '2026-11',
        currentInstallment: 4,
      }),
    ).toThrow('entre 1 e 3')
  })
})

describe('RF-44 — indicadores', () => {
  const plan = {
    totalCents: 300_00,
    count: 3,
    firstCompetenceMonth: '2026-11',
    status: 'active' as const,
  }
  const schedule = buildInstallmentSchedule({ ...plan })

  it('antes de começar e depois de terminar', () => {
    expect(installmentIndicators(plan, schedule, '2026-10')).toMatchObject({
      phase: 'not_started',
      currentNumber: null,
    })
    expect(installmentIndicators(plan, schedule, '2027-02')).toMatchObject({
      phase: 'finished',
      currentNumber: null,
    })
  })

  it('quitado ou cancelado não deixa saldo', () => {
    const paidOff = installmentIndicators({ ...plan, status: 'paid_off' }, schedule, '2026-11')
    expect(paidOff).toMatchObject({ remainingCents: 0, remainingCount: 0, phase: 'finished' })
  })

  it('plano de total zero não divide por zero', () => {
    expect(installmentIndicators({ ...plan, totalCents: 0 }, [], '2026-11').progress).toBe(0)
  })
})

describe('RF-45 — totalizador e compromisso mensal', () => {
  it('Switch R$ 1.000 + Tênis R$ 300 = R$ 1.300', () => {
    expect(payoffTotal([{ remainingCents: 1_000_00 }, { remainingCents: 300_00 }])).toBe(1_300_00)
  })

  it('soma as parcelas previstas por mês e diz quando fica livre', () => {
    const items = [
      { competenceMonth: '2026-10', amountCents: 50_00, status: 'forecast' as const },
      { competenceMonth: '2026-11', amountCents: 100_00, status: 'settled' as const },
      { competenceMonth: '2026-11', amountCents: 100_00, status: 'forecast' as const },
      { competenceMonth: '2026-12', amountCents: 100_00, status: 'forecast' as const },
      { competenceMonth: '2026-12', amountCents: 25_00, status: 'forecast' as const },
    ]
    const result = monthlyCommitment(items, '2026-11', 3)
    expect(result.months).toEqual([
      { month: '2026-11', amountCents: 100_00 },
      { month: '2026-12', amountCents: 125_00 },
      { month: '2027-01', amountCents: 0 },
    ])
    expect(result.freeFromMonth).toBe('2027-01')
  })

  it('sem parcelas previstas, já está livre', () => {
    expect(monthlyCommitment([], '2026-11').freeFromMonth).toBe('2026-11')
    expect(monthlyCommitment([], '2026-11').months).toHaveLength(12)
  })
})

describe('RF-46 — quitação antecipada', () => {
  it('quitação com desconto', () => {
    expect(computePayoff(800_00, 720_00)).toEqual({ amountCents: 720_00, discountCents: 80_00 })
  })

  it('pagar mais que o saldo gera desconto negativo (juros)', () => {
    expect(computePayoff(800_00, 850_00).discountCents).toBe(-50_00)
  })

  it('erros', () => {
    expect(() => computePayoff(800_00, 0)).toThrow('valor pago')
    expect(() => computePayoff(0, 100)).toThrow('saldo')
  })
})

describe('RF-47 — editar parcelamento', () => {
  const existing = (
    statuses: ('forecast' | 'settled')[],
    amount = 100_00,
    overrides: number[] = [],
  ): ExistingInstallment[] =>
    statuses.map((status, index) => ({
      id: `p${index + 1}`,
      number: index + 1,
      amountCents: amount,
      status,
      isOverride: overrides.includes(index + 1),
    }))

  it('mudar o total redivide só as previstas', () => {
    const plan = planInstallmentEdit({
      totalCents: 400_00,
      count: 3,
      firstCompetenceMonth: '2026-11',
      existing: existing(['settled', 'forecast', 'forecast']),
    })
    expect(plan.keep).toEqual(['p1'])
    expect(plan.update).toEqual([
      { id: 'p2', number: 2, competenceMonth: '2026-12', amountCents: 150_00 },
      { id: 'p3', number: 3, competenceMonth: '2027-01', amountCents: 150_00 },
    ])
    expect(plan.create).toEqual([])
    expect(plan.remove).toEqual([])
  })

  it('aumentar o nº de parcelas cria as novas; diminuir remove as sobrando', () => {
    const more = planInstallmentEdit({
      totalCents: 400_00,
      count: 4,
      firstCompetenceMonth: '2026-11',
      existing: existing(['settled', 'forecast', 'forecast']),
    })
    expect(more.create).toEqual([{ number: 4, competenceMonth: '2027-02', amountCents: 100_00 }])

    const fewer = planInstallmentEdit({
      totalCents: 300_00,
      count: 2,
      firstCompetenceMonth: '2026-11',
      existing: existing(['settled', 'forecast', 'forecast']),
    })
    expect(fewer.update).toEqual([
      { id: 'p2', number: 2, competenceMonth: '2026-12', amountCents: 200_00 },
    ])
    expect(fewer.remove).toEqual(['p3'])
  })

  it('parcela editada à mão (override) não muda', () => {
    const plan = planInstallmentEdit({
      totalCents: 300_00,
      count: 3,
      firstCompetenceMonth: '2026-11',
      existing: existing(['forecast', 'forecast', 'forecast'], 100_00, [2]),
    })
    expect(plan.keep).toEqual(['p2'])
    expect(plan.update.map((item) => item.id)).toEqual(['p1', 'p3'])
  })

  it('erros: menos parcelas que as pagas, total menor que o pago', () => {
    const paid = existing(['settled', 'settled', 'forecast'])
    expect(() =>
      planInstallmentEdit({
        totalCents: 300_00,
        count: 1,
        firstCompetenceMonth: '2026-11',
        existing: paid,
      }),
    ).toThrow('pelo menos 2 parcelas')
    expect(() =>
      planInstallmentEdit({
        totalCents: 150_00,
        count: 3,
        firstCompetenceMonth: '2026-11',
        existing: paid,
      }),
    ).toThrow('menor que as parcelas já pagas')
    expect(() =>
      planInstallmentEdit({
        totalCents: 250_00,
        count: 2,
        firstCompetenceMonth: '2026-11',
        existing: existing(['settled', 'settled']),
      }),
    ).toThrow('soma delas')
    expect(() =>
      planInstallmentEdit({
        totalCents: 200_01,
        count: 3,
        firstCompetenceMonth: '2026-11',
        existing: paid,
      }),
    ).not.toThrow()
    expect(() =>
      planInstallmentEdit({
        totalCents: 200_00,
        count: 3,
        firstCompetenceMonth: '2026-11',
        existing: paid,
      }),
    ).toThrow('não cobre')
  })
})
