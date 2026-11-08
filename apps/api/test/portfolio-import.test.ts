/**
 * Fase 5 — importação da carteira (templates e planilha), contra o Postgres real.
 */
import {
  buildPortfolioDrafts,
  PORTFOLIO_SHEET_EXAMPLE,
  readPortfolioSheet,
  tradeRowToDraft,
} from '@orla/core'
import { importJobSchema, portfolioResponseSchema, type ImportRowsRequest } from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ now: () => new Date('2026-11-20T15:00:00Z') })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'investidor')).agent
})

type Rows = ImportRowsRequest['rows']

async function importRows(kind: string, rows: Rows, commit: Record<string, unknown> = {}) {
  const job = (await agent.post('/api/v1/imports').send({ kind, fileName: 'carteira.xlsx' })).body
  const checked = await agent.post(`/api/v1/imports/${job.id}/rows`).send({ rows })
  expect(checked.status).toBe(200)
  const committed = await agent.post(`/api/v1/imports/${job.id}/commit`).send(commit)
  return {
    id: job.id as string,
    checks: checked.body.rows as {
      rowNumber: number
      status: string
      messages: string[]
      creates: string[]
    }[],
    committed,
  }
}

function sheetRows(initialPrices: Record<string, string> = {}): Rows {
  const read = readPortfolioSheet(PORTFOLIO_SHEET_EXAMPLE.sheets[0]?.rows ?? [], 2026)
  return buildPortfolioDrafts(read, {
    fixedIncomeNames: {
      'tesouro selic 2031': 'Tesouro Selic 2031',
      'caixinha nubank': 'Caixinha Nubank',
    },
    accountName: 'Rico',
    initialPrices,
    initialValues: {},
  })
    .filter((row) => row.draft)
    .map((row) => ({
      rowNumber: row.rowNumber,
      sourceRows: row.sourceRows,
      raw: row.raw,
      draft: row.draft as Rows[number]['draft'],
    }))
}

describe('planilha da carteira', () => {
  it('importa metas, ativos, posição inicial, aportes e proventos; desfaz', async () => {
    const { id, checks, committed } = await importRows(
      'portfolio_sheet',
      sheetRows({ MXRF11: '9.50' }),
    )
    expect(checks.every((check) => check.status !== 'error')).toBe(true)
    expect(checks.flatMap((check) => check.creates)).toEqual(
      expect.arrayContaining(['Ativo: MXRF11', 'Ativo: Tesouro Selic 2031', 'Conta: Rico']),
    )
    expect(committed.status).toBe(200)
    const job = importJobSchema.parse(committed.body)
    expect(job.stats).toMatchObject({ trades: 10, dividends: 4, assets: 6 })
    expect(job.stats.created).toEqual(
      expect.arrayContaining(['Conta: Rico', 'Ativo: MXRF11', 'Ativo: Caixinha Nubank']),
    )

    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    const byLabel = new Map(
      portfolio.positions.map((item) => [item.asset.ticker ?? item.asset.name, item]),
    )
    // MXRF11: 44 iniciais (PM informado 9,50) + 10 a 9,73 → 54 cotas; preço do último balanço.
    expect(byLabel.get('MXRF11')).toMatchObject({
      quantity: '54',
      costCents: 41800 + 9730,
      price: '9.82',
      priceSource: 'manual_price',
    })
    expect(byLabel.get('ITSA4')).toMatchObject({ quantity: '27' })
    expect(byLabel.get('Tesouro Selic 2031')).toMatchObject({
      costCents: 237718 + 37067,
      valueCents: 279192,
      priceSource: 'manual_value',
    })
    expect(byLabel.get('Caixinha Nubank')?.asset.quoteMode).toBe('manual')
    expect(portfolio.targetsTotalPct).toBe('100')
    expect(byLabel.get('MXRF11')?.dividends12mCents).toBe(880)

    // Reimportar: operações e proventos viram duplicados.
    const again = await agent
      .post('/api/v1/imports')
      .send({ kind: 'portfolio_sheet', fileName: 'carteira.xlsx' })
    const recheck = (
      await agent
        .post(`/api/v1/imports/${again.body.id}/rows`)
        .send({ rows: sheetRows({ MXRF11: '9.50' }) })
    ).body.rows as { status: string }[]
    expect(recheck.filter((row) => row.status === 'duplicate').length).toBeGreaterThanOrEqual(13)

    // Desfazer: operações, proventos, ativos criados e metas saem.
    expect((await agent.post(`/api/v1/imports/${id}/undo`)).status).toBe(200)
    const after = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    expect(after.positions).toEqual([])
    expect(after.classes.every((item) => item.target === null)).toBe(true)
  })

  it('venda maior que a posição desfaz o commit inteiro (RI-05)', async () => {
    const values = [
      { data: '01/02/2026', ticker_ou_nome: 'ITSA4', tipo: 'compra', quantidade: '2', preco: '10' },
      { data: '01/03/2026', ticker_ou_nome: 'ITSA4', tipo: 'venda', quantidade: '5', preco: '12' },
    ]
    const rows: Rows = values.map((value, index) => {
      const parsed = tradeRowToDraft(index + 2, value)
      const draft = parsed.draft as Rows[number]['draft']
      return {
        rowNumber: index + 2,
        draft: {
          ...draft,
          asset: { ...(draft as { asset: object }).asset, classKind: 'stock' },
        } as Rows[number]['draft'],
      }
    })
    const { committed } = await importRows('trades', rows)
    expect(committed.status).toBe(400)
    expect(committed.body.error.message).toMatch(/ITSA4.*maior que a posição.*Nada foi importado/)
    expect((await agent.get('/api/v1/assets')).body.data).toEqual([])
  })
})
