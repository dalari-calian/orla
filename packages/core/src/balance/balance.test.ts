import { describe, expect, it } from 'vitest'
import {
  balanceItemValue,
  balanceSeries,
  chainRates,
  flowsInPeriod,
  observedPrices,
  periodReturn,
  yearSummary,
  type BalancePoint,
} from './index.ts'

const base = {
  startValueCents: 1_000_000,
  endValueCents: 1_135_000,
  flows: [{ date: '2026-11-10', amountCents: 120_000 }],
  startDate: '2026-10-10',
  endDate: '2026-11-10',
}

describe('doc 07 — rentabilidade do período', () => {
  it('V₀ 10.000, C 1.200, V₁ 11.350 → ganho 150; 1,5% (end) e 1,339% (start)', () => {
    const end = periodReturn({ ...base, timing: 'end' })
    expect(end).toMatchObject({ contributionsCents: 120_000, gainCents: 15_000 })
    expect(end.rate).toBeCloseTo(0.015, 10)
    expect(periodReturn({ ...base, timing: 'start' }).rate).toBeCloseTo(15_000 / 1_120_000, 10)
    expect((periodReturn({ ...base, timing: 'start' }).rate ?? 0) * 100).toBeCloseTo(1.339, 3)
  })

  it('Dietz: aporte no meio do período pesa metade; no fim, nada', () => {
    const middle = periodReturn({
      ...base,
      flows: [{ date: '2026-10-25', amountCents: 120_000 }],
      endDate: '2026-11-09',
      timing: 'dietz',
    })
    expect(middle.rate).toBeCloseTo(15_000 / (1_000_000 + 60_000), 6)
    expect(periodReturn({ ...base, timing: 'dietz' }).rate).toBeCloseTo(0.015, 10)
  })

  it('primeiro balanço sem anterior: só total, rentabilidade "—"', () => {
    expect(
      periodReturn({ ...base, startValueCents: null, startDate: null, timing: 'end' }),
    ).toEqual({ contributionsCents: 120_000, gainCents: null, rate: null })
    expect(periodReturn({ ...base, startValueCents: 0, timing: 'end' }).rate).toBeNull()
  })

  it('resgate (aporte negativo) aumenta o ganho real', () => {
    const out = periodReturn({
      ...base,
      endValueCents: 950_000,
      flows: [{ date: '2026-11-01', amountCents: -60_000 }],
      timing: 'end',
    })
    expect(out.gainCents).toBe(10_000)
    expect(out.rate).toBeCloseTo(0.01, 10)
  })

  it('período (anterior, este]: fluxo no dia do balanço anterior não entra', () => {
    const flows = [
      { date: '2026-10-10', amountCents: 1 },
      { date: '2026-10-11', amountCents: 2 },
      { date: '2026-11-10', amountCents: 4 },
      { date: '2026-11-11', amountCents: 8 },
    ]
    expect(flowsInPeriod(flows, '2026-10-10', '2026-11-10').map((f) => f.amountCents)).toEqual([
      2, 4,
    ])
    expect(flowsInPeriod(flows, null, '2026-10-11')).toHaveLength(2)
  })
})

