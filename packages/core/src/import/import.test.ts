import { describe, expect, it } from 'vitest'
import { detectSeparator, parseCsv, toCsv } from './csv.ts'
import { duplicateKey } from './drafts.ts'
import { INSTALLMENTS_EXAMPLE, MONTHLY_SHEET_EXAMPLE, TRANSACTIONS_EXAMPLE } from './examples.ts'
import {
  INSTALLMENT_FIELDS,
  parseNatureValue,
  parsePaymentMethodValue,
  parseStatusValue,
  parseTypeValue,
  suggestMapping,
  TRANSACTION_FIELDS,
} from './mapping.ts'
import { buildMonthlyDrafts, distinctBanks, readMonthlySheet } from './monthly-sheet.ts'
import { installmentRowToDraft, pickFields, transactionRowToDraft } from './template-rows.ts'
import {
  excelSerialToIsoDate,
  monthNumberFromName,
  normalizeText,
  parseImportAmount,
  parseImportDate,
  parseImportMonth,
  sameDayInMonth,
} from './text.ts'

describe('RI-01 — números e datas pt-BR', () => {
  it('valores', () => {
    expect(parseImportAmount('1.234,56')).toEqual({ ok: true, value: 123456 })
    expect(parseImportAmount('R$ 1.234,56')).toEqual({ ok: true, value: 123456 })
    expect(parseImportAmount('-50')).toEqual({ ok: true, value: -5000 })
    expect(parseImportAmount('(50,00)')).toEqual({ ok: true, value: -5000 })
    expect(parseImportAmount(4379)).toEqual({ ok: true, value: 437900 })
    // Ponto flutuante da planilha arredonda para o centavo.
    expect(parseImportAmount(0.1 + 0.2)).toEqual({ ok: true, value: 30 })
    expect(parseImportAmount(1000.44)).toEqual({ ok: true, value: 100044 })
    expect(parseImportAmount('')).toEqual({ ok: true, value: null })
    expect(parseImportAmount(null)).toEqual({ ok: true, value: null })
    expect(parseImportAmount('abc').ok).toBe(false)
    expect(parseImportAmount(Number.NaN).ok).toBe(false)
  })

  it('datas: dd/mm/aaaa, dd/mm/aa, ISO e serial do Excel', () => {
    expect(parseImportDate('05/11/2026')).toEqual({ ok: true, value: '2026-11-05' })
    expect(parseImportDate('5/1/26')).toEqual({ ok: true, value: '2026-01-05' })
    expect(parseImportDate('2026-11-05')).toEqual({ ok: true, value: '2026-11-05' })
    expect(parseImportDate('2026-11-05T10:00:00Z')).toEqual({ ok: true, value: '2026-11-05' })
    expect(parseImportDate(46023)).toEqual({ ok: true, value: '2026-01-01' })
    expect(parseImportDate('46023')).toEqual({ ok: true, value: '2026-01-01' })
    expect(parseImportDate('')).toEqual({ ok: true, value: null })
    expect(parseImportDate('31/02/2026').ok).toBe(false)
    expect(parseImportDate('amanhã').ok).toBe(false)
    expect(parseImportDate(-5).ok).toBe(false)
    expect(excelSerialToIsoDate(45658)).toBe('2025-01-01')
  })

  it('meses', () => {
    expect(parseImportMonth('11/2026')).toEqual({ ok: true, value: '2026-11' })
    expect(parseImportMonth('1/26')).toEqual({ ok: true, value: '2026-01' })
    expect(parseImportMonth('2026-03')).toEqual({ ok: true, value: '2026-03' })
    expect(parseImportMonth('15/03/2026')).toEqual({ ok: true, value: '2026-03' })
    expect(parseImportMonth('')).toEqual({ ok: true, value: null })
    expect(parseImportMonth('13/2026').ok).toBe(false)
    expect(monthNumberFromName('MARÇO')).toBe(3)
    expect(monthNumberFromName('dez')).toBe(12)
    expect(monthNumberFromName('Fevereiro 2026')).toBe(2)
    expect(monthNumberFromName('SALÁRIO')).toBeNull()
    expect(sameDayInMonth('2026-02', '2026-01-31')).toBe('2026-02-28')
    expect(sameDayInMonth('2026-02', null)).toBe('2026-02-01')
  })

  it('texto normalizado', () => {
    expect(normalizeText('  Cartão   CRÉDITO ')).toBe('cartao credito')
  })
})

