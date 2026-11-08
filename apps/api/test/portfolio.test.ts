/**
 * Fase 5 — carteira contra o Postgres real, com um provedor de cotações falso que conta as
 * chamadas (o cache tem que evitar chamadas repetidas). Relógio controlável.
 */
import {
  assetDetailResponseSchema,
  dividendsSummaryResponseSchema,
  portfolioResponseSchema,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import type { QuoteProvider } from '../src/services/quotes.ts'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

class FakeProvider implements QuoteProvider {
  readonly name = 'fake'
  readonly enabled = true
  calls: string[] = []
  listCalls = 0
  prices: Record<string, string> = { ITSA4: '14.00', MXRF11: '10.00', HFOF11: '7.00' }
  async fetchQuote(ticker: string) {
    this.calls.push(ticker)
    const price = this.prices[ticker]
    if (!price) throw new Error('Ticker sem cotação')
    return { ticker, price, changePct: 1, name: `Nome ${ticker}`, quotedAt: null }
  }
  async listTickers() {
    this.listCalls += 1
    return Object.keys(this.prices).map((ticker) => ({ ticker, name: `Nome ${ticker}` }))
  }
}

let now = new Date('2026-11-18T15:00:00Z') // quarta, 12h em São Paulo (pregão aberto)
let provider: FakeProvider
let app: ReturnType<typeof makeApp>
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent
let classes: Record<string, string>
let brokerId: string

/** Espera as atualizações em segundo plano terminarem. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

beforeEach(async () => {
  await resetDatabase()
  now = new Date('2026-11-18T15:00:00Z')
  provider = new FakeProvider()
  app = makeApp({
    now: () => now,
    quoteProvider: provider,
    quotesMonthlyBudget: 50,
    cronSecret: 'segredo-do-cron-123',
  })
  agent = (await signUp(app, 'investidor')).agent
  const list = (await agent.get('/api/v1/asset-classes')).body.data as {
    id: string
    kind: string
  }[]
  classes = Object.fromEntries(list.map((item) => [item.kind, item.id]))
  brokerId = (
    await agent.post('/api/v1/accounts').send({ name: 'XP', kind: 'brokerage', color: '#007AFF' })
  ).body.id
})

async function createAsset(body: Record<string, unknown>) {
  const res = await agent.post('/api/v1/assets').send(body)
  expect(res.status).toBe(201)
  return res.body.id as string
}

describe('classes e metas (RC-01)', () => {
  it('classes padrão no cadastro; metas em lote com soma', async () => {
    const list = (await agent.get('/api/v1/asset-classes')).body.data
    expect(list.map((item: { name: string }) => item.name)).toEqual([
      'Renda Fixa / Reserva',
      'FIIs',
      'Ações',
      'Exterior',
      'Cripto',
    ])
    const put = await agent.put('/api/v1/target-allocations').send({
      items: [
        { assetClassId: classes.fixed_income, targetPct: '45' },
        { assetClassId: classes.reit, targetPct: 30, maxPct: '40' },
        { assetClassId: classes.stock, targetPct: '25' },
      ],
    })
    expect(put.status).toBe(200)
    const reit = put.body.data.find((item: { kind: string }) => item.kind === 'reit')
    expect(reit).toMatchObject({ targetPct: '30', maxPct: '40' })
    expect(
      (
        await agent
          .put('/api/v1/target-allocations')
          .send({ items: [{ assetClassId: classes.stock, targetPct: '120' }] })
      ).status,
    ).toBe(400)
    const created = await agent
      .post('/api/v1/asset-classes')
      .send({ name: 'Previdência', kind: 'other', color: '#8E8E93' })
    expect(created.status).toBe(201)
    expect(
      (
        await agent
          .post('/api/v1/asset-classes')
          .send({ name: 'previdência', kind: 'other', color: '#8E8E93' })
      ).status,
    ).toBe(409)
  })
})

describe('ativos, operações e posição (RC-10..22, §4)', () => {
  it('compra, venda, posição, cotação em cache e validação de venda', async () => {
    const itsa = await createAsset({
      assetClassId: classes.stock,
      ticker: 'itsa4',
      accountId: brokerId,
    })
    // Ticker inexistente na lista do provedor (em cache) → 400.
    expect(
      (await agent.post('/api/v1/assets').send({ assetClassId: classes.stock, ticker: 'XXXX3' }))
        .status,
    ).toBe(400)
    // Mesmo ticker na mesma corretora → 409; em outra corretora pode.
    expect(
      (
        await agent
          .post('/api/v1/assets')
          .send({ assetClassId: classes.stock, ticker: 'ITSA4', accountId: brokerId })
      ).status,
    ).toBe(409)

    await agent
      .post('/api/v1/asset-trades')
      .send({ assetId: itsa, kind: 'buy', tradeDate: '2026-01-01', quantity: 4, unitPrice: '7.00' })
    await agent.post('/api/v1/asset-trades').send({
      assetId: itsa,
      kind: 'buy',
      tradeDate: '2026-02-01',
      quantity: '6',
      unitPrice: '12,00',
      feesCents: 100,
    })
    const sold = await agent
      .post('/api/v1/asset-trades')
      .send({ assetId: itsa, kind: 'sell', tradeDate: '2026-03-01', quantity: 5, unitPrice: '15' })
    expect(sold.status).toBe(201)
    const tooMuch = await agent
      .post('/api/v1/asset-trades')
      .send({ assetId: itsa, kind: 'sell', tradeDate: '2026-03-02', quantity: 6, unitPrice: '15' })
    expect(tooMuch.status).toBe(400)
    expect(tooMuch.body.error.message).toMatch(/maior que a posição/)
    // Apagar a compra deixaria a venda maior que a posição → 400.
    const feb = (await agent.get(`/api/v1/asset-trades?assetId=${itsa}`)).body.data[1]
    expect((await agent.delete(`/api/v1/asset-trades/${feb.id}`)).status).toBe(400)

    await settle()
    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    const position = portfolio.positions[0]
    // custo = 28 + 73 = 101 → PM 10,10; vendeu 5 → 5 × 10,10 = 50,50
    expect(position).toMatchObject({
      quantity: '5',
      costCents: 5050,
      priceSource: 'quote',
      price: '14',
      valueCents: 7000,
      resultCents: 1950,
    })
    expect(position?.avgPrice.startsWith('10.1')).toBe(true)
    expect(position?.realizedPnlCents).toBe(2450)
    expect(portfolio.quotes).toMatchObject({ provider: 'fake', enabled: true })

    const detail = assetDetailResponseSchema.parse((await agent.get(`/api/v1/assets/${itsa}`)).body)
    expect(detail.trades.map((trade) => trade.kind)).toEqual(['sell', 'buy', 'buy'])
    expect(detail.quote?.price).toBe('14')
    expect(detail.position.asset.name).toBe('Nome ITSA4')
  })

  it('cache: a mesma cotação não é buscada de novo dentro da validade nem fora do pregão', async () => {
    await createAsset({ assetClassId: classes.stock, ticker: 'ITSA4' })
    await createAsset({ assetClassId: classes.reit, ticker: 'MXRF11' })
    await settle()
    expect(provider.calls.sort()).toEqual(['ITSA4', 'MXRF11'])
    expect(provider.listCalls).toBe(1)

    // Abrir a carteira várias vezes dentro de 30 min: nenhuma chamada nova.
    for (let i = 0; i < 3; i++) await agent.get('/api/v1/portfolio')
    await agent.post('/api/v1/quotes/refresh')
    await settle()
    expect(provider.calls).toHaveLength(2)

    // 40 min depois, ainda no pregão: atualiza (uma vez por ticker, mesmo com pedidos juntos).
    now = new Date('2026-11-18T15:40:00Z')
    await Promise.all([agent.get('/api/v1/portfolio'), agent.get('/api/v1/portfolio')])
    await settle()
    expect(provider.calls).toHaveLength(4)

    // Depois do fechamento: uma busca (o fechamento); o resto da noite, nada.
    now = new Date('2026-11-18T22:00:00Z')
    await agent.get('/api/v1/portfolio')
    await settle()
    expect(provider.calls).toHaveLength(6)
    now = new Date('2026-11-19T02:30:00Z')
    await agent.get('/api/v1/portfolio')
    await agent.post('/api/v1/quotes/refresh')
    await settle()
    expect(provider.calls).toHaveLength(6)
    // Sábado: só o fechamento de sexta, uma vez; domingo, nada.
    now = new Date('2026-11-21T15:00:00Z')
    await agent.get('/api/v1/portfolio')
    await settle()
    expect(provider.calls).toHaveLength(8)
    now = new Date('2026-11-22T15:00:00Z')
    await agent.post('/api/v1/quotes/refresh')
    await settle()
    expect(provider.calls).toHaveLength(8)

    // A lista de tickers (autocomplete) vem do cache de 7 dias.
    await agent.get('/api/v1/tickers/search?q=mx')
    expect(provider.listCalls).toBe(1)
    const search = await agent.get('/api/v1/tickers/search?q=mx')
    expect(search.body.results).toEqual([{ ticker: 'MXRF11', name: 'Nome MXRF11' }])
  })

  it('orçamento mensal para as chamadas; falha guarda o último preço e espera', async () => {
    const small = new FakeProvider()
    app = makeApp({ now: () => now, quoteProvider: small, quotesMonthlyBudget: 2 })
    agent = (await signUp(app, 'econ')).agent
    const stock = (await agent.get('/api/v1/asset-classes')).body.data.find(
      (item: { kind: string }) => item.kind === 'stock',
    ).id
    // Sem lista (orçamento usado nela), o ticker é aceito pelo formato.
    for (const ticker of ['ITSA4', 'MXRF11', 'HFOF11']) {
      await agent.post('/api/v1/assets').send({ assetClassId: stock, ticker })
    }
    await settle()
    await agent.post('/api/v1/quotes/refresh')
    expect(small.calls.length + small.listCalls).toBe(2)
    const portfolio = (await agent.get('/api/v1/portfolio')).body
    expect(portfolio.quotes.budgetLeft).toBe(0)

    // Ticker que falha: marca o erro e não tenta de novo por 6 h.
    const failing = new FakeProvider()
    failing.prices = {}
    app = makeApp({ now: () => now, quoteProvider: failing, quotesMonthlyBudget: 100 })
    agent = (await signUp(app, 'falha')).agent
    const cls = (await agent.get('/api/v1/asset-classes')).body.data.find(
      (item: { kind: string }) => item.kind === 'stock',
    ).id
    await agent.post('/api/v1/assets').send({ assetClassId: cls, ticker: 'HFOF11' })
    await settle()
    now = new Date('2026-11-18T16:00:00Z')
    await agent.post('/api/v1/quotes/refresh')
    expect(failing.calls.filter((ticker) => ticker === 'HFOF11')).toHaveLength(1)
  })

  it('renda fixa com saldo manual, preço manual, peso e alertas', async () => {
    await agent.put('/api/v1/target-allocations').send({
      items: [
        { assetClassId: classes.fixed_income, targetPct: '45' },
        { assetClassId: classes.reit, targetPct: '55' },
      ],
    })
    const tesouro = await createAsset({
      assetClassId: classes.fixed_income,
      name: 'Tesouro Selic 2031',
      fixedIncomeInfo: { indexer: 'SELIC', maturity: '2031-03-01' },
    })
    await agent.post('/api/v1/asset-trades').send({
      assetId: tesouro,
      kind: 'fixed_income_deposit',
      tradeDate: '2026-02-10',
      quantity: 1,
      unitPrice: '2000',
      totalCents: 200000,
    })
    await agent.patch(`/api/v1/assets/${tesouro}`).send({ manualValueCents: 210000 })
    const mxrf = await createAsset({
      assetClassId: classes.reit,
      ticker: 'MXRF11',
      maxWeightPct: '20',
    })
    await agent.post('/api/v1/asset-trades').send({
      assetId: mxrf,
      kind: 'buy',
      tradeDate: '2026-03-18',
      quantity: 10,
      unitPrice: '9.73',
    })
    // Preço à mão mais novo que a cotação vale (RC-33).
    await settle()
    await agent.patch(`/api/v1/assets/${mxrf}`).send({ manualPrice: '11' })

    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    const fixed = portfolio.positions.find((item) => item.asset.id === tesouro)
    const reit = portfolio.positions.find((item) => item.asset.id === mxrf)
    expect(fixed).toMatchObject({
      priceSource: 'manual_value',
      valueCents: 210000,
      resultCents: 10000,
    })
    expect(fixed?.asset.quoteMode).toBe('manual')
    expect(reit).toMatchObject({ priceSource: 'manual_price', valueCents: 11000 })
    expect(portfolio.totals.valueCents).toBe(221000)
    expect(fixed?.weightInPortfolio).toBeCloseTo(210000 / 221000)
    const fi = portfolio.classes.find((item) => item.assetClass.kind === 'fixed_income')
    expect(fi).toMatchObject({ target: 0.45, offTarget: true })
    expect(portfolio.targetsTotalPct).toBe('100')
    expect(portfolio.alerts.map((alert) => alert.kind)).toEqual(
      expect.arrayContaining(['off_target']),
    )
  })
})

describe('ajuste de posição informado à mão', () => {
  it('cadastro já com preço atual (bolsa) e saldo atual (renda fixa)', async () => {
    const itsa = await createAsset({
      assetClassId: classes.stock,
      ticker: 'ITSA4',
      manualPrice: '36,10',
    })
    await agent.post('/api/v1/asset-trades').send({
      assetId: itsa,
      kind: 'position_set',
      tradeDate: '2026-11-01',
      quantity: '10',
      unitPrice: '30',
    })
    expect((await agent.get(`/api/v1/assets/${itsa}`)).body.position).toMatchObject({
      price: '36.1',
      priceSource: 'manual_price',
      valueCents: 36100,
      resultCents: 6100,
    })
    const cdb = await createAsset({
      assetClassId: classes.fixed_income,
      name: 'CDB Nubank',
      manualValueCents: 105000,
    })
    expect((await agent.get(`/api/v1/assets/${cdb}`)).body.position).toMatchObject({
      valueCents: 105000,
      priceSource: 'manual_value',
    })
  })

  it('fixa quantidade e PM sem apagar o histórico; venda depois respeita o ajuste', async () => {
    const itsa = await createAsset({ assetClassId: classes.stock, ticker: 'ITSA4' })
    await agent.post('/api/v1/asset-trades').send({
      assetId: itsa,
      kind: 'buy',
      tradeDate: '2026-01-05',
      quantity: '10',
      unitPrice: '10',
    })
    const set = await agent.post('/api/v1/asset-trades').send({
      assetId: itsa,
      kind: 'position_set',
      tradeDate: '2026-02-01',
      quantity: '27',
      unitPrice: '9.12',
    })
    expect(set.status).toBe(201)
    expect(set.body).toMatchObject({ kind: 'position_set', totalCents: 24624 })

    const detail = (await agent.get(`/api/v1/assets/${itsa}`)).body
    expect(detail.position).toMatchObject({ quantity: '27', avgPrice: '9.12', costCents: 24624 })
    expect(detail.trades).toHaveLength(2)

    // Vender mais do que o ajuste deixou → 400.
    const sell = await agent.post('/api/v1/asset-trades').send({
      assetId: itsa,
      kind: 'sell',
      tradeDate: '2026-03-01',
      quantity: '30',
      unitPrice: '10',
    })
    expect(sell.status).toBe(400)

    // Editar o ajuste (ex.: corrigir o PM) recalcula.
    await agent.patch(`/api/v1/asset-trades/${set.body.id}`).send({ unitPrice: '8' })
    expect((await agent.get(`/api/v1/assets/${itsa}`)).body.position).toMatchObject({
      quantity: '27',
      costCents: 21600,
    })
  })
})

describe('proventos (RC-40..43)', () => {
  it('lançamento, lote do mês, resumo 12 meses e yield on cost', async () => {
    const mxrf = await createAsset({ assetClassId: classes.reit, ticker: 'MXRF11' })
    const hfof = await createAsset({ assetClassId: classes.reit, ticker: 'HFOF11' })
    await agent
      .post('/api/v1/asset-trades')
      .send({ assetId: mxrf, kind: 'buy', tradeDate: '2025-01-10', quantity: 100, unitPrice: '10' })
    expect(
      (
        await agent
          .post('/api/v1/dividends')
          .send({ assetId: mxrf, payDate: '2025-05-27', amountCents: 800, kind: 'income' })
      ).status,
    ).toBe(201)
    const batch = await agent.post('/api/v1/dividends/batch').send({
      payDate: '2026-11-14',
      items: [
        { assetId: mxrf, amountCents: 1000, kind: 'income' },
        { assetId: hfof, amountCents: 380, kind: 'income' },
      ],
    })
    expect(batch.status).toBe(201)
    expect(batch.body.data).toHaveLength(2)
    expect(
      (await agent.post('/api/v1/dividends/batch').send({ payDate: '2026-11-14', items: [] }))
        .status,
    ).toBe(400)

    const summary = dividendsSummaryResponseSchema.parse(
      (await agent.get('/api/v1/dividends/summary')).body,
    )
    expect(summary.months).toHaveLength(12)
    expect(summary.months.at(-1)).toMatchObject({ month: '2026-11', amountCents: 1380 })
    expect(summary.yearTotalCents).toBe(1380)
    expect(summary.topPayer).toEqual({ assetId: mxrf, amountCents: 1000 })

    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    const position = portfolio.positions.find((item) => item.asset.id === mxrf)
    expect(position?.dividends12mCents).toBe(1000)
    expect(position?.yieldOnCost).toBeCloseTo(0.01)
    expect((await agent.get(`/api/v1/dividends?assetId=${mxrf}`)).body.data).toHaveLength(2)
  })
})

describe('cron e isolamento', () => {
  it('/jobs/quotes exige o segredo e respeita o cache', async () => {
    await createAsset({ assetClassId: classes.stock, ticker: 'ITSA4' })
    await settle()
    expect((await agent.get('/api/v1/jobs/quotes')).status).toBe(401)
    const job = await agent
      .get('/api/v1/jobs/quotes')
      .set('Authorization', 'Bearer segredo-do-cron-123')
    expect(job.status).toBe(200)
    expect(job.body).toMatchObject({ tickers: 1, refreshed: 0, pending: 0 })
  })

  it('dados de outro usuário são invisíveis', async () => {
    const asset = await createAsset({ assetClassId: classes.stock, ticker: 'ITSA4' })
    const other = (await signUp(app, 'outra')).agent
    expect((await other.get(`/api/v1/assets/${asset}`)).status).toBe(404)
    expect(
      (
        await other
          .post('/api/v1/asset-trades')
          .send({ assetId: asset, kind: 'buy', tradeDate: '2026-01-01', quantity: 1, unitPrice: 1 })
      ).status,
    ).toBe(404)
    expect((await other.get('/api/v1/portfolio')).body.positions).toEqual([])
    const otherClass = (await other.get('/api/v1/asset-classes')).body.data[0].id
    expect(
      (await agent.post('/api/v1/assets').send({ assetClassId: otherClass, name: 'X' })).status,
    ).toBe(404)
  })
})

describe('backup com a carteira (RE-02)', () => {
  it('leva classes, metas, ativos, operações e proventos; restaura na mesma conta', async () => {
    await agent
      .put('/api/v1/target-allocations')
      .send({ items: [{ assetClassId: classes.reit, targetPct: '100' }] })
    const mxrf = await createAsset({
      assetClassId: classes.reit,
      ticker: 'MXRF11',
      accountId: brokerId,
    })
    await agent.post('/api/v1/asset-trades').send({
      assetId: mxrf,
      kind: 'buy',
      tradeDate: '2026-03-18',
      quantity: '10.5',
      unitPrice: '9.73',
    })
    await agent
      .post('/api/v1/dividends')
      .send({ assetId: mxrf, payDate: '2026-05-27', amountCents: 800 })
    const backup = (await agent.get('/api/v1/backup')).body
    expect(backup.data.assetClasses).toHaveLength(5)
    expect(backup.data.assets[0]).toMatchObject({ ticker: 'MXRF11', quoteMode: 'auto' })
    expect(backup.data.assetTrades[0]).toMatchObject({ quantity: '10.5', unitPrice: '9.73' })
    expect(backup.data.dividends).toHaveLength(1)
    expect(backup.data.targetAllocations).toHaveLength(1)

    // Apaga o ativo (e o que é dele) e restaura substituindo: volta tudo.
    await agent.delete(`/api/v1/assets/${mxrf}`)
    const restored = await agent.post('/api/v1/restore').send({ mode: 'replace', backup })
    expect(restored.status).toBe(200)
    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    expect(portfolio.positions).toHaveLength(1)
    expect(portfolio.positions[0]).toMatchObject({ quantity: '10.5', dividends12mCents: 800 })
    expect(portfolio.classes.find((item) => item.assetClass.kind === 'reit')?.target).toBe(1)
  })
})
