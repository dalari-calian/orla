/**
 * Fase 3 — dashboard, projeção e próximos vencimentos, contra o Postgres real.
 * Relógio fixo em 28/11/2026 (São Paulo): os "próximos 7 dias" atravessam o mês.
 */
import {
  dashboardResponseSchema,
  projectionResponseSchema,
  upcomingResponseSchema,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ now: () => new Date('2026-11-28T15:00:00Z') })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent
let cardId: string
let accountId: string
let foodId: string

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'dono')).agent
  accountId = (
    await agent
      .post('/api/v1/accounts')
      .send({ name: 'Nubank', kind: 'checking', color: '#AF52DE' })
  ).body.id
  // Fecha dia 25, vence dia 2 do mês seguinte.
  cardId = (
    await agent
      .post('/api/v1/credit-cards')
      .send({ accountId, name: 'Roxinho', closingDay: 25, dueDay: 2 })
  ).body.id
  foodId = (
    await agent.post('/api/v1/categories').send({
      kind: 'expense',
      name: 'Comida',
      icon: 'utensils-crossed',
      color: '#FF9500',
      monthlyBudgetCents: 100_00,
    })
  ).body.id
  await agent
    .patch('/api/v1/me/settings')
    .send({ savingsGoal: { mode: 'fixed', amountCents: 1000_00 } })
  await agent.post('/api/v1/recurring-templates').send({
    type: 'income',
    description: 'Salário',
    amountCents: 6000_00,
    dayOfMonth: 5,
    startMonth: '2026-01',
  })
  await agent.post('/api/v1/recurring-templates').send({
    type: 'expense',
    description: 'Aluguel',
    amountCents: 1500_00,
    dayOfMonth: 3,
    paymentMethod: 'boleto',
    startMonth: '2026-01',
  })
})

const expense = (body: Record<string, unknown>) =>
  agent.post('/api/v1/transactions').send({
    type: 'expense',
    nature: 'variable',
    description: 'Mercado',
    amountCents: 50_00,
    date: '2026-11-10',
    paymentMethod: 'pix',
    ...body,
  })

describe('dashboard (doc 04 §8)', () => {
  it('quebras, orçamento, comparação e evolução — sem materializar meses', async () => {
    await expense({ categoryId: foodId, amountCents: 90_00, accountId })
    // Compra de 20/10 no crédito: fecha 25/10, vence 02/11 → competência de novembro.
    await expense({
      date: '2026-10-20',
      amountCents: 30_00,
      paymentMethod: 'credit',
      creditCardId: cardId,
    })
    await expense({ date: '2026-10-10', categoryId: foodId, amountCents: 40_00 })

    const res = await agent.get('/api/v1/months/2026-11/dashboard')
    expect(res.status).toBe(200)
    const body = dashboardResponseSchema.parse(res.body)

    // Salário e aluguel entram pelos modelos mesmo sem o mês ter sido aberto.
    expect(body.summary).toMatchObject({
      incomeForecastCents: 6000_00,
      expenseForecastCents: 1500_00 + 90_00 + 30_00,
      savingsGoalCents: 1000_00,
    })
    expect(body.previousSummary.expenseForecastCents).toBe(1500_00 + 40_00)

    const food = body.byCategory.find((row) => row.categoryId === foodId)
    expect(food).toMatchObject({ amountCents: 90_00, previousCents: 40_00, deltaCents: 50_00 })
    const total = body.byCategory.reduce((sum, row) => sum + row.amountCents, 0)
    expect(total).toBe(body.summary.expenseForecastCents)

    expect(body.byPaymentMethod.map((row) => row.paymentMethod)).toEqual([
      'boleto',
      'pix',
      'credit',
    ])
    expect(body.byCard).toEqual([{ creditCardId: cardId, amountCents: 30_00, share: 1 }])
    expect(body.budgets).toEqual([
      { categoryId: foodId, budgetCents: 100_00, spentCents: 90_00, ratio: 0.9, level: 'warning' },
    ])

    expect(body.evolution).toHaveLength(12)
    expect(body.evolution[11]).toMatchObject({ month: '2026-11', incomeCents: 6000_00 })
    expect(body.evolution[0]?.month).toBe('2025-12')
    expect(body.evolution[0]?.incomeCents).toBe(0) // antes do início do modelo

    // Nada foi gravado: o mês continua sem os lançamentos dos modelos até ser aberto.
    const list = await agent.get('/api/v1/transactions?month=2026-12')
    expect(list.body.data).toEqual([])
  })

  it('períodos: trimestre e ano somam meses e multiplicam o teto', async () => {
    await expense({ categoryId: foodId, amountCents: 90_00 })
    const quarter = dashboardResponseSchema.parse(
      (await agent.get('/api/v1/months/2026-11/dashboard?period=quarter')).body,
    )
    expect(quarter.months).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(quarter.summary.incomeForecastCents).toBe(3 * 6000_00)
    expect(quarter.budgets[0]).toMatchObject({ budgetCents: 300_00, level: 'ok' })

    const year = dashboardResponseSchema.parse(
      (await agent.get('/api/v1/months/2026-11/dashboard?period=year')).body,
    )
    expect(year.months).toHaveLength(12)
    expect(year.summary.savingsGoalCents).toBe(12 * 1000_00)
  })

  it('valida mês e período', async () => {
    expect((await agent.get('/api/v1/months/2026-13/dashboard')).status).toBe(404)
    expect((await agent.get('/api/v1/months/2026-11/dashboard?period=week')).status).toBe(400)
  })
})

