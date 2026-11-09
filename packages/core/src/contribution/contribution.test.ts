import { describe, expect, it } from 'vitest'
import {
  apportion,
  classTone,
  pctOf,
  resolveItem,
  simulate,
  splitTotal,
  suggestClassItems,
  suggestPlan,
  suggestSplit,
  type SimAsset,
  type SimClass,
  type SimItem,
  type SuggestAsset,
} from './index.ts'
import { Decimal } from '../money/decimal.ts'

const classes: SimClass[] = [
  { id: 'fii', name: 'FIIs', targetPct: 40 },
  { id: 'acao', name: 'Ações', targetPct: 35 },
  { id: 'rf', name: 'Renda Fixa', targetPct: 25 },
]

const asset = (
  key: string,
  classId: string,
  currentCents: number,
  extra: Partial<SimAsset> = {},
): SimAsset => ({
  key,
  classId,
  label: key,
  currentCents,
  maxWeightPct: null,
  targetWeightPct: null,
  ...extra,
})

const byValue = (key: string, assetKey: string, valueCents: number, price: string): SimItem => ({
  key,
  assetKey,
  mode: 'by_value',
  quantity: 0,
  unitPrice: price,
  valueCents,
  fractional: false,
})

describe('doc 06 — itens', () => {
  it('por valor com preço não divisível: cotas inteiras e troco (RA-10)', () => {
    expect(
      resolveItem({
        mode: 'by_value',
        quantity: 0,
        unitPrice: '9.73',
        valueCents: 10000,
        fractional: false,
      }),
    ).toMatchObject({ spentCents: 9730, changeCents: 270 })
    expect(
      resolveItem({
        mode: 'by_value',
        quantity: 0,
        unitPrice: '9.73',
        valueCents: 10000,
        fractional: false,
      }).quantity.toString(),
    ).toBe('10')
    // Por quantidade: qtd × preço (fração de ação é cortada).
    expect(
      resolveItem({
        mode: 'by_quantity',
        quantity: '3.7',
        unitPrice: '25.5',
        valueCents: 0,
        fractional: false,
      }),
    ).toMatchObject({ spentCents: 7650, changeCents: 0 })
    // Renda fixa: valor exato.
    expect(
      resolveItem({
        mode: 'by_value',
        quantity: 0,
        unitPrice: 0,
        valueCents: 12345,
        fractional: true,
      }),
    ).toMatchObject({ spentCents: 12345, changeCents: 0 })
    // Sem preço: nada é gasto, tudo vira troco; entradas inválidas viram 0.
    expect(
      resolveItem({
        mode: 'by_value',
        quantity: 0,
        unitPrice: '',
        valueCents: 500,
        fractional: false,
      }),
    ).toMatchObject({ spentCents: 0, changeCents: 500 })
    expect(
      resolveItem({
        mode: 'by_quantity',
        quantity: 'abc',
        unitPrice: '-3',
        valueCents: 0,
        fractional: false,
      }),
    ).toMatchObject({ spentCents: 0 })
  })
})

