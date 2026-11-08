import { describe, expect, it } from 'vitest'
import {
  ASSETS_EXAMPLE,
  DIVIDENDS_EXAMPLE,
  PORTFOLIO_SHEET_EXAMPLE,
  TRADES_EXAMPLE,
} from './examples.ts'
import { suggestMapping } from './mapping.ts'
import {
  ASSET_FIELDS,
  assetRowToDraft,
  classKindFromName,
  DIVIDEND_FIELDS,
  dividendRowToDraft,
  TRADE_FIELDS,
  tradeRowToDraft,
} from './portfolio-rows.ts'
import {
  balanceAdjustments,
  buildPortfolioDrafts,
  fixedIncomeLabels,
  initialPositions,
  readPortfolioSheet,
} from './portfolio-sheet.ts'
import { pickFields } from './template-rows.ts'

const rowsOf = (example: typeof ASSETS_EXAMPLE) => {
  const [header = [], ...rows] = example.sheets[0]?.rows ?? []
  return { header: header.map(String), rows }
}

describe('templates da carteira', () => {
  it('ativos: bolsa e renda fixa', () => {
    const { header, rows } = rowsOf(ASSETS_EXAMPLE)
    const mapping = suggestMapping(header, ASSET_FIELDS)
    const parsed = rows.map((row, i) => assetRowToDraft(i + 2, pickFields(row, mapping)))
    expect(parsed.every((row) => row.errors.length === 0)).toBe(true)
    expect(parsed[0]?.draft).toMatchObject({
      ticker: 'MXRF11',
      classKind: 'reit',
      targetWeightPct: '20',
      maxWeightPct: '10',
      accountName: 'Rico',
    })
    expect(parsed[2]?.draft).toMatchObject({
      ticker: null,
      name: 'Tesouro Selic 2031',
      classKind: 'fixed_income',
      fixedIncome: { indexer: 'SELIC', maturity: '2031-03-01' },
    })
    const bad = assetRowToDraft(9, { classe: '', ticker: 'ITSA-4!', nome: '' })
    expect(bad.errors).toEqual(
      expect.arrayContaining(['Informe a classe', 'Ticker inválido: "ITSA-4!"']),
    )
    expect(assetRowToDraft(10, {}).skipped).toBe('Linha vazia')
  })

  it('operações: compra, venda, renda fixa, desdobramento; total calculado', () => {
    const { header, rows } = rowsOf(TRADES_EXAMPLE)
    const mapping = suggestMapping(header, TRADE_FIELDS)
    const parsed = rows.map((row, i) => tradeRowToDraft(i + 2, pickFields(row, mapping)))
    expect(parsed.every((row) => row.errors.length === 0)).toBe(true)
    expect(parsed.map((row) => row.draft?.kind === 'assetTrade' && row.draft.tradeKind)).toEqual([
      'buy',
      'buy',
      'sell',
      'fixed_income_deposit',
      'split',
    ])
    expect(parsed[1]?.draft).toMatchObject({
      quantity: '10',
      unitPrice: '9.73',
      feesCents: 10,
      totalCents: 9740,
    })
    expect(parsed[2]?.draft).toMatchObject({ totalCents: 2900 })
    expect(parsed[3]?.draft).toMatchObject({
      asset: { ticker: null, name: 'Tesouro Selic 2031' },
      quantity: '1',
      unitPrice: '2377.18',
      totalCents: 237718,
    })
    expect(parsed[4]?.draft).toMatchObject({ splitRatio: '2', totalCents: 0 })
    const noType = tradeRowToDraft(9, {
      data: '01/01/2026',
      ticker_ou_nome: 'ITSA4',
      quantidade: '1',
      preco: '10',
    })
    expect(noType.warnings).toContain('Sem tipo: importado como compra')
    const bad = tradeRowToDraft(10, {
      data: 'x',
      ticker_ou_nome: '',
      tipo: 'troca',
      quantidade: '0',
    })
    expect(bad.draft).toBeNull()
    expect(bad.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('proventos: tipos', () => {
    const { header, rows } = rowsOf(DIVIDENDS_EXAMPLE)
    const mapping = suggestMapping(header, DIVIDEND_FIELDS)
    const parsed = rows.map((row, i) => dividendRowToDraft(i + 2, pickFields(row, mapping)))
    expect(parsed.map((row) => row.draft?.kind === 'dividend' && row.draft.dividendKind)).toEqual([
      'income',
      'income',
      'jcp',
      'dividend',
    ])
    expect(parsed[0]?.draft).toMatchObject({
      amountCents: 540,
      payDate: '2026-10-14',
      asset: { ticker: 'MXRF11' },
    })
    expect(
      dividendRowToDraft(9, { data_pagamento: '01/01/2026', ticker: 'X', valor: '' }).errors,
    ).toContain('Valor vazio')
    expect(classKindFromName('Fundos imobiliários')).toBe('reit')
    expect(classKindFromName('Bitcoin')).toBe('crypto')
    expect(classKindFromName('Previdência')).toBeNull()
  })

  it('tipos de operação por texto, ajuste de posição, números e bordas', () => {
    const trade = (tipo: string, extra: Record<string, string | number> = {}, label = 'ITSA4') =>
      tradeRowToDraft(2, {
        data: '05/01/2026',
        ticker_ou_nome: label,
        tipo,
        quantidade: '2',
        preco: '10',
        ...extra,
      })
    const kindOf = (row: ReturnType<typeof trade>) =>
      row.draft?.kind === 'assetTrade' ? row.draft.tradeKind : null
    expect(
      [
        'C',
        'v',
        'Venda',
        'Bonificação',
        'Desdobramento',
        'Grupamento',
        'Subscrição',
        'Ajuste',
        'Posição',
        'Saldo inicial',
      ].map((tipo) => kindOf(trade(tipo))),
    ).toEqual([
      'buy',
      'sell',
      'sell',
      'bonus',
      'split',
      'reverse_split',
      'subscription',
      'position_set',
      'position_set',
      'position_set',
    ])
    // Renda fixa: compra/venda viram aplicação/resgate; sem quantidade, o total vira o preço.
    const fixed = (tipo: string) =>
      trade(tipo, { quantidade: '', preco: '', valor_total: '500' }, 'CDB Nubank')
    expect(
      ['compra', 'venda', 'Aplicação', 'Resgate', 'Retirada', 'Aporte'].map((t) =>
        kindOf(fixed(t)),
      ),
    ).toEqual([
      'fixed_income_deposit',
      'fixed_income_withdrawal',
      'fixed_income_deposit',
      'fixed_income_withdrawal',
      'fixed_income_withdrawal',
      'fixed_income_deposit',
    ])
    expect(fixed('Aplicação').draft).toMatchObject({
      quantity: '1',
      unitPrice: '500.00',
      totalCents: 50000,
    })
    expect(fixed('').warnings).toContain('Sem tipo: importado como compra')
    expect(kindOf(fixed(''))).toBe('fixed_income_deposit')

    // Números: "R$ 1.234,56", número da célula, negativo e lixo.
    expect(trade('compra', { preco: 'R$ 1.234,56', quantidade: 1 }).draft).toMatchObject({
      unitPrice: '1234.56',
      quantity: '1',
      totalCents: 123456,
    })
    expect(trade('compra', { quantidade: -3 }).errors).toContain('Quantidade inválida')
    expect(trade('compra', { preco: 'abc' }).errors).toContain('Preço inválido')
    expect(trade('compra', { taxas: 'x' }).draft).toBeNull()
    expect(trade('compra', { valor_total: 'x' }).draft).toBeNull()
    expect(trade('compra', { data: '' }).errors).toContain('Data vazia')
    // Venda: total = bruto − taxas; total da nota informado prevalece.
    expect(trade('venda', { taxas: '1,00' }).draft).toMatchObject({
      totalCents: 1900,
      feesCents: 100,
    })
    expect(trade('compra', { valor_total: '25' }).draft).toMatchObject({ totalCents: 2500 })
    expect(trade('compra', { corretora: 'Rico' }).draft).toMatchObject({
      asset: { ticker: 'ITSA4', accountName: 'Rico' },
    })

    // Proventos: todos os tipos e erros.
    const dividend = (tipo: string, extra: Record<string, string> = {}) =>
      dividendRowToDraft(2, {
        data_pagamento: '10/02/2026',
        ticker: 'TAEE11',
        valor: '12,30',
        tipo,
        ...extra,
      })
    expect(
      ['', 'JCP', 'Juros sobre capital', 'Rendimento', 'Juros', 'Dividendo', 'Amortização'].map(
        (tipo) => {
          const draft = dividend(tipo).draft
          return draft?.kind === 'dividend' ? draft.dividendKind : null
        },
      ),
    ).toEqual(['dividend', 'jcp', 'jcp', 'income', 'interest', 'dividend', 'other'])
    expect(dividend('', { ticker: '' }).errors).toContain('Informe o ticker')
    expect(dividend('', { data_pagamento: '' }).errors).toContain('Data vazia')
    expect(dividend('', { data_pagamento: 'ontem' }).draft).toBeNull()
    expect(dividend('', { valor: 'muito' }).draft).toBeNull()
    expect(dividendRowToDraft(3, {}).skipped).toBe('Linha vazia')
    expect(tradeRowToDraft(3, {}).skipped).toBe('Linha vazia')

    // Classes por nome.
    expect(
      ['FIIs', 'Ações', 'ETFs', 'Reserva de emergência', 'BDRs', 'Cripto', ''].map(
        classKindFromName,
      ),
    ).toEqual(['reit', 'stock', 'etf', 'fixed_income', 'international', 'crypto', null])

    // Ativo: só nome vira renda fixa; vencimento inválido; pesos.
    expect(assetRowToDraft(2, { classe: 'Outros', nome: 'Previdência XP' }).draft).toMatchObject({
      ticker: null,
      classKind: null,
      fixedIncome: { indexer: null, rate: null, maturity: null },
    })
    expect(
      assetRowToDraft(2, { classe: 'Renda fixa', nome: 'CDB', vencimento: 'x' }).draft,
    ).toBeNull()
    expect(assetRowToDraft(2, { classe: 'Ações' }).errors).toContain('Informe o ticker ou o nome')
    expect(
      assetRowToDraft(2, { classe: 'Ações', ticker: 'itsa4', peso_meta_classe: '12,5' }).draft,
    ).toMatchObject({ ticker: 'ITSA4', name: 'ITSA4', fixedIncome: null, targetWeightPct: '12.5' })
  })
})

describe('planilha da carteira', () => {
  const grid = PORTFOLIO_SHEET_EXAMPLE.sheets[0]?.rows ?? []
  const read = readPortfolioSheet(grid, 2026)
  const names = { 'tesouro selic 2031': 'Tesouro Selic 2031', 'caixinha nubank': 'Caixinha Nubank' }

  it('lê metas, aportes, balanços e proventos', () => {
    expect(read.targets).toEqual([
      { classKind: 'reit', targetPct: '30' },
      { classKind: 'stock', targetPct: '25' },
      { classKind: 'fixed_income', targetPct: '45' },
    ])
    expect(read.months).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(
      read.trades.map((trade) => `${trade.classKind}:${trade.label}:${trade.totalCents}`),
    ).toEqual([
      'reit:MXRF11:9730',
      'stock:ITSA4:5384',
      'fixed_income:TESOURO SELIC 2031:37067',
      'reit:HFOF11:6840',
      'fixed_income:CAIXINHA NUBANK:23663',
      'stock:TAEE11:8600',
      'fixed_income:CAIXINHA NUBANK:20000',
    ])
    expect(read.balances).toHaveLength(8)
    expect(read.dividends.map((item) => item.label)).toEqual([
      'MXRF11',
      'ITSA4',
      'MXRF11',
      'HFOF11',
    ])
    expect(fixedIncomeLabels(read).map((item) => item.label)).toEqual([
      'CAIXINHA NUBANK',
      'TESOURO SELIC 2031',
    ])
  })

  it('posição inicial pelo 1º balanço e conciliação', () => {
    const initial = initialPositions(read, { fixedIncomeNames: names })
    expect(initial).toEqual([
      {
        key: 'ITSA4',
        classKind: 'stock',
        date: '2026-01-01',
        quantity: '23',
        suggestedPrice: '14.1',
        valueCents: null,
        balanceDate: '2026-01-31',
      },
      {
        key: 'MXRF11',
        classKind: 'reit',
        date: '2026-01-01',
        quantity: '44',
        suggestedPrice: '9.8',
        valueCents: null,
        balanceDate: '2026-01-31',
      },
      {
        key: 'Tesouro Selic 2031',
        classKind: 'fixed_income',
        date: '2026-01-01',
        quantity: null,
        suggestedPrice: null,
        valueCents: 237718,
        balanceDate: '2026-01-31',
      },
    ])
    // HFOF11 aparece no balanço de fevereiro com as 10 cotas compradas: nada a ajustar.
    expect(balanceAdjustments(read, { fixedIncomeNames: names })).toEqual([])
    // Se o balanço mostrar mais, vira uma compra de ajuste.
    const more = readPortfolioSheet(
      grid.map((row) =>
        row[2] === 'HFOF11' && row[3] === '28/02/2026' ? [...row.slice(0, 6), 12] : row,
      ),
      2026,
    )
    expect(balanceAdjustments(more, { fixedIncomeNames: names })).toEqual([
      expect.objectContaining({
        ticker: 'HFOF11',
        kind: 'buy',
        quantity: '2',
        price: '6.8',
        date: '2026-02-28',
      }),
    ])
  })

  it('rascunhos: metas, ativos com último preço/saldo, posição inicial com PM informado', () => {
    const drafts = buildPortfolioDrafts(read, {
      fixedIncomeNames: names,
      accountName: 'Rico',
      initialPrices: { MXRF11: '9.50' },
      initialValues: {},
    })
    const kinds = drafts.map((row) => row.draft?.kind)
    expect(kinds.filter((kind) => kind === 'classTarget')).toHaveLength(3)
    expect(kinds.filter((kind) => kind === 'dividend')).toHaveLength(4)
    const assets = drafts.filter((row) => row.draft?.kind === 'asset').map((row) => row.draft)
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticker: 'MXRF11',
          manualPrice: '9.82',
          manualPriceAt: '2026-02-28',
          accountName: 'Rico',
        }),
        expect.objectContaining({ ticker: null, name: 'Caixinha Nubank', manualValueCents: 23748 }),
        expect.objectContaining({
          ticker: null,
          name: 'Tesouro Selic 2031',
          manualValueCents: 279192,
        }),
      ]),
    )
    const initialMxrf = drafts.find(
      (row) =>
        row.draft?.kind === 'assetTrade' &&
        row.draft.notes?.startsWith('Posição inicial') &&
        row.draft.asset.ticker === 'MXRF11',
    )
    expect(initialMxrf?.draft).toMatchObject({
      quantity: '44',
      unitPrice: '9.50',
      date: '2026-01-01',
      tradeKind: 'buy',
    })
    const initialTesouro = drafts.find(
      (row) =>
        row.draft?.kind === 'assetTrade' &&
        row.draft.notes?.startsWith('Posição inicial') &&
        row.draft.asset.ticker === null,
    )
    expect(initialTesouro?.draft).toMatchObject({
      tradeKind: 'fixed_income_deposit',
      totalCents: 237718,
    })
    const dividend = drafts.find((row) => row.draft?.kind === 'dividend')
    expect(dividend?.draft).toMatchObject({ dividendKind: 'income', asset: { ticker: 'MXRF11' } })
  })

  it('PM inválido na posição inicial vira erro da linha', () => {
    const drafts = buildPortfolioDrafts(read, {
      fixedIncomeNames: names,
      accountName: null,
      initialPrices: { ITSA4: 'abc' },
      initialValues: {},
    })
    const itsa = drafts.find((row) => row.raw.posicao_inicial && row.raw.ativo === 'ITSA4')
    expect(itsa?.errors).toEqual(['Informe o preço médio da posição inicial'])
  })
})
