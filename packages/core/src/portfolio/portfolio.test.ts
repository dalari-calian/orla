import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSET_CLASSES, isManualQuoteKind, isTicker, normalizeTicker } from './catalog.ts'
import {
  allocation,
  dividendsByMonth,
  dividendsLast12Months,
  lastMonths,
  targetsTotal,
  valuate,
  weights,
  yieldOnCost,
} from './metrics.ts'
import {
  computePosition,
  PortfolioError,
  type TradeInput,
  tradeTotalCents,
  valueCents,
} from './position.ts'
import { isMarketOpen, lastMarketClose, quoteIsFresh, usageMonth } from './quotes.ts'

const buy = (
  date: string,
  quantity: string | number,
  price: string | number,
  feesCents = 0,
): TradeInput => ({
  kind: 'buy',
  date,
  quantity,
  unitPrice: price,
  feesCents,
  totalCents: tradeTotalCents(quantity, price, feesCents),
})
const sell = (
  date: string,
  quantity: string | number,
  price: string | number,
  feesCents = 0,
): TradeInput => ({
  kind: 'sell',
  date,
  quantity,
  unitPrice: price,
  feesCents,
  totalCents: tradeTotalCents(quantity, price, 0) - feesCents,
})

describe('RC-20 — valor da operação', () => {
  it('qtd × preço + taxas (ITSA4: 4 × R$ 7,00 = R$ 28,00)', () => {
    expect(tradeTotalCents(4, '7.00', 0)).toBe(2800)
    expect(tradeTotalCents('3', '9.73', 49)).toBe(2968)
    // Arredonda o produto para o centavo (half-even) antes de somar as taxas.
    expect(tradeTotalCents('0.5', '0.01', 0)).toBe(0)
    expect(valueCents('0.333', '10')).toBe(333)
  })
})

