/**
 * Fase 6 — aporte: simulações (rascunho), efetivação e aportes externos (docs/06).
 */
import {
  contributionPlanSchema,
  contributionSchema,
  executeContributionPlanResponseSchema,
  listResponseSchema,
  portfolioResponseSchema,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ now: () => new Date('2026-11-20T15:00:00Z') })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent
let classes: Record<string, string>
let itsa: string

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'aportador')).agent
  const list = (await agent.get('/api/v1/asset-classes')).body.data as {
    id: string
    kind: string
  }[]
  classes = Object.fromEntries(list.map((item) => [item.kind, item.id]))
  // Sem provedor de cotações nos testes: ticker aceito pelo formato.
  itsa = (await agent.post('/api/v1/assets').send({ assetClassId: classes.stock, ticker: 'ITSA4' }))
    .body.id
})

const split = () => ({
  [classes.reit as string]: '40',
  [classes.stock as string]: '35',
  [classes.fixed_income as string]: '25',
})

async function createPlan(extra: Record<string, unknown> = {}) {
  const res = await agent.post('/api/v1/contribution-plans').send({
    competenceMonth: '2026-11',
    name: 'Aporte de novembro',
    totalCents: 120000,
    classSplit: split(),
    items: [
      { assetId: itsa, mode: 'by_quantity', quantity: '10', unitPrice: '14' },
      {
        newAsset: { ticker: 'mxrf11', name: 'MXRF11', assetClassId: classes.reit },
        mode: 'by_value',
        unitPrice: '9.73',
        valueCents: 50000,
      },
      {
        newAsset: { ticker: null, name: 'CDB Nubank', assetClassId: classes.fixed_income },
        mode: 'by_value',
        valueCents: 30000,
      },
    ],
    ...extra,
  })
  expect(res.status).toBe(201)
  return contributionPlanSchema.parse(res.body)
}

describe('simulações (RA-30)', () => {
  it('salva rascunho; a primeira do mês é a principal; edição substitui itens', async () => {
    const plan = await createPlan()
    expect(plan).toMatchObject({ status: 'draft', isPrimary: true, totalCents: 120000 })
    expect(plan.items).toHaveLength(3)
    expect(plan.items[1]?.newAsset).toMatchObject({ ticker: 'MXRF11' })

    const second = await createPlan({ name: 'Plano B' })
    expect(second.isPrimary).toBe(false)
    const promoted = await agent.put(`/api/v1/contribution-plans/${second.id}`).send({
      competenceMonth: '2026-11',
      name: 'Plano B',
      totalCents: 100000,
      classSplit: split(),
      isPrimary: true,
      items: [{ assetId: itsa, mode: 'by_quantity', quantity: '2', unitPrice: '14' }],
    })
    expect(promoted.status).toBe(200)
    expect(promoted.body).toMatchObject({ isPrimary: true, totalCents: 100000 })
    expect(promoted.body.items).toHaveLength(1)
    const list = listResponseSchema(contributionPlanSchema).parse(
      (await agent.get('/api/v1/contribution-plans?month=2026-11')).body,
    )
    expect(list.data.filter((item) => item.isPrimary).map((item) => item.id)).toEqual([second.id])

    // Validações: item sem ativo, ativo de outro usuário, classe inexistente.
    const bad = await agent.post('/api/v1/contribution-plans').send({
      competenceMonth: '2026-11',
      name: 'X',
      totalCents: 100,
      classSplit: {},
      items: [{ mode: 'by_value', valueCents: 100 }],
    })
    expect(bad.status).toBe(400)
    const other = (await signUp(app, 'outro')).agent
    expect((await other.get(`/api/v1/contribution-plans/${plan.id}`)).status).toBe(404)
    expect(
      (
        await other.post('/api/v1/contribution-plans').send({
          competenceMonth: '2026-11',
          name: 'X',
          totalCents: 100,
          classSplit: {},
          items: [{ assetId: itsa, mode: 'by_value', valueCents: 100 }],
        })
      ).status,
    ).toBe(400)

    // Excluir rascunho sem compras.
    expect((await agent.delete(`/api/v1/contribution-plans/${plan.id}`)).status).toBe(204)
    expect((await agent.get(`/api/v1/contribution-plans/${plan.id}`)).status).toBe(404)
  })
})