describe('doc 06 — simulação', () => {
  it('exemplo da planilha: 1.200 em 500/400/300; VALE3 R$ 100 → faltam 1.100, Ações 300', () => {
    const total = 120000
    const result = simulate({
      totalCents: total,
      split: { fii: pctOf(50000, total), acao: pctOf(40000, total), rf: pctOf(30000, total) },
      classes,
      assets: [asset('VALE3', 'acao', 0), asset('MXRF11', 'fii', 0), asset('CDB', 'rf', 0)],
      items: [
        {
          key: 'i1',
          assetKey: 'VALE3',
          mode: 'by_quantity',
          quantity: '2',
          unitPrice: '50',
          valueCents: 0,
          fractional: false,
        },
      ],
    })
    expect(result.split.valid).toBe(true)
    expect(result.remainingCents).toBe(110000)
    const acoes = result.classes.find((item) => item.id === 'acao')
    expect(acoes).toMatchObject({
      allottedCents: 40000,
      spentCents: 10000,
      remainingCents: 30000,
      tone: 'ok',
    })
    expect(result.classes.map((item) => item.allottedCents)).toEqual([50000, 40000, 30000])
  })

  it('estouro de classe (−60) e cores; pesos antes → depois; alertas de concentração', () => {
    const result = simulate({
      totalCents: 120000,
      split: { fii: '40', acao: '35', rf: '25' },
      classes,
      assets: [
        asset('MXRF11', 'fii', 100000, { maxWeightPct: 20 }),
        asset('HGLG11', 'fii', 100000, { targetWeightPct: 50 }),
        asset('ITSA4', 'acao', 200000),
        asset('CDB', 'rf', 600000),
      ],
      items: [byValue('a', 'MXRF11', 54000, '10'), byValue('b', 'ITSA4', 10000, '10')],
    })
    const fii = result.classes.find((item) => item.id === 'fii')
    expect(fii).toMatchObject({ allottedCents: 48000, spentCents: 54000, remainingCents: -6000 })
    expect(fii?.tone).toBe('over')
    expect(classTone(48000, -2000)).toBe('warn')
    expect(classTone(48000, 0)).toBe('ok')
    expect(result.patrimonyBeforeCents).toBe(1000000)
    expect(result.patrimonyAfterCents).toBe(1064000)
    expect(fii?.weightBefore).toBeCloseTo(0.2)
    expect(fii?.weightAfter).toBeCloseTo(254000 / 1064000)
    expect(fii?.deviationAfterPp).toBeCloseTo((254000 / 1064000 - 0.4) * 100)
    const mxrf = result.assets.find((item) => item.key === 'MXRF11')
    expect(mxrf?.weightBefore).toBeCloseTo(0.1)
    // 154.000/1.064.000 = 14,5% < 20%: sem alerta de teto; dentro da classe 60,6% (sem meta).
    expect(mxrf?.alerts).toEqual([])
    expect(result.remainingCents).toBe(120000 - 64000)
  })

  it('alertas: teto na carteira e peso na classe acima da meta + 5 p.p.', () => {
    const result = simulate({
      totalCents: 100000,
      split: { fii: 100 },
      classes,
      assets: [
        asset('A', 'fii', 50000, { maxWeightPct: 30, targetWeightPct: 50 }),
        asset('B', 'fii', 50000),
      ],
      items: [byValue('x', 'A', 100000, '1')],
    })
    expect(result.assets[0]?.alerts).toEqual([
      'A ficaria muito predominante: 75% > teto 30%',
      'A passaria do peso na classe: 75% > meta 50%',
    ])
    expect(result.assets[1]?.alerts).toEqual([])
  })

  it('soma das divisões ≠ 100% é inválida', () => {
    expect(splitTotal({ a: '40', b: '35' })).toEqual({ totalPct: 75, valid: false })
    expect(splitTotal({ a: '33.33333333', b: '33.33333333', c: '33.33333334' }).valid).toBe(true)
    const result = simulate({
      totalCents: 1000,
      split: { fii: '50' },
      classes,
      assets: [],
      items: [],
    })
    expect(result.split.valid).toBe(false)
    expect(result.classes[0]?.allottedCents).toBe(500)
    expect(pctOf(100, 0)).toBe('0')
  })
})