describe('§4 — posição e preço médio (método da Receita)', () => {
  it('3 compras com taxas', () => {
    const position = computePosition([
      buy('2026-01-10', 10, '10.00', 100),
      buy('2026-02-10', 5, '12.00', 50),
      buy('2026-03-10', 5, '8.00', 50),
    ])
    // custo = 101 + 60,50 + 40,50 = 202,00 → PM = 10,10
    expect(position.quantity.toString()).toBe('20')
    expect(position.costCents).toBe(20200)
    expect(position.avgPrice.toFixed(2)).toBe('10.10')
    expect(position.investedCents).toBe(20200)
  })

  it('venda parcial não altera o PM e realiza o lucro', () => {
    const position = computePosition([
      buy('2026-01-10', 10, '10.00', 0),
      buy('2026-02-10', 10, '20.00', 0),
      sell('2026-03-10', 5, '25.00', 100),
    ])
    expect(position.avgPrice.toFixed(2)).toBe('15.00')
    expect(position.quantity.toString()).toBe('15')
    expect(position.costCents).toBe(22500)
    // 5 × (25 − 15) − 1,00 = 49,00
    expect(position.realizedPnlCents).toBe(4900)
  })

  it('venda acima da posição falha; vender tudo zera o custo', () => {
    expect(() => computePosition([buy('2026-01-10', 2, 10), sell('2026-01-11', 3, 10)])).toThrow(
      PortfolioError,
    )
    const zero = computePosition([buy('2026-01-10', 3, '10.01'), sell('2026-02-10', 3, '9')])
    expect(zero.quantity.isZero()).toBe(true)
    expect(zero.costCents).toBe(0)
    expect(zero.avgPrice.isZero()).toBe(true)
    expect(zero.realizedPnlCents).toBe(-303)
  })

  it('ordem por data e, no mesmo dia, pelo cadastro', () => {
    const position = computePosition([
      { ...sell('2026-01-10', 1, 12), createdAt: '2026-01-10T12:00:00Z' },
      { ...buy('2026-01-10', 2, 10), createdAt: '2026-01-10T09:00:00Z' },
    ])
    expect(position.quantity.toString()).toBe('1')
  })

  it('desdobramento 1:10 e grupamento 10:1', () => {
    const split = computePosition([
      buy('2026-01-10', 10, '50.00'),
      {
        kind: 'split',
        date: '2026-02-01',
        quantity: 0,
        unitPrice: 0,
        feesCents: 0,
        totalCents: 0,
        splitRatio: 10,
      },
    ])
    expect(split.quantity.toString()).toBe('100')
    expect(split.costCents).toBe(50000)
    expect(split.avgPrice.toFixed(2)).toBe('5.00')

    const reverse = computePosition([
      buy('2026-01-10', 100, '0.50'),
      {
        kind: 'reverse_split',
        date: '2026-02-01',
        quantity: 0,
        unitPrice: 0,
        feesCents: 0,
        totalCents: 0,
        splitRatio: 10,
      },
    ])
    expect(reverse.quantity.toString()).toBe('10')
    expect(reverse.avgPrice.toFixed(2)).toBe('5.00')
    expect(() =>
      computePosition([
        {
          kind: 'split',
          date: '2026-02-01',
          quantity: 0,
          unitPrice: 0,
          feesCents: 0,
          totalCents: 0,
        },
      ]),
    ).toThrow('proporção')
  })

  it('bonificação com custo atribuído (e sem custo)', () => {
    const bonus = computePosition([
      buy('2026-01-10', 100, '10.00'),
      {
        kind: 'bonus',
        date: '2026-02-01',
        quantity: 10,
        unitPrice: '5.00',
        feesCents: 0,
        totalCents: 5000,
      },
    ])
    expect(bonus.quantity.toString()).toBe('110')
    expect(bonus.costCents).toBe(105000)
    expect(bonus.avgPrice.toFixed(4)).toBe('9.5455')
    const free = computePosition([
      buy('2026-01-10', 10, '10.00'),
      { kind: 'bonus', date: '2026-02-01', quantity: 1, unitPrice: 0, feesCents: 0, totalCents: 0 },
    ])
    expect(free.costCents).toBe(10000)
  })

  it('renda fixa: depósitos − resgates; quantidade fracionária; negativa falha', () => {
    const fixed = computePosition([
      {
        kind: 'fixed_income_deposit',
        date: '2026-01-05',
        quantity: 1,
        unitPrice: '1000',
        feesCents: 0,
        totalCents: 100000,
      },
      {
        kind: 'fixed_income_deposit',
        date: '2026-02-05',
        quantity: 1,
        unitPrice: '500',
        feesCents: 0,
        totalCents: 50000,
      },
      {
        kind: 'fixed_income_withdrawal',
        date: '2026-03-05',
        quantity: 0,
        unitPrice: '200',
        feesCents: 0,
        totalCents: 20000,
      },
      {
        kind: 'fixed_income_withdrawal',
        date: '2026-04-05',
        quantity: 0,
        unitPrice: '0',
        feesCents: 0,
        totalCents: 999999,
      },
    ])
    expect(fixed.costCents).toBe(0)
    expect(fixed.investedCents).toBe(150000)
    const crypto = computePosition([buy('2026-01-10', '0.00012345', '350000')])
    expect(crypto.quantity.toString()).toBe('0.00012345')
    expect(crypto.costCents).toBe(4321)
    expect(() => computePosition([buy('2026-01-10', -1, 10)])).toThrow('negativa')
    expect(computePosition([]).avgPrice.isZero()).toBe(true)
  })

  it('subscrição soma como compra; resgate com quantidade reduz títulos', () => {
    const position = computePosition([
      {
        kind: 'subscription',
        date: '2026-01-05',
        quantity: 2,
        unitPrice: 10,
        feesCents: 0,
        totalCents: 2000,
      },
      {
        kind: 'fixed_income_withdrawal',
        date: '2026-02-05',
        quantity: 1,
        unitPrice: 10,
        feesCents: 0,
        totalCents: 1000,
      },
    ])
    expect(position.quantity.toString()).toBe('1')
    expect(position.costCents).toBe(1000)
  })

  it('ajuste de posição informado à mão: substitui qtd e PM; operações depois seguem', () => {
    const set = (date: string, quantity: string, price: string): TradeInput => ({
      kind: 'position_set',
      date,
      quantity,
      unitPrice: price,
      feesCents: 0,
      totalCents: valueCents(quantity, price),
    })
    // Só o ajuste: ativo novo com posição conhecida.
    const only = computePosition([set('2026-01-01', '44', '9.50')])
    expect(only.quantity.toString()).toBe('44')
    expect(only.avgPrice.toString()).toBe('9.5')
    expect(only.costCents).toBe(41800)
    expect(only.investedCents).toBe(41800)

    // Histórico antes do ajuste deixa de contar para qtd/PM; o lucro realizado fica.
    const position = computePosition([
      buy('2026-01-05', 10, 10),
      sell('2026-01-10', 5, 12),
      set('2026-02-01', '20', '11'),
      buy('2026-03-01', 10, 14),
    ])
    expect(position.quantity.toString()).toBe('30')
    expect(position.costCents).toBe(22000 + 14000)
    expect(position.avgPrice.toString()).toBe('12')
    expect(position.realizedPnlCents).toBe(1000)

    // Zerar a posição; vender depois do zero falha.
    expect(computePosition([buy('2026-01-05', 10, 10), set('2026-02-01', '0', '0')])).toMatchObject(
      { costCents: 0 },
    )
    expect(() => computePosition([set('2026-02-01', '0', '0'), sell('2026-03-01', 1, 10)])).toThrow(
      PortfolioError,
    )

    // Renda fixa: total = valor aplicado.
    const fixed = computePosition([
      {
        kind: 'fixed_income_deposit',
        date: '2026-01-01',
        quantity: 1,
        unitPrice: 0,
        feesCents: 0,
        totalCents: 50000,
      },
      {
        kind: 'position_set',
        date: '2026-02-01',
        quantity: 1,
        unitPrice: 0,
        feesCents: 0,
        totalCents: 120000,
      },
    ])
    expect(fixed.costCents).toBe(120000)
  })
})