describe('efetivar (RA-31/32)', () => {
  it('parcial e depois total: compras, ativos novos, aporte e meta do mês', async () => {
    const plan = await createPlan()
    const [itsaItem, mxrfItem, cdbItem] = plan.items

    // Parcial: só ITSA4, com preço real diferente do simulado.
    const first = await agent.post(`/api/v1/contribution-plans/${plan.id}/execute`).send({
      date: '2026-11-21',
      items: [{ itemId: itsaItem?.id, quantity: '10', unitPrice: '13.90', feesCents: 50 }],
    })
    expect(first.status).toBe(200)
    const partial = executeContributionPlanResponseSchema.parse(first.body)
    expect(partial.plan.status).toBe('draft')
    expect(partial.contribution).toMatchObject({ amountCents: 13950, competenceMonth: '2026-11' })
    expect(partial.tradesCreated).toBe(1)
    // Item já comprado não pode ser comprado de novo.
    expect(
      (
        await agent.post(`/api/v1/contribution-plans/${plan.id}/execute`).send({
          date: '2026-11-21',
          items: [{ itemId: itsaItem?.id, quantity: '1', unitPrice: '1' }],
        })
      ).status,
    ).toBe(409)

    // Resto: MXRF11 (novo) e CDB (renda fixa, valor exato).
    const second = executeContributionPlanResponseSchema.parse(
      (
        await agent.post(`/api/v1/contribution-plans/${plan.id}/execute`).send({
          date: '2026-11-22',
          items: [
            { itemId: mxrfItem?.id, quantity: '51', unitPrice: '9.73' },
            { itemId: cdbItem?.id, quantity: '1', unitPrice: '0', totalCents: 30000 },
          ],
        })
      ).body,
    )
    expect(second.plan.status).toBe('executed')
    expect(second.assetsCreated).toEqual(['MXRF11', 'CDB Nubank'])
    expect(second.contribution.amountCents).toBe(49623 + 30000)

    const portfolio = portfolioResponseSchema.parse((await agent.get('/api/v1/portfolio')).body)
    const byLabel = new Map(
      portfolio.positions.map((item) => [item.asset.ticker ?? item.asset.name, item]),
    )
    expect(byLabel.get('ITSA4')).toMatchObject({ quantity: '10', costCents: 13950 })
    expect(byLabel.get('MXRF11')).toMatchObject({ quantity: '51', costCents: 49623 })
    expect(byLabel.get('CDB Nubank')).toMatchObject({ costCents: 30000 })
    expect(byLabel.get('CDB Nubank')?.asset.quoteMode).toBe('manual')

    // A meta do mês registra o investido (a meta funciona como uma conta).
    const month = (await agent.get('/api/v1/months/2026-11')).body
    expect(month.settings.goalInvestedCents).toBe(13950 + 49623 + 30000)

    // Efetivada: não edita nem exclui; aportes do mês aparecem na lista.
    expect(
      (
        await agent.put(`/api/v1/contribution-plans/${plan.id}`).send({
          competenceMonth: '2026-11',
          name: 'X',
          totalCents: 1,
          classSplit: {},
          items: [],
        })
      ).status,
    ).toBe(409)
    expect((await agent.delete(`/api/v1/contribution-plans/${plan.id}`)).status).toBe(409)
    const contributions = listResponseSchema(contributionSchema).parse(
      (await agent.get('/api/v1/contributions?from=2026-11&to=2026-11')).body,
    )
    expect(contributions.data.map((item) => item.amountCents).sort()).toEqual([13950, 79623])
  })

  it('sem registrar na meta; validações', async () => {
    const plan = await createPlan()
    const res = await agent.post(`/api/v1/contribution-plans/${plan.id}/execute`).send({
      date: '2026-11-21',
      registerInvested: false,
      items: [{ itemId: plan.items[0]?.id, quantity: '1', unitPrice: '14' }],
    })
    expect(res.status).toBe(200)
    expect((await agent.get('/api/v1/months/2026-11')).body.settings.goalInvestedCents).toBeNull()
    expect(
      (
        await agent
          .post(`/api/v1/contribution-plans/${plan.id}/execute`)
          .send({ date: '2026-11-21', items: [] })
      ).status,
    ).toBe(400)
    expect(
      (
        await agent.post(`/api/v1/contribution-plans/${plan.id}/execute`).send({
          date: '2026-11-21',
          items: [{ itemId: plan.items[1]?.id, quantity: '0', unitPrice: '0' }],
        })
      ).status,
    ).toBe(400)
  })
})