describe('CSV', () => {
  it('detecta separador e lê aspas, aspas dobradas, quebras e BOM', () => {
    const text =
      '\uFEFFdata;descricao;valor\r\n05/11/2026;"Mercado; feira";"1.234,56"\n06/11/2026;"Diz ""oi""\nok";10\n\n'
    expect(detectSeparator(text)).toBe(';')
    expect(parseCsv(text)).toEqual([
      ['data', 'descricao', 'valor'],
      ['05/11/2026', 'Mercado; feira', '1.234,56'],
      ['06/11/2026', 'Diz "oi"\nok', '10'],
    ])
    expect(detectSeparator('a,b,c\n1,2,3')).toBe(',')
    expect(detectSeparator('a\tb\tc')).toBe('\t')
  })

  it('gera CSV com ; e protege fórmulas', () => {
    expect(
      toCsv([
        ['Descrição', 'Valor'],
        ['Feira; sábado', '-10,00'],
        ['=1+1', null],
        [42, 'a"b'],
      ]),
    ).toBe('Descrição;Valor\r\n"Feira; sábado";-10,00\r\n\'=1+1;\r\n42;"a""b"')
    expect(parseCsv(toCsv([['x;y', 'z']]))).toEqual([['x;y', 'z']])
  })
})

describe('mapeamento de colunas', () => {
  it('sugere pelos sinônimos pt-BR, sem repetir coluna', () => {
    const mapping = suggestMapping(
      ['Data', 'Histórico', 'Vlr', 'Forma de Pagamento', 'Cartão', 'Obs'],
      TRANSACTION_FIELDS,
    )
    expect(mapping).toMatchObject({
      data: 0,
      descricao: 1,
      valor: 2,
      forma_pagamento: 3,
      cartao: 4,
      observacao: 5,
      categoria: null,
    })
    const plan = suggestMapping(
      ['Data da compra', 'Descrição', 'Valor total', 'Qtd. parcelas', 'Parcela atual'],
      INSTALLMENT_FIELDS,
    )
    expect(plan).toMatchObject({
      data_compra: 0,
      descricao: 1,
      valor_total: 2,
      qtd_parcelas: 3,
      parcela_atual: 4,
    })
  })

  it('valores de enumeração', () => {
    expect(parseTypeValue('Receita')).toBe('income')
    expect(parseTypeValue('saída')).toBe('expense')
    expect(parseTypeValue('?')).toBeNull()
    expect(parseNatureValue('Fixa')).toBe('fixed')
    expect(parseNatureValue('variável')).toBe('variable')
    expect(parseNatureValue('PLANEJAMENTO')).toBe('planned')
    expect(parseNatureValue('parcela')).toBe('installment')
    expect(parseNatureValue('')).toBeNull()
    expect(parseNatureValue('xyz')).toBeUndefined()
    expect(parsePaymentMethodValue('Crédito')).toBe('credit')
    expect(parsePaymentMethodValue('TED')).toBe('transfer')
    expect(parsePaymentMethodValue('cheque')).toBeUndefined()
    expect(parseStatusValue('Pago')).toBe('settled')
    expect(parseStatusValue('pendente')).toBe('forecast')
    expect(parseStatusValue('talvez')).toBeUndefined()
  })
})

describe('template Lançamentos', () => {
  const headers = [
    'data',
    'tipo',
    'natureza',
    'descricao',
    'valor',
    'forma_pagamento',
    'cartao',
    'status',
    'categoria',
  ]
  const mapping = suggestMapping(headers, TRANSACTION_FIELDS)
  const parse = (row: (string | number)[]) => transactionRowToDraft(2, pickFields(row, mapping))

  it('despesa no crédito', () => {
    const result = parse([
      '05/11/2026',
      'despesa',
      'variavel',
      'Mercado',
      '234,50',
      'credito',
      'Nubank',
      '',
      'Mercado',
    ])
    expect(result.errors).toEqual([])
    expect(result.draft).toMatchObject({
      kind: 'transaction',
      type: 'expense',
      nature: 'variable',
      status: 'forecast',
      amountCents: 23450,
      date: '2026-11-05',
      paymentMethod: 'credit',
      cardName: 'Nubank',
      categoryName: 'Mercado',
    })
  })

  it('receita fixa paga; valor negativo vira positivo', () => {
    const result = parse([
      '05/11/2026',
      'receita',
      'fixa',
      'Salário',
      '-6.000,00',
      'pix',
      '',
      'pago',
      '',
    ])
    expect(result.draft).toMatchObject({
      type: 'income',
      nature: 'fixed',
      status: 'settled',
      amountCents: 600000,
      paymentMethod: 'pix',
    })
  })

  it('erros por célula', () => {
    const result = parse(['31/02/2026', 'talvez', 'parcela', '', 'abc', 'credito', '', 'x?', ''])
    expect(result.draft).toBeNull()
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Descrição vazia',
        'Valor inválido: "abc"',
        'Data inválida: "31/02/2026"',
        'Tipo desconhecido: "talvez" (use receita ou despesa)',
        'Parcelas entram pelo template de Parcelamentos',
        'Compra no crédito sem cartão',
      ]),
    )
  })

  it('sem tipo → despesa com aviso; linha vazia é pulada', () => {
    const noType = transactionRowToDraft(3, { data: '01/11/2026', descricao: 'Padaria', valor: 12 })
    expect(noType.draft).toMatchObject({ type: 'expense', status: 'settled', amountCents: 1200 })
    expect(noType.warnings).toContain('Sem tipo: importado como despesa')
    expect(transactionRowToDraft(4, { data: '', descricao: '' }).skipped).toBe('Linha vazia')
  })
})