describe('§6 — valores derivados', () => {
  it('valor, resultado e resultado %', () => {
    expect(valuate({ quantity: 10, costCents: 10000, price: '12.50' })).toEqual({
      valueCents: 12500,
      resultCents: 2500,
      resultPct: 0.25,
    })
    // Renda fixa: saldo informado.
    expect(
      valuate({ quantity: 1, costCents: 100000, price: null, manualValueCents: 103500 })
        .resultCents,
    ).toBe(3500)
    // Sem cotação nem saldo: vale o custo.
    expect(valuate({ quantity: 1, costCents: 5000, price: null })).toEqual({
      valueCents: 5000,
      resultCents: 0,
      resultPct: 0,
    })
    expect(valuate({ quantity: 0, costCents: 0, price: 10 }).resultPct).toBeNull()
  })

  it('peso na classe e na carteira, com ativo de renda fixa manual', () => {
    const fixed = valuate({ quantity: 1, costCents: 100000, price: null, manualValueCents: 150000 })
    const result = weights([
      { id: 'tesouro', classId: 'rf', valueCents: fixed.valueCents },
      { id: 'mxrf', classId: 'fii', valueCents: 30000 },
      { id: 'hfof', classId: 'fii', valueCents: 20000 },
    ])
    expect(result.get('tesouro')).toEqual({ inClass: 1, inPortfolio: 0.75 })
    expect(result.get('mxrf')).toEqual({ inClass: 0.6, inPortfolio: 0.15 })
    expect(weights([{ id: 'x', classId: 'a', valueCents: 0 }]).get('x')).toEqual({
      inClass: 0,
      inPortfolio: 0,
    })
  })

  it('alocação × meta: desvio > 5 p.p., teto e quanto falta', () => {
    const rows = allocation(
      [
        { classId: 'rf', valueCents: 60000 },
        { classId: 'fii', valueCents: 25000 },
        { classId: 'acoes', valueCents: 15000 },
        { classId: 'cripto', valueCents: 0 },
      ],
      [
        { classId: 'rf', targetPct: '45' },
        { classId: 'fii', targetPct: 30, maxPct: 20 },
        { classId: 'acoes', targetPct: '25' },
      ],
    )
    expect(rows[0]).toMatchObject({
      current: 0.6,
      target: 0.45,
      deviationPp: 15,
      offTarget: true,
      missingCents: 0,
    })
    expect(rows[1]).toMatchObject({
      deviationPp: -5,
      offTarget: false,
      aboveMax: true,
      missingCents: 5000,
    })
    expect(rows[2]).toMatchObject({ deviationPp: -10, offTarget: true, missingCents: 10000 })
    expect(rows[3]).toMatchObject({ target: null, deviationPp: null, offTarget: false })
    expect(
      targetsTotal([{ targetPct: '45' }, { targetPct: 30 }, { targetPct: '25' }]).toString(),
    ).toBe('100')
    expect(allocation([{ classId: 'a', valueCents: 0 }], [])[0]?.current).toBe(0)
  })

  it('proventos 12 meses, por mês e yield on cost', () => {
    const dividends = [
      { assetId: 'a', payDate: '2025-11-30', amountCents: 999 },
      { assetId: 'a', payDate: '2025-12-15', amountCents: 400 },
      { assetId: 'a', payDate: '2026-05-27', amountCents: 800 },
      { assetId: 'b', payDate: '2026-11-10', amountCents: 300 },
      { assetId: 'b', payDate: '2026-11-25', amountCents: 5000 },
    ]
    expect(dividendsLast12Months(dividends, '2026-11-20')).toBe(1500)
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(dividendsByMonth(dividends, lastMonths('2026-01', 2))).toEqual([
      { month: '2025-12', amountCents: 400 },
      { month: '2026-01', amountCents: 0 },
    ])
    expect(yieldOnCost(1500, 15000)).toBe(0.1)
    expect(yieldOnCost(100, 0)).toBeNull()
  })
})