describe('doc 07 — série e acumulados', () => {
  const point = (
    month: string,
    total: number,
    extra: Partial<BalancePoint> = {},
  ): BalancePoint => ({
    id: month,
    competenceMonth: month,
    referenceDate: `${month}-10`,
    totalCents: total,
    dividendsCents: 0,
    ...extra,
  })
  const flows = [
    { date: '2026-02-10', amountCents: 100_000 },
    { date: '2026-03-10', amountCents: 100_000 },
    { date: '2026-04-10', amountCents: 100_000 },
  ]

  it('TWR de 3 meses com um mês negativo; aportado acumulado', () => {
    // Jan 10.000 → Fev 11.100 (+1%) → Mar 11.900 (−1,8%) → Abr 13.138 (+2%).
    const rows = balanceSeries(
      [
        point('2026-01', 1_000_000),
        point('2026-02', 1_110_000),
        point('2026-03', 1_190_000),
        point('2026-04', 1_313_800),
      ],
      flows,
      'end',
    )
    expect(rows.map((row) => row.gainCents)).toEqual([null, 10_000, -20_000, 23_800])
    expect(rows[1]?.rate).toBeCloseTo(0.01)
    expect(rows[2]?.rate).toBeCloseTo(-20_000 / 1_110_000)
    expect(rows[3]?.rate).toBeCloseTo(0.02)
    const twr = 1.01 * (1 - 20_000 / 1_110_000) * 1.02 - 1
    expect(rows[3]?.cumulative).toBeCloseTo(twr, 10)
    expect(rows[3]?.yearCumulative).toBeCloseTo(twr, 10)
    expect(rows.map((row) => row.investedCents)).toEqual([
      1_000_000, 1_100_000, 1_200_000, 1_300_000,
    ])
    expect(chainRates([null])).toBeNull()

    const summary = yearSummary(rows, '2026', 50_000)
    expect(summary).toMatchObject({
      months: 3,
      gainCents: 13_800,
      contributionsCents: 300_000,
      capitalBaseCents: 1_300_000,
      lastTotalCents: 1_313_800,
    })
    expect(summary.gainOnCapital).toBeCloseTo(13_800 / 1_300_000)
    expect(summary.averageMonthlyRate).toBeCloseTo(Math.pow(1 + twr, 1 / 3) - 1, 10)
    // 8 meses restantes depois de abril.
    const expected =
      Math.round(1_313_800 * Math.pow(1 + (summary.averageMonthlyRate ?? 0), 8)) + 8 * 50_000
    expect(Math.abs((summary.projectionCents ?? 0) - expected)).toBeLessThanOrEqual(1)
    expect(yearSummary(rows, '2025')).toMatchObject({ months: 0, twr: null, projectionCents: null })
  })

  it('balanço reaberto e editado recalcula o mês seguinte', () => {
    const before = balanceSeries(
      [point('2026-01', 1_000_000), point('2026-02', 1_110_000), point('2026-03', 1_190_000)],
      flows,
      'end',
    )
    const after = balanceSeries(
      [point('2026-01', 1_000_000), point('2026-02', 1_150_000), point('2026-03', 1_190_000)],
      flows,
      'end',
    )
    expect(after[2]?.gainCents).not.toBe(before[2]?.gainCents)
    expect(after[2]?.gainCents).toBe(1_190_000 - 1_150_000 - 100_000)
  })

  it('aporte congelado no fechamento vale e avisa quando a origem mudou (RB-12)', () => {
    const rows = balanceSeries(
      [
        point('2026-01', 1_000_000),
        point('2026-02', 1_110_000, { frozenContributionsCents: 90_000 }),
      ],
      flows,
      'end',
    )
    expect(rows[1]).toMatchObject({
      contributionsCents: 90_000,
      gainCents: 20_000,
      contributionsChanged: true,
    })
    // Ano anterior como capital base e ano sem balanço anterior.
    const series = balanceSeries(
      [point('2025-12', 900_000), point('2026-01', 1_000_000)],
      [{ date: '2026-01-05', amountCents: 50_000 }],
      'end',
    )
    expect(yearSummary(series, '2026')).toMatchObject({
      capitalBaseCents: 950_000,
      gainCents: 50_000,
    })
  })
})

describe('RB-30 — preços observados', () => {
  it('máximo, mínimo, último DY/P-VP e distância do preço atual', () => {
    const list = observedPrices(
      [
        { key: 'MXRF11', date: '2026-02-10', price: '9.73', dy: '12.5' },
        { key: 'MXRF11', date: '2026-03-10', price: '9.82', pvp: '1.01' },
        { key: 'MXRF11', date: '2026-08-10', price: '9.25' },
        { key: 'MXRF11', date: '2026-10-10', price: '9.42' },
        { key: 'ZERO', date: '2026-10-10', price: '0' },
      ],
      new Map([['MXRF11', '9.50']]),
    )
    expect(list).toHaveLength(1)
    const mxrf = list[0]
    expect(mxrf).toMatchObject({
      key: 'MXRF11',
      count: 4,
      max: { price: '9.82', date: '2026-03-10' },
      min: { price: '9.25', date: '2026-08-10' },
      last: { price: '9.42', date: '2026-10-10', dy: null, pvp: null },
      lastDy: '12.5',
      lastPvp: '1.01',
    })
    expect(mxrf?.aboveMin).toBeCloseTo(9.5 / 9.25 - 1)
    expect(mxrf?.belowMax).toBeCloseTo(9.5 / 9.82 - 1)
    expect(observedPrices([{ key: 'A', date: '2026-01-01', price: '1' }])[0]?.aboveMin).toBeNull()
    expect(balanceItemValue('54', '9.42')).toBe(50_868)
  })
})