describe('template Parcelamentos (RI-04)', () => {
  it('parcela atual define a 1ª competência e as pagas', () => {
    const result = installmentRowToDraft(
      2,
      {
        data_compra: '10/03/2026',
        descricao: 'Notebook',
        valor_parcela: '567,31',
        qtd_parcelas: '10x',
        parcela_atual: '9/10',
        cartao: 'Nubank',
      },
      '2026-11',
    )
    expect(result.errors).toEqual([])
    expect(result.draft).toMatchObject({
      installmentsCount: 10,
      totalCents: 567310,
      firstCompetenceMonth: '2026-03',
      currentInstallment: 9,
      settledCount: 8,
      paymentMethod: 'credit',
      cardName: 'Nubank',
    })
  })

  it('sem cartão vira boleto; erros', () => {
    const ok = installmentRowToDraft(
      2,
      { data_compra: '01/01/2026', descricao: 'Sofá', valor_total: '1000', qtd_parcelas: 4 },
      '2026-11',
    )
    expect(ok.draft).toMatchObject({
      paymentMethod: 'boleto',
      totalCents: 100000,
      firstCompetenceMonth: null,
    })
    expect(ok.warnings).toContain('Sem cartão: importado como boleto/carnê')
    const bad = installmentRowToDraft(
      3,
      { data_compra: 'x', descricao: '', qtd_parcelas: '0', parcela_atual: '5' },
      '2026-11',
    )
    expect(bad.draft).toBeNull()
    expect(bad.errors.length).toBeGreaterThanOrEqual(3)
    expect(installmentRowToDraft(4, {}, '2026-11').skipped).toBe('Linha vazia')
  })
})