describe('catálogo', () => {
  it('classes padrão, tickers', () => {
    expect(DEFAULT_ASSET_CLASSES.map((item) => item.name)).toEqual([
      'Renda Fixa / Reserva',
      'FIIs',
      'Ações',
      'Exterior',
      'Cripto',
    ])
    expect(isManualQuoteKind('fixed_income')).toBe(true)
    expect(isManualQuoteKind('stock')).toBe(false)
    expect(normalizeTicker(' itsa4 ')).toBe('ITSA4')
    expect(isTicker('MXRF11')).toBe(true)
    expect(isTicker('Tesouro IPCA+ 2035')).toBe(false)
  })
})

describe('RC-31/32 — quando a cotação em cache ainda serve', () => {
  // Datas em UTC; São Paulo = UTC−3.
  const at = (iso: string) => new Date(iso)

  it('pregão aberto/fechado e último fechamento', () => {
    expect(isMarketOpen(at('2026-11-18T14:00:00Z'))).toBe(true) // qua 11h
    expect(isMarketOpen(at('2026-11-18T12:59:00Z'))).toBe(false) // qua 9h59
    expect(isMarketOpen(at('2026-11-18T21:30:00Z'))).toBe(false) // qua 18h30
    expect(isMarketOpen(at('2026-11-21T15:00:00Z'))).toBe(false) // sábado
    // Sábado → fechamento de sexta 18h30 (21h30 UTC).
    expect(lastMarketClose(at('2026-11-21T15:00:00Z')).toISOString()).toBe(
      '2026-11-20T21:30:00.000Z',
    )
    // Segunda 8h → sexta. Quarta 20h → quarta.
    expect(lastMarketClose(at('2026-11-23T11:00:00Z')).toISOString()).toBe(
      '2026-11-20T21:30:00.000Z',
    )
    expect(lastMarketClose(at('2026-11-18T23:00:00Z')).toISOString()).toBe(
      '2026-11-18T21:30:00.000Z',
    )
  })

  it('TTL no pregão; depois do fechamento vale até o próximo pregão', () => {
    const now = at('2026-11-18T15:00:00Z') // qua 12h
    expect(quoteIsFresh({ fetchedAt: at('2026-11-18T14:45:00Z') }, now)).toBe(true)
    expect(quoteIsFresh({ fetchedAt: at('2026-11-18T14:20:00Z') }, now)).toBe(false)
    expect(quoteIsFresh({ fetchedAt: null }, now)).toBe(false)
    // Sábado: buscada sexta 19h → serve; buscada sexta 15h → precisa (uma vez) do fechamento.
    const saturday = at('2026-11-21T15:00:00Z')
    expect(quoteIsFresh({ fetchedAt: at('2026-11-20T22:00:00Z') }, saturday)).toBe(true)
    expect(quoteIsFresh({ fetchedAt: at('2026-11-20T18:00:00Z') }, saturday)).toBe(false)
    expect(
      quoteIsFresh({ fetchedAt: at('2026-11-20T18:00:00Z') }, saturday, { ttlMinutes: 10_000 }),
    ).toBe(true)
  })

  it('falha recente espera antes de tentar de novo; mês do contador', () => {
    const now = at('2026-11-18T15:00:00Z')
    expect(quoteIsFresh({ fetchedAt: null, errorAt: at('2026-11-18T13:00:00Z') }, now)).toBe(true)
    expect(quoteIsFresh({ fetchedAt: null, errorAt: at('2026-11-18T05:00:00Z') }, now)).toBe(false)
    expect(usageMonth(at('2026-12-01T02:00:00Z'))).toBe('2026-11')
  })
})
