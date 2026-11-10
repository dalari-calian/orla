/**
 * Saldo do mês anterior (RF-54..57), ponta a ponta contra o Postgres real.
 * Relógio fixo em 07/12/2026 (São Paulo): novembro já terminou, dezembro é o mês atual.
 */
import { monthResponseSchema, type MonthResponse } from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ now: () => new Date('2026-12-07T15:00:00Z') })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'dono')).agent
})

async function month(value: string, who: Agent = agent): Promise<MonthResponse> {
  const res = await who.get(`/api/v1/months/${value}`)
  expect(res.status).toBe(200)
  return monthResponseSchema.parse(res.body)
}

const income = (amountCents: number, date = '2026-11-05') =>
  agent.post('/api/v1/transactions').send({
    type: 'income',
    nature: 'extra',
    description: 'Freela',
    amountCents,
    date,
  })

const expense = (amountCents: number, date = '2026-11-08') =>
  agent.post('/api/v1/transactions').send({
    type: 'expense',
    nature: 'variable',
    description: 'Mercado',
    amountCents,
    date,
    paymentMethod: 'pix',
  })

const carryoverOf = (data: MonthResponse) =>
  data.transactions.find((item) => item.nature === 'carryover')

describe('saldo do mês anterior — modo perguntar (padrão)', () => {
  it('oferece, leva, detecta mudança, atualiza e ignora', async () => {
    await income(10_000)
    await expense(5_000)

    const offered = await month('2026-12')
    expect(offered.carryover).toEqual({
      state: 'offer',
      previousMonth: '2026-11',
      previousBalanceCents: 5_000,
      appliedCents: null,
      previousMonthOpen: false,
      previousPendingCount: 0,
    })
    expect(offered.summary.carryoverCents).toBe(0)

    expect((await agent.post('/api/v1/months/2026-12/carryover')).status).toBe(204)
    const applied = await month('2026-12')
    expect(applied.carryover).toMatchObject({ state: 'applied', appliedCents: 5_000 })
    expect(carryoverOf(applied)).toMatchObject({
      type: 'income',
      nature: 'carryover',
      status: 'settled',
      description: 'Saldo de novembro',
      amountCents: 5_000,
      date: '2026-12-01',
    })
    // Entra na sobra e no saldo, não nas entradas.
    expect(applied.summary).toMatchObject({
      incomeForecastCents: 0,
      incomeSettledCents: 0,
      carryoverCents: 5_000,
      projectedSurplusCents: 5_000,
      currentBalanceCents: 5_000,
    })

    // Lançamento esquecido em novembro: o saldo levado fica desatualizado.
    await expense(2_000)
    const stale = await month('2026-12')
    expect(stale.carryover).toMatchObject({
      state: 'stale',
      previousBalanceCents: 3_000,
      appliedCents: 5_000,
    })
    expect(stale.summary.carryoverCents).toBe(5_000)

    expect((await agent.post('/api/v1/months/2026-12/carryover')).status).toBe(204)
    const refreshed = await month('2026-12')
    expect(refreshed.carryover).toMatchObject({ state: 'applied', appliedCents: 3_000 })
    expect(refreshed.transactions.filter((item) => item.nature === 'carryover')).toHaveLength(1)

    // "Ignorar": some e não volta a ser oferecido.
    expect((await agent.delete('/api/v1/months/2026-12/carryover')).status).toBe(204)
    const dismissed = await month('2026-12')
    expect(dismissed.carryover.state).toBe('none')
    expect(carryoverOf(dismissed)).toBeUndefined()
    expect(dismissed.summary.carryoverCents).toBe(0)

    // Levar de novo desfaz o "Ignorar".
    expect((await agent.post('/api/v1/months/2026-12/carryover')).status).toBe(204)
    expect((await month('2026-12')).carryover.state).toBe('applied')
  })

  it('faltou em novembro: desconta de dezembro como saída, sem contar como gasto', async () => {
    await income(3_000)
    await expense(10_000)
    expect((await month('2026-12')).carryover).toMatchObject({
      state: 'offer',
      previousBalanceCents: -7_000,
    })
    await agent.post('/api/v1/months/2026-12/carryover')
    const data = await month('2026-12')
    expect(carryoverOf(data)).toMatchObject({
      type: 'expense',
      description: 'Faltou em novembro',
      amountCents: 7_000,
    })
    expect(data.summary).toMatchObject({
      expenseForecastCents: 0,
      expenseSettledCents: 0,
      carryoverCents: -7_000,
      currentBalanceCents: -7_000,
    })
  })

  it('a meta em % não usa o saldo anterior como base', async () => {
    await agent
      .patch('/api/v1/me/settings')
      .send({ savingsGoal: { mode: 'percent', percent: '20' } })
    await income(50_000)
    await agent.post('/api/v1/months/2026-12/carryover')
    await income(100_000, '2026-12-05')
    const data = await month('2026-12')
    expect(data.summary.incomeForecastCents).toBe(100_000)
    // 20% dos R$ 1.000 de dezembro, não de R$ 1.000 + saldo de novembro (R$ 500 — a meta
    // de novembro não foi marcada como investida, então não saiu do saldo).
    expect(data.summary.savingsGoalCents).toBe(20_000)
    expect(data.summary.carryoverCents).toBe(50_000)
  })

  it('conta os lançamentos ainda previstos de novembro (o valor pode mudar)', async () => {
    await income(10_000)
    await agent.post('/api/v1/transactions').send({
      type: 'expense',
      nature: 'fixed',
      description: 'Luz',
      amountCents: 1_500,
      date: '2026-11-20',
    })
    const data = await month('2026-12')
    expect(data.carryover).toMatchObject({ previousBalanceCents: 10_000, previousPendingCount: 1 })
  })

  it('o lançamento de saldo não é editado nem criado à mão; excluir = ignorar', async () => {
    await income(10_000)
    expect(
      (
        await agent.post('/api/v1/transactions').send({
          type: 'income',
          nature: 'carryover',
          description: 'Saldo',
          amountCents: 100,
          date: '2026-12-01',
        })
      ).status,
    ).toBe(400)

    await agent.post('/api/v1/months/2026-12/carryover')
    const id = carryoverOf(await month('2026-12'))?.id
    expect(id).toBeDefined()
    expect((await agent.patch(`/api/v1/transactions/${id}`).send({ amountCents: 1 })).status).toBe(
      409,
    )
    expect((await agent.delete(`/api/v1/transactions/${id}`)).status).toBe(204)
    expect((await month('2026-12')).carryover.state).toBe('none')
    expect((await agent.post(`/api/v1/transactions/${id}/restore`)).status).toBe(409)
  })

  it('mês anterior ainda no futuro: nada a oferecer', async () => {
    await income(10_000, '2027-01-05')
    expect((await month('2027-02')).carryover.state).toBe('none')
  })

  it('mês anterior em andamento: oferece, avisando que pode mudar', async () => {
    await income(10_000, '2026-12-05')
    expect((await month('2027-01')).carryover).toMatchObject({
      state: 'offer',
      previousMonth: '2026-12',
      previousMonthOpen: true,
    })
  })
})