describe('aportes externos', () => {
  it('CRUD com mês pela data; resgate negativo; isolamento', async () => {
    const created = await agent
      .post('/api/v1/contributions')
      .send({ date: '2026-10-05', amountCents: 100000, notes: 'Bônus' })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ competenceMonth: '2026-10', amountCents: 100000 })
    expect(
      (await agent.post('/api/v1/contributions').send({ date: '2026-10-05', amountCents: 0 }))
        .status,
    ).toBe(400)
    const out = await agent
      .post('/api/v1/contributions')
      .send({ date: '2026-11-02', amountCents: -20000 })
    expect(out.status).toBe(201)

    const updated = await agent
      .patch(`/api/v1/contributions/${created.body.id}`)
      .send({ date: '2026-11-01' })
    expect(updated.body.competenceMonth).toBe('2026-11')
    expect((await agent.get('/api/v1/contributions?from=2026-11')).body.data).toHaveLength(2)

    const other = (await signUp(app, 'vizinho')).agent
    expect((await other.get('/api/v1/contributions')).body.data).toEqual([])
    expect((await other.delete(`/api/v1/contributions/${created.body.id}`)).status).toBe(404)
    expect((await agent.delete(`/api/v1/contributions/${created.body.id}`)).status).toBe(204)
    expect((await agent.get('/api/v1/contributions')).body.data).toHaveLength(1)
  })
})

describe('backup com o aporte (RE-02)', () => {
  it('leva simulações (com itens e principal), aportes e a ligação das compras', async () => {
    const plan = await createPlan()
    await agent.post(`/api/v1/contribution-plans/${plan.id}/execute`).send({
      date: '2026-11-21',
      items: [{ itemId: plan.items[0]?.id, quantity: '10', unitPrice: '14' }],
    })
    await agent.post('/api/v1/contributions').send({ date: '2026-10-05', amountCents: 5000 })
    const backup = (await agent.get('/api/v1/backup')).body
    expect(backup.data.contributionPlans).toHaveLength(1)
    expect(backup.data.contributionPlanItems).toHaveLength(3)
    expect(backup.data.contributions).toHaveLength(2)
    expect(backup.data.assetTrades[0]).toMatchObject({ contributionPlanId: plan.id })

    // Some o aporte manual e um rascunho novo; restaurar substituindo volta ao backup.
    const manual = backup.data.contributions.find(
      (item: { amountCents: number }) => item.amountCents === 5000,
    )
    await agent.delete(`/api/v1/contributions/${manual.id}`)
    await createPlan({ name: 'Depois do backup' })
    const restored = await agent.post('/api/v1/restore').send({ mode: 'replace', backup })
    expect(restored.status).toBe(200)

    const plans = (await agent.get('/api/v1/contribution-plans')).body.data
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ id: plan.id, isPrimary: true })
    expect(plans[0].items).toHaveLength(3)
    expect(plans[0].items[0].executedTradeId).not.toBeNull()
    expect((await agent.get('/api/v1/contributions')).body.data).toHaveLength(2)
  })
})