describe('doc 06 — rebalanceamento (RA-20)', () => {
  it('classe acima da meta recebe 0; déficits repartidos; % soma 100', () => {
    // Patrimônio 10.000: FIIs 5.000 (meta 40% → acima), Ações 2.000, RF 3.000. Aporte 1.000.
    // Alvo com 11.000: FIIs 4.400 (0), Ações 3.850 (déficit 1.850), RF 2.750 (0).
    const { amounts, split } = suggestSplit(100000, classes, [
      asset('F', 'fii', 500000),
      asset('A', 'acao', 200000),
      asset('R', 'rf', 300000),
    ])
    expect(amounts).toEqual({ fii: 0, acao: 100000, rf: 0 })
    expect(split).toEqual({ fii: '0', acao: '100', rf: '0' })
  })

  it('déficits menores que o aporte: excedente vai pela meta', () => {
    const { amounts, split } = suggestSplit(100000, classes, [
      asset('F', 'fii', 0),
      asset('A', 'acao', 0),
      asset('R', 'rf', 0),
    ])
    expect(amounts).toEqual({ fii: 40000, acao: 35000, rf: 25000 })
    expect(split).toEqual({ fii: '40', acao: '35', rf: '25' })
    // Com sobra depois dos déficits.
    const partial = suggestSplit(100000, classes, [
      asset('F', 'fii', 0),
      asset('A', 'acao', 35000),
      asset('R', 'rf', 25000),
    ])
    expect(Object.values(partial.amounts).reduce((a, b) => a + b, 0)).toBe(100000)
    expect(partial.amounts.fii).toBeGreaterThan(partial.amounts.acao ?? 0)
    // Sem metas: reparte igual; aporte zero: tudo zero.
    const noTargets = suggestSplit(
      90000,
      classes.map((item) => ({ ...item, targetPct: null })),
      [],
    )
    expect(noTargets.amounts).toEqual({ fii: 30000, acao: 30000, rf: 30000 })
    expect(suggestSplit(0, classes, []).split).toEqual({ fii: '0', acao: '0', rf: '0' })
  })

  it('dentro da classe: cotas inteiras, troco realocado ao maior déficit, renda fixa exata', () => {
    const fiis: SuggestAsset[] = [
      { ...asset('MXRF11', 'fii', 0), unitPrice: '9.73', fractional: false },
      { ...asset('HGLG11', 'fii', 0), unitPrice: '160', fractional: false },
      { ...asset('SEM', 'fii', 0), unitPrice: null, fractional: false },
    ]
    const items = suggestClassItems(50000, fiis)
    const spent = items.reduce((sum, item) => sum + item.valueCents, 0)
    expect(spent).toBeLessThanOrEqual(50000)
    expect(50000 - spent).toBeLessThan(973)
    expect(items.every((item) => Number.isInteger(Number(item.quantity)))).toBe(true)
    expect(items.map((item) => item.assetKey)).not.toContain('SEM')

    const withFixed = suggestClassItems(10050, [
      { ...asset('CDB', 'rf', 0), unitPrice: null, fractional: true },
    ])
    expect(withFixed).toEqual([
      { assetKey: 'CDB', mode: 'by_value', quantity: '1', unitPrice: '0', valueCents: 10050 },
    ])
    // Pesos alvo na classe: o ativo mais longe do alvo leva mais.
    const weighted = suggestClassItems(10000, [
      { ...asset('A', 'acao', 0, { targetWeightPct: 75 }), unitPrice: '1', fractional: false },
      { ...asset('B', 'acao', 0, { targetWeightPct: 25 }), unitPrice: '1', fractional: false },
    ])
    expect(weighted.map((item) => item.valueCents)).toEqual([7500, 2500])
    expect(suggestClassItems(0, fiis)).toEqual([])
  })

  it('plano completo e repartição pelo maior resto', () => {
    const plan = suggestPlan(100000, classes, [
      { ...asset('MXRF11', 'fii', 0), unitPrice: '10', fractional: false },
      { ...asset('ITSA4', 'acao', 0), unitPrice: '10', fractional: false },
      { ...asset('CDB', 'rf', 0), unitPrice: null, fractional: true },
    ])
    expect(plan.split).toEqual({ fii: '40', acao: '35', rf: '25' })
    expect(plan.items).toEqual([
      {
        assetKey: 'MXRF11',
        mode: 'by_quantity',
        quantity: '40',
        unitPrice: '10',
        valueCents: 40000,
      },
      {
        assetKey: 'ITSA4',
        mode: 'by_quantity',
        quantity: '35',
        unitPrice: '10',
        valueCents: 35000,
      },
      { assetKey: 'CDB', mode: 'by_value', quantity: '1', unitPrice: '0', valueCents: 25000 },
    ])
    expect(apportion(10, [new Decimal(1), new Decimal(1), new Decimal(1)])).toEqual([4, 3, 3])
    expect(apportion(10, [new Decimal(0)])).toEqual([0])
  })
})