describe('projeção (RF-52)', () => {
  it('12 meses a partir do mês atual com parcelas e o primeiro mês negativo', async () => {
    await agent.post('/api/v1/installment-plans').send({
      description: 'Notebook',
      totalCents: 6000_00,
      installmentsCount: 2,
      purchaseDate: '2026-11-10',
      paymentMethod: 'boleto',
      firstCompetenceMonth: '2027-01',
    })
    const res = await agent.get('/api/v1/projection')
    expect(res.status).toBe(200)
    const body = projectionResponseSchema.parse(res.body)
    expect(body.from).toBe('2026-11')
    expect(body.rows).toHaveLength(12)
    expect(body.rows[0]).toMatchObject({
      month: '2026-11',
      incomeCents: 6000_00,
      fixedCents: 1500_00,
      goalCents: 1000_00,
      surplusCents: 3500_00,
    })
    // Jan/27: 6000 − 1500 − 3000 (parcela) − 1000 (meta) = 500; ainda positivo.
    expect(body.rows[2]).toMatchObject({
      month: '2027-01',
      installmentCents: 3000_00,
      surplusCents: 500_00,
    })
    expect(body.firstNegativeMonth).toBeNull()

    await agent
      .patch('/api/v1/me/settings')
      .send({ savingsGoal: { mode: 'fixed', amountCents: 2000_00 } })
    const after = projectionResponseSchema.parse(
      (await agent.get('/api/v1/projection?from=2026-12&months=3')).body,
    )
    expect(after.rows.map((row) => row.month)).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(after.firstNegativeMonth).toBe('2027-01')
  })
})

describe('próximos vencimentos (doc 04 §8.8)', () => {
  it('aluguel atrasado e o do mês seguinte, fatura a vencer; crédito só pela fatura', async () => {
    // Compra em 26/11 (depois do fechamento) → fatura de 12/2026... vence 02/12? Não:
    // fecha 25/12 e vence 02/01. A de 20/11 cai na fatura que vence 02/12.
    await expense({
      date: '2026-11-20',
      amountCents: 200_00,
      paymentMethod: 'credit',
      creditCardId: cardId,
    })
    await expense({
      date: '2026-11-26',
      amountCents: 70_00,
      paymentMethod: 'credit',
      creditCardId: cardId,
    })

    const res = await agent.get('/api/v1/upcoming')
    expect(res.status).toBe(200)
    const body = upcomingResponseSchema.parse(res.body)
    expect(body.today).toBe('2026-11-28')
    expect(
      body.items.map((item) =>
        item.kind === 'statement'
          ? ['fatura', item.date, item.amountCents]
          : [item.transaction.description, item.date, item.amountCents],
      ),
    ).toEqual([
      ['Aluguel', '2026-11-03', 1500_00],
      ['fatura', '2026-12-02', 200_00],
      ['Aluguel', '2026-12-03', 1500_00],
    ])
  })

  it('aluguel de novembro em atraso aparece no topo', async () => {
    const nov = await agent.get('/api/v1/months/2026-11')
    const rent = nov.body.transactions.find(
      (item: { description: string }) => item.description === 'Aluguel',
    )
    expect(rent.date).toBe('2026-11-03')
    const body = upcomingResponseSchema.parse((await agent.get('/api/v1/upcoming?days=3')).body)
    expect(body.items[0]).toMatchObject({ kind: 'transaction', date: '2026-11-03' })
  })

  it('isolamento: outro usuário não vê nada', async () => {
    await expense({ amountCents: 1 })
    const other = (await signUp(app, 'outro')).agent
    const upcoming = upcomingResponseSchema.parse((await other.get('/api/v1/upcoming')).body)
    expect(upcoming.items).toEqual([])
    const dash = dashboardResponseSchema.parse(
      (await other.get('/api/v1/months/2026-11/dashboard')).body,
    )
    expect(dash.summary.expenseForecastCents).toBe(0)
    expect(dash.byCategory).toEqual([])
    const projection = projectionResponseSchema.parse((await other.get('/api/v1/projection')).body)
    expect(projection.rows.every((row) => row.surplusCents === 0)).toBe(true)
  })
})