describe('planilha mensal', () => {
  const header = [
    'DESCRIÇÃO DESPESA',
    'VALOR',
    'TIPO',
    'DATA',
    'DATA PAGO',
    'BANCO/QUEM',
    'QTD. PARCELAS',
    'PARCELA',
    'VALOR PAGO',
    'VALOR TOTAL',
    'ANOTAÇÃO',
    99,
  ]
  const grid = [
    ['JANEIRO'],
    ['DESCRIÇÃO ENTRADA', '', '', '', '', '', 'VALOR ENTRADA'],
    ['SALÁRIO', '', '', '', '', '', 4379],
    ['SEGURO CARRO', '', '', '', '', '', 0],
    ['VALOR MÊS ANTERIOR', '', '', '', '', '', 209.26, '', '', '', 'VALOR DUDA ME PAGAR', 75],
    header,
    ['ICLOUD', 5.9, 'FIXO', 46023, 46032, 'NUBANK'],
    ['', '', 'FIXO', 46023, '', 'BANCO/QUEM'],
    ['MENSALIDADE PAI', 300, 'FIXO', 46023, 46032, 'PAI'],
    ['NOTEBOOK', 53, 'PARCELA', 46023, 46032, 'NUBANK', 10, 7, 371, 530],
    ['CORRENTE (QUITEI)', '', 'PARCELA', 46023, 'QUITADO', 'PAI', 12, 8, 1360, 2040],
    ['PRESENTE NATAL', 299.9, 'CRÉDITO', 46011, 46034, 'NUBANK'],
    ['FARMÁCIA', 38.99, 'PIX', 46032, 46032, 'NUBANK'],
    ['SEM VALOR', '', 'FIXO', 46023, '', 'NUBANK'],
    ['AJUSTE', 4.68],
    ['TOTAL GASTOS', 999],
    ['VALOR ECONOMIZAR', 1254.25],
    ['SOBROU', 100],
    ['FEVEREIRO', '', '', '', '', '', '', '', '', '', 'VALOR DUDA'],
    ['DESCRIÇÃO ENTRADA', '', '', '', '', '', 'VALOR ENTRADA'],
    ['SALÁRIO', '', '', '', '', '', 5253.23],
    header,
    ['NOTEBOOK', 53, 'PARCELA', 46023, '', 'NUBANK', 10, 8, 424, 530],
    ['VALOR ECONOMIZAR', 0],
    ['DEZEMBRO'],
    ['DESCRIÇÃO ENTRADA', '', '', '', '', '', 'VALOR ENTRADA'],
    ['SALÁRIO', '', '', '', '', '', 6000],
    ['JANEIRO'],
    ['DESCRIÇÃO ENTRADA', '', '', '', '', '', 'VALOR ENTRADA'],
    ['SALÁRIO', '', '', '', '', '', 6100],
  ]
  const read = readMonthlySheet(grid, 2026)

  it('lê os blocos de mês (e vira o ano depois de dezembro)', () => {
    expect(read.months).toEqual(['2026-01', '2026-02', '2026-12', '2027-01'])
    expect(read.ignored.map((row) => row.skipped)).toEqual(
      expect.arrayContaining(['Entrada sem valor', 'Total da planilha', 'Nada economizado no mês']),
    )
    expect(distinctBanks(read.lines)).toEqual([
      { value: 'NUBANK', count: 6 },
      { value: 'PAI', count: 2 },
    ])
  })

  const drafts = buildMonthlyDrafts(read.lines, {
    banks: { nubank: { kind: 'card', name: 'Nubank' }, pai: { kind: 'payee', name: 'Pai' } },
    currentMonth: '2026-11',
  })
  const byRow = (row: number) => drafts.find((item) => item.rowNumber === row)

  it('entradas: salário fixo, mês anterior como extra; futuras previstas', () => {
    expect(byRow(3)?.draft).toMatchObject({
      type: 'income',
      nature: 'fixed',
      status: 'settled',
      amountCents: 437900,
      competenceMonth: '2026-01',
      date: '2026-01-01',
    })
    expect(byRow(5)?.draft).toMatchObject({ type: 'income', nature: 'extra', amountCents: 20926 })
    expect(byRow(27)?.draft).toMatchObject({ status: 'forecast', competenceMonth: '2026-12' })
  })

  it('despesas: fixa no cartão, pessoa, crédito, pix e sem tipo', () => {
    expect(byRow(7)?.draft).toMatchObject({
      nature: 'fixed',
      paymentMethod: 'credit',
      cardName: 'Nubank',
      status: 'settled',
      date: '2026-01-01',
      competenceMonth: '2026-01',
    })
    expect(byRow(9)?.draft).toMatchObject({
      nature: 'fixed',
      paymentMethod: null,
      payeeName: 'Pai',
    })
    // Compra de dezembro na fatura de janeiro: mantém a data e entra em janeiro.
    expect(byRow(12)?.draft).toMatchObject({
      paymentMethod: 'credit',
      date: '2025-12-20',
      competenceMonth: '2026-01',
    })
    // Pix "no Nubank" (cartão): não vira crédito.
    expect(byRow(13)?.draft).toMatchObject({ paymentMethod: 'pix', cardName: null })
    expect(byRow(14)?.skipped).toBe('Despesa sem valor')
    expect(byRow(15)?.warnings).toContain('Sem tipo: importado como variável')
  })

  it('parcelas de vários meses viram um parcelamento', () => {
    const notebook = byRow(10)
    expect(notebook?.sourceRows).toEqual([10, 23])
    expect(notebook?.draft).toMatchObject({
      kind: 'installmentPlan',
      description: 'NOTEBOOK',
      installmentsCount: 10,
      totalCents: 53000,
      firstCompetenceMonth: '2025-07',
      settledCount: 7,
      payoffMonth: null,
      paymentMethod: 'credit',
      cardName: 'Nubank',
    })
  })

  it('parcelamento quitado antes (linha sem valor): pagas até a anterior e quitação no mês anterior', () => {
    expect(byRow(11)?.draft).toMatchObject({
      description: 'CORRENTE',
      totalCents: 204000,
      firstCompetenceMonth: '2025-06',
      settledCount: 7,
      payoffMonth: '2025-12',
      paymentMethod: 'boleto',
      payeeName: 'Pai',
    })
  })

  it('parcelamento quitado no mês (linha com valor)', () => {
    const lines = readMonthlySheet(
      [['MARÇO'], header, ['TV (QUITEI)', 100, 'PARCELA', 46023, 'QUITADO', 'NUBANK', 10, 4]],
      2026,
    ).lines
    const [tv] = buildMonthlyDrafts(lines, { banks: {}, currentMonth: '2026-11' })
    expect(tv?.draft).toMatchObject({ settledCount: 4, payoffMonth: '2026-03', totalCents: 100000 })
  })

  it('valor economizar vira a meta investida do mês', () => {
    expect(byRow(17)?.draft).toEqual({
      kind: 'monthGoal',
      month: '2026-01',
      goalCents: 125425,
      investedCents: 125425,
    })
  })

  it('crédito sem cartão associado vira "outro"', () => {
    const other = buildMonthlyDrafts(read.lines, { banks: {}, currentMonth: '2026-11' })
    const gift = other.find((item) => item.rowNumber === 12)
    expect(gift?.draft).toMatchObject({ paymentMethod: 'other', cardName: null })
    expect(gift?.warnings[0]).toMatch(/Crédito sem cartão/)
  })

  it('chave de duplicado', () => {
    expect(duplicateKey('2026-01', 590, ' ICLOUD ')).toBe(duplicateKey('2026-01', 590, 'icloud'))
  })
})

