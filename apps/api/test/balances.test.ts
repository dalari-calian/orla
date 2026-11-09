/**
 * Fase 7 — balanço mensal e rentabilidade real (docs/07).
 */
import {
  balanceFormResponseSchema,
  balanceSchema,
  balancesResponseSchema,
  observedPricesResponseSchema,
  portfolioResponseSchema,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

let now = new Date('2026-11-20T15:00:00Z')
const app = makeApp({ now: () => now })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent
let classes: Record<string, string>
let rico: string
let itsa: string
let cdb: string

beforeEach(async () => {
  await resetDatabase()
  now = new Date('2026-11-20T15:00:00Z')
  agent = (await signUp(app, 'balanceador')).agent
  const list = (await agent.get('/api/v1/asset-classes')).body.data as {
    id: string
    kind: string
  }[]
  classes = Object.fromEntries(list.map((item) => [item.kind, item.id]))
  rico = (
    await agent.post('/api/v1/accounts').send({ name: 'Rico', kind: 'brokerage', color: '#007AFF' })
  ).body.id
  itsa = (
    await agent
      .post('/api/v1/assets')
      .send({ assetClassId: classes.stock, ticker: 'ITSA4', accountId: rico, manualPrice: '14' })
  ).body.id
  cdb = (
    await agent
      .post('/api/v1/assets')
      .send({ assetClassId: classes.fixed_income, name: 'CDB Rico', accountId: rico })
  ).body.id
  await agent.post('/api/v1/asset-trades').send({
    assetId: itsa,
    kind: 'buy',
    tradeDate: '2026-09-01',
    quantity: '100',
    unitPrice: '10',
  })
  await agent.post('/api/v1/asset-trades').send({
    assetId: cdb,
    kind: 'fixed_income_deposit',
    tradeDate: '2026-09-01',
    quantity: '1',
    unitPrice: '5000',
    totalCents: 500000,
  })
})

const form = async (month: string, date?: string) =>
  balanceFormResponseSchema.parse(
    (await agent.get(`/api/v1/balances/form?month=${month}${date ? `&date=${date}` : ''}`)).body,
  )

async function saveBalance(
  month: string,
  date: string,
  values: { itsaPrice: string; itsaQty?: string; cdbCents: number; cashCents?: number },
) {
  const res = await agent.post('/api/v1/balances').send({
    competenceMonth: month,
    referenceDate: date,
    items: [
      {
        kind: 'asset',
        assetId: itsa,
        quantity: values.itsaQty ?? '100',
        price: values.itsaPrice,
        valueCents: 0,
      },
      { kind: 'asset', assetId: cdb, valueCents: values.cdbCents },
      ...(values.cashCents !== undefined
        ? [{ kind: 'cash', accountId: rico, valueCents: values.cashCents }]
        : []),
    ],
  })
  expect(res.status).toBe(201)
  return balanceSchema.parse(res.body)
}

describe('formulário pré-preenchido (RB-02)', () => {
  it('bolsa com qtd × preço, renda fixa a preencher, saldo em conta por corretora', async () => {
    const first = await form('2026-09', '2026-09-30')
    expect(first.balance).toBeNull()
    expect(first.previous).toBeNull()
    const byLabel = new Map(first.rows.map((row) => [row.label, row]))
    expect(byLabel.get('ITSA4')).toMatchObject({
      quantity: '100',
      price: '14',
      valueCents: 140000,
      manualValue: false,
    })
    expect(byLabel.get('CDB Rico')).toMatchObject({ manualValue: true, valueCents: null })
    expect(byLabel.get('Saldo em conta · Rico')).toMatchObject({ kind: 'cash', valueCents: null })
    // Antes da compra, o ativo não aparece.
    expect(
      (await form('2026-08', '2026-08-20')).rows.filter((row) => row.kind === 'asset'),
    ).toEqual([])
    // Mês atual sem data: hoje.
    expect((await form('2026-11')).referenceDate).toBe('2026-11-20')
  })
})

describe('balanços e rentabilidade real', () => {
  it('série, fechar (congela e atualiza saldos), reabrir e recalcular, duplicado', async () => {
    const sep = await saveBalance('2026-09', '2026-09-30', {
      itsaPrice: '10',
      cdbCents: 500000,
      cashCents: 0,
    })
    expect(sep).toMatchObject({ totalCents: 600000, status: 'draft' })
    expect(sep.items.map((item) => item.label)).toEqual([
      'ITSA4',
      'CDB Rico',
      'Saldo em conta · Rico',
    ])
    // Um balanço por mês.
    const dup = await agent.post('/api/v1/balances').send({
      competenceMonth: '2026-09',
      referenceDate: '2026-09-29',
      items: [],
    })
    expect(dup.status).toBe(409)

    // Aporte de 1.200 em outubro; balanço de outubro com 11.350 → ganho 150 e 1,5% (sobre 6.000 → 2,5%).
    await agent.post('/api/v1/contributions').send({ date: '2026-10-15', amountCents: 120000 })
    const oct = await saveBalance('2026-10', '2026-10-31', {
      itsaPrice: '11',
      cdbCents: 615000,
      cashCents: 3500,
    })
    expect(oct.totalCents).toBe(110000 + 615000 + 3500)

    const octForm = await form('2026-10')
    expect(octForm.previous?.id).toBe(sep.id)
    expect(octForm.contributionsCents).toBe(120000)
    expect(octForm.rows.find((row) => row.label === 'CDB Rico')).toMatchObject({
      valueCents: 615000,
      previousValueCents: 500000,
    })

    let series = balancesResponseSchema.parse((await agent.get('/api/v1/balances')).body)
    expect(series.data.map((row) => row.gainCents)).toEqual([null, 728500 - 600000 - 120000])
    expect(series.data[1]?.rate).toBeCloseTo(8500 / 600000)
    expect(series.years[0]).toMatchObject({ year: '2026', months: 1, gainCents: 8500 })
    expect(series).toMatchObject({ currentMonth: '2026-11', currentMonthDone: false })

    // Fechar outubro: congela aporte e atualiza o saldo do CDB (renda fixa manual).
    const closed = await agent.post(`/api/v1/balances/${oct.id}/close`)
    expect(closed.body).toMatchObject({
      status: 'closed',
      contributionsCents: 120000,
      dividendsCents: 0,
    })
    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    expect(portfolio.positions.find((item) => item.asset.id === cdb)).toMatchObject({
      valueCents: 615000,
      priceSource: 'manual_value',
    })
    // Fechado não edita; aporte lançado depois não muda o congelado, mas avisa (RB-12).
    expect(
      (
        await agent
          .put(`/api/v1/balances/${oct.id}`)
          .send({ competenceMonth: '2026-10', referenceDate: '2026-10-31', items: [] })
      ).status,
    ).toBe(409)
    await agent.post('/api/v1/contributions').send({ date: '2026-10-20', amountCents: 1000 })
    series = balancesResponseSchema.parse((await agent.get('/api/v1/balances')).body)
    expect(series.data[1]).toMatchObject({ contributionsCents: 120000, contributionsChanged: true })

    // Reabrir setembro e editar recalcula outubro.
    await agent.post(`/api/v1/balances/${sep.id}/close`)
    expect((await agent.post(`/api/v1/balances/${sep.id}/reopen`)).body.status).toBe('draft')
    const edited = await agent.put(`/api/v1/balances/${sep.id}`).send({
      competenceMonth: '2026-09',
      referenceDate: '2026-09-30',
      items: [{ kind: 'asset', assetId: cdb, valueCents: 650000 }],
    })
    expect(edited.status).toBe(200)
    series = balancesResponseSchema.parse((await agent.get('/api/v1/balances')).body)
    expect(series.data[1]?.gainCents).toBe(728500 - 650000 - 120000)

    // Timing "start" muda a taxa, não o ganho.
    await agent.patch('/api/v1/me/settings').send({ contributionTiming: 'start' })
    series = balancesResponseSchema.parse((await agent.get('/api/v1/balances')).body)
    expect(series.settings.contributionTiming).toBe('start')
    expect(series.data[1]?.rate).toBeCloseTo(-41500 / (650000 + 120000))

    // Excluir e isolamento.
    const other = (await signUp(app, 'curioso')).agent
    expect((await other.get(`/api/v1/balances/${sep.id}`)).status).toBe(404)
    expect((await other.get('/api/v1/balances')).body.data).toEqual([])
    expect((await agent.delete(`/api/v1/balances/${sep.id}`)).status).toBe(204)
    expect(
      balancesResponseSchema.parse((await agent.get('/api/v1/balances')).body).data,
    ).toHaveLength(1)
  })

  it('validações: ativo de outro usuário, linha repetida', async () => {
    const other = (await signUp(app, 'intruso')).agent
    expect(
      (
        await other.post('/api/v1/balances').send({
          competenceMonth: '2026-10',
          referenceDate: '2026-10-31',
          items: [{ kind: 'asset', assetId: itsa, valueCents: 1 }],
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await agent.post('/api/v1/balances').send({
          competenceMonth: '2026-10',
          referenceDate: '2026-10-31',
          items: [
            { kind: 'asset', assetId: cdb, valueCents: 1 },
            { kind: 'asset', assetId: cdb, valueCents: 2 },
          ],
        })
      ).status,
    ).toBe(400)
  })
})

describe('preços observados (RB-30)', () => {
  it('máximo, mínimo, último e preço de hoje com o PM', async () => {
    await saveBalance('2026-09', '2026-09-30', { itsaPrice: '10', cdbCents: 500000 })
    await saveBalance('2026-10', '2026-10-31', { itsaPrice: '12.5', cdbCents: 510000 })
    const body = observedPricesResponseSchema.parse(
      (await agent.get('/api/v1/observed-prices')).body,
    )
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      assetId: itsa,
      ticker: 'ITSA4',
      count: 2,
      max: { price: '12.5', date: '2026-10-31' },
      min: { price: '10', date: '2026-09-30' },
      currentPrice: '14',
      avgPrice: '10',
    })
    expect(body.data[0]?.aboveMin).toBeCloseTo(0.4)
  })
})

describe('backup com o balanço (RE-02)', () => {
  it('leva balanços com as linhas e restaura', async () => {
    const sep = await saveBalance('2026-09', '2026-09-30', {
      itsaPrice: '10',
      cdbCents: 500000,
      cashCents: 1000,
    })
    await agent.post(`/api/v1/balances/${sep.id}/close`)
    const backup = (await agent.get('/api/v1/backup')).body
    expect(backup.data.balances).toHaveLength(1)
    expect(backup.data.balanceItems).toHaveLength(3)
    await agent.delete(`/api/v1/balances/${sep.id}`)
    expect((await agent.post('/api/v1/restore').send({ mode: 'replace', backup })).status).toBe(200)
    const restored = balanceSchema.parse((await agent.get(`/api/v1/balances/${sep.id}`)).body)
    expect(restored).toMatchObject({ status: 'closed', totalCents: 601000 })
    expect(restored.items).toHaveLength(3)
  })
})