describe('saldo do mês anterior — modos automático e nunca', () => {
  it('automático: aplica ao abrir o mês e acompanha mudanças do mês anterior', async () => {
    const settings = await agent.patch('/api/v1/me/settings').send({ carryoverMode: 'auto' })
    expect(settings.body.carryoverMode).toBe('auto')
    await income(10_000)

    const first = await month('2026-12')
    expect(first.carryover).toMatchObject({ state: 'applied', appliedCents: 10_000 })
    expect(first.summary.carryoverCents).toBe(10_000)

    await expense(4_000)
    const synced = await month('2026-12')
    expect(synced.carryover).toMatchObject({ state: 'applied', appliedCents: 6_000 })
    expect(synced.transactions.filter((item) => item.nature === 'carryover')).toHaveLength(1)

    // Ignorar vale também no automático.
    await agent.delete('/api/v1/months/2026-12/carryover')
    expect((await month('2026-12')).carryover.state).toBe('none')
  })

  it('automático não aplica enquanto o mês anterior não termina', async () => {
    await agent.patch('/api/v1/me/settings').send({ carryoverMode: 'auto' })
    await income(10_000, '2026-12-05')
    const data = await month('2027-01')
    expect(data.carryover.state).toBe('none')
    expect(carryoverOf(data)).toBeUndefined()
  })

  it('nunca: não oferece', async () => {
    await agent.patch('/api/v1/me/settings').send({ carryoverMode: 'off' })
    await income(10_000)
    expect((await month('2026-12')).carryover.state).toBe('none')
    expect((await agent.get('/api/v1/me/settings')).body.carryoverMode).toBe('off')
  })

  it('isolamento: o saldo de outro usuário não aparece', async () => {
    await income(10_000)
    const other = (await signUp(app, 'outra')).agent
    expect((await month('2026-12', other)).carryover.state).toBe('none')
    expect((await other.post('/api/v1/months/2026-12/carryover')).status).toBe(204)
    expect(carryoverOf(await month('2026-12', other))).toBeUndefined()
    expect((await month('2026-12')).carryover.state).toBe('offer')
  })
})