describe('planilhas de exemplo (o que o importador espera)', () => {
  it('lançamentos: todas as linhas viram rascunho sem erro', () => {
    const [sheet] = TRANSACTIONS_EXAMPLE.sheets
    const [header = [], ...rows] = sheet?.rows ?? []
    const mapping = suggestMapping(header.map(String), TRANSACTION_FIELDS)
    expect(Object.values(mapping).every((index) => index !== null)).toBe(true)
    const parsed = rows.map((row, i) => transactionRowToDraft(i + 2, pickFields(row, mapping)))
    expect(parsed.every((row) => row.errors.length === 0 && row.draft)).toBe(true)
    expect(parsed.map((row) => row.draft?.kind === 'transaction' && row.draft.type)).toEqual([
      'income',
      'expense',
      'expense',
      'expense',
      'expense',
      'income',
    ])
  })

  it('parcelamentos: todas as linhas viram rascunho sem erro', () => {
    const [sheet] = INSTALLMENTS_EXAMPLE.sheets
    const [header = [], ...rows] = sheet?.rows ?? []
    const mapping = suggestMapping(header.map(String), INSTALLMENT_FIELDS)
    const parsed = rows.map((row, i) =>
      installmentRowToDraft(i + 2, pickFields(row, mapping), '2026-11'),
    )
    expect(parsed.every((row) => row.errors.length === 0 && row.draft)).toBe(true)
  })

  it('planilha mensal: meses, entradas, despesas, parcelamento e metas', () => {
    const [sheet] = MONTHLY_SHEET_EXAMPLE.sheets
    const read = readMonthlySheet(sheet?.rows ?? [], 2026)
    expect(read.months).toEqual(['2026-01', '2026-02'])
    expect(distinctBanks(read.lines).map((bank) => bank.value)).toEqual(['NUBANK', 'PAI', 'AILOS'])
    const drafts = buildMonthlyDrafts(read.lines, {
      banks: {
        nubank: { kind: 'card', name: 'Nubank' },
        pai: { kind: 'payee', name: 'Pai' },
        ailos: { kind: 'account', name: 'Ailos' },
      },
      currentMonth: '2026-11',
    })
    expect(drafts.every((row) => row.errors.length === 0)).toBe(true)
    const kinds = drafts.map((row) => row.draft?.kind)
    expect(kinds.filter((kind) => kind === 'transaction')).toHaveLength(14)
    expect(kinds.filter((kind) => kind === 'installmentPlan')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === 'monthGoal')).toHaveLength(2)
    expect(drafts.find((row) => row.draft?.kind === 'installmentPlan')?.draft).toMatchObject({
      description: 'NOTEBOOK',
      firstCompetenceMonth: '2026-01',
      settledCount: 2,
    })
  })
})
