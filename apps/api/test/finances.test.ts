/**
 * Fase 2 — finanças núcleo, ponta a ponta contra o Postgres real.
 * Relógio fixo em 07/11/2026 (São Paulo) para "mês atual" e "hoje".
 */
import {
  cardStatementSchema,
  installmentPlanDetailSchema,
  installmentSummarySchema,
  monthResponseSchema,
  transactionSchema,
  type MonthResponse,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ now: () => new Date('2026-11-07T15:00:00Z') })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent
let cardId: string
let accountId: string

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'dono')).agent
  accountId = (
    await agent
      .post('/api/v1/accounts')
      .send({ name: 'Nubank', kind: 'checking', color: '#AF52DE' })
  ).body.id
  // Fecha dia 3, vence dia 10.
  cardId = (
    await agent
      .post('/api/v1/credit-cards')
      .send({ accountId, name: 'Roxinho', closingDay: 3, dueDay: 10 })
  ).body.id
})

async function month(value: string): Promise<MonthResponse> {
  const res = await agent.get(`/api/v1/months/${value}`)
  expect(res.status).toBe(200)
  return monthResponseSchema.parse(res.body)
}

const expense = (body: Record<string, unknown>) =>
  agent.post('/api/v1/transactions').send({
    type: 'expense',
    nature: 'variable',
    description: 'Mercado',
    amountCents: 10000,
    date: '2026-11-07',
    ...body,
  })

describe('lançamentos', () => {
  it('cria, edita, paga, exclui e restaura', async () => {
    const created = await expense({ paymentMethod: 'pix' })
    expect(created.status).toBe(201)
    const tx = transactionSchema.parse(created.body)
    // RF-24: gasto do dia nasce realizado; RF-02: competência = mês da data.
    expect(tx).toMatchObject({ status: 'settled', competenceMonth: '2026-11', source: 'manual' })

    const updated = await agent.patch(`/api/v1/transactions/${tx.id}`).send({ amountCents: 12345 })
    expect(updated.body).toMatchObject({ amountCents: 12345, isOverride: false })

    expect((await agent.post(`/api/v1/transactions/${tx.id}/unsettle`)).body.status).toBe(
      'forecast',
    )
    const settled = await agent
      .post(`/api/v1/transactions/${tx.id}/settle`)
      .send({ amountCents: 13000, date: '2026-11-08' })
    expect(settled.body).toMatchObject({
      status: 'settled',
      amountCents: 13000,
      date: '2026-11-08',
    })

    expect((await agent.delete(`/api/v1/transactions/${tx.id}`)).status).toBe(204)
    expect((await month('2026-11')).transactions).toEqual([])
    expect((await agent.post(`/api/v1/transactions/${tx.id}/restore`)).status).toBe(200)
    expect((await month('2026-11')).transactions).toHaveLength(1)
  })

  it('RF-03/30: compra no crédito cai na fatura pelo fechamento', async () => {
    const before = await expense({
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-02',
    })
    expect(before.body.competenceMonth).toBe('2026-11')
    const onClosing = await expense({
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-03',
    })
    expect(onClosing.body.competenceMonth).toBe('2026-12')
    // Competência informada pelo usuário prevalece.
    const manual = await expense({
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-03',
      competenceMonth: '2027-01',
    })
    expect(manual.body.competenceMonth).toBe('2027-01')
  })

  it('valida combinações e referências', async () => {
    expect((await expense({ paymentMethod: 'credit' })).status).toBe(400)
    expect((await expense({ nature: 'extra' })).status).toBe(400)
    expect((await expense({ nature: 'installment' })).status).toBe(400)
    expect((await expense({ amountCents: 0 })).status).toBe(400)
    expect((await expense({ date: '2026-02-30' })).status).toBe(400)
    const income = (await agent.get('/api/v1/categories?kind=income')).body.data[0]
    const wrongKind = await expense({ categoryId: income.id })
    expect(wrongKind.status).toBe(400)
    expect(wrongKind.body.error.details.fields[0].path).toBe('categoryId')
  })

  it('filtros, busca e paginação', async () => {
    await expense({ description: 'Padaria' })
    await expense({ description: 'Farmácia', date: '2026-11-05' })
    await agent.post('/api/v1/transactions').send({
      type: 'income',
      nature: 'extra',
      description: 'Presente',
      amountCents: 30000,
      date: '2026-11-06',
    })
    expect((await agent.get('/api/v1/transactions?type=income')).body.data).toHaveLength(1)
    expect((await agent.get('/api/v1/transactions?q=padar')).body.data).toHaveLength(1)
    const page1 = await agent.get('/api/v1/transactions?limit=2')
    expect(page1.body.data).toHaveLength(2)
    expect(page1.body.nextCursor).not.toBeNull()
    const page2 = await agent.get(`/api/v1/transactions?limit=2&cursor=${page1.body.nextCursor}`)
    expect(page2.body.data).toHaveLength(1)
    expect(page2.body.nextCursor).toBeNull()
  })

  it('RM-03: o estabelecimento lembra categoria, forma e cartão do último lançamento', async () => {
    const payee = (await agent.post('/api/v1/payees').send({ name: 'iFood' })).body
    const category = (await agent.get('/api/v1/categories?kind=expense')).body.data[2]
    await expense({
      payeeId: payee.id,
      paymentMethod: 'credit',
      creditCardId: cardId,
      categoryId: category.id,
    })
    const suggestion = await agent.get(`/api/v1/payees/${payee.id}/suggestion`)
    expect(suggestion.body).toEqual({
      categoryId: category.id,
      paymentMethod: 'credit',
      creditCardId: cardId,
      accountId: null,
    })
  })
})

describe('modelos recorrentes e o mês', () => {
  async function salary(body: Record<string, unknown> = {}) {
    const res = await agent.post('/api/v1/recurring-templates').send({
      type: 'income',
      description: 'Salário',
      amountCents: 600000,
      dayOfMonth: 5,
      startMonth: '2026-01',
      ...body,
    })
    expect(res.status).toBe(201)
    return res.body as { id: string }
  }

  it('RF-11: abrir o mês materializa uma vez só (idempotente)', async () => {
    await salary()
    const first = await month('2026-11')
    expect(first.transactions).toHaveLength(1)
    expect(first.transactions[0]).toMatchObject({
      nature: 'fixed',
      status: 'forecast',
      source: 'template',
      date: '2026-11-05',
      amountCents: 600000,
    })
    await Promise.all([month('2026-11'), month('2026-11')])
    expect((await month('2026-11')).transactions).toHaveLength(1)
    // Antes do início não gera.
    expect((await month('2025-12')).transactions).toEqual([])
  })

  it('RF-12: editar o salário de um mês não afeta o seguinte', async () => {
    await salary()
    const nov = (await month('2026-11')).transactions[0]
    const edited = await agent
      .patch(`/api/v1/transactions/${nov?.id}`)
      .send({ amountCents: 618032 })
    expect(edited.body).toMatchObject({ amountCents: 618032, isOverride: true })
    expect((await month('2026-12')).transactions[0]?.amountCents).toBe(600000)
  })

  it('RF-13: template editado a partir de Mar não altera Jan/Fev nem overrides', async () => {
    const template = await salary()
    for (const m of ['2026-01', '2026-02', '2026-03', '2026-04']) await month(m)
    const apr = (await month('2026-04')).transactions[0]
    await agent.patch(`/api/v1/transactions/${apr?.id}`).send({ amountCents: 650000 })

    const res = await agent
      .patch(`/api/v1/recurring-templates/${template.id}`)
      .send({ amountCents: 700000, applyFromMonth: '2026-03' })
    expect(res.status).toBe(200)

    const amounts = await Promise.all(
      ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(
        async (m) => (await month(m)).transactions[0]?.amountCents,
      ),
    )
    expect(amounts).toEqual([600000, 600000, 700000, 650000, 700000])
  })

  it('RF-14: excluir o modelo remove só os previstos a partir do mês escolhido', async () => {
    const template = await salary()
    await month('2026-10')
    const nov = (await month('2026-11')).transactions[0]
    await month('2026-12')
    await agent.post(`/api/v1/transactions/${nov?.id}/settle`)

    const res = await agent.delete(
      `/api/v1/recurring-templates/${template.id}?removeFromMonth=2026-11`,
    )
    expect(res.status).toBe(204)
    expect((await month('2026-10')).transactions).toHaveLength(1)
    expect((await month('2026-11')).transactions).toHaveLength(1) // realizado fica
    expect((await month('2026-12')).transactions).toEqual([])
    expect((await month('2027-01')).transactions).toEqual([]) // modelo excluído não gera mais

    await agent.post(`/api/v1/recurring-templates/${template.id}/restore`)
    expect((await month('2026-12')).transactions).toHaveLength(1)
  })

  it('lançamento gerado e excluído não reaparece ao reabrir o mês', async () => {
    await salary()
    const nov = (await month('2026-11')).transactions[0]
    await agent.delete(`/api/v1/transactions/${nov?.id}`)
    expect((await month('2026-11')).transactions).toEqual([])
  })

  it('RF-23: planejamento anual só no mês do ano', async () => {
    const res = await agent.post('/api/v1/recurring-templates').send({
      type: 'expense',
      nature: 'planned',
      frequency: 'yearly',
      monthOfYear: 10,
      description: 'Aniversário',
      amountCents: 20000,
      dayOfMonth: 15,
      startMonth: '2026-01',
    })
    expect(res.status).toBe(201)
    expect((await month('2026-10')).transactions[0]).toMatchObject({ nature: 'planned' })
    expect((await month('2026-11')).transactions).toEqual([])
    const invalid = await agent.post('/api/v1/recurring-templates').send({
      type: 'expense',
      frequency: 'yearly',
      description: 'X',
      amountCents: 1,
      dayOfMonth: 1,
      startMonth: '2026-01',
    })
    expect(invalid.status).toBe(400)
  })

  it('RF-51: resumo do mês com meta do usuário e meta do mês', async () => {
    await agent
      .patch('/api/v1/me/settings')
      .send({ savingsGoal: { mode: 'percent', percent: '20' } })
    await salary()
    await agent.post('/api/v1/transactions').send({
      type: 'income',
      nature: 'extra',
      description: 'Presente',
      amountCents: 30000,
      date: '2026-11-06',
    })
    await expense({
      amountCents: 150000,
      nature: 'fixed',
      status: 'forecast',
      description: 'Aluguel',
    })

    const nov = await month('2026-11')
    expect(nov.summary).toMatchObject({
      incomeForecastCents: 630000,
      incomeSettledCents: 30000,
      expenseForecastCents: 150000,
      savingsGoalCents: 126000, // 20% de 6.300
      projectedSurplusCents: 354000,
    })

    const patched = await agent
      .patch('/api/v1/months/2026-11/settings')
      .send({ savingsGoalCents: 500000 })
    expect(patched.status).toBe(200)
    const after = await month('2026-11')
    expect(after.settings.savingsGoalCents).toBe(500000)
    expect(after.summary).toMatchObject({
      projectedSurplusCents: -20000,
      goalShortfallCents: 20000,
    })
    expect((await agent.get('/api/v1/months/2026-13')).status).toBe(404)
  })

  it('meta como conta: o investido sai do saldo e a sobra continua reservando a meta', async () => {
    await salary()
    await agent.patch('/api/v1/months/2026-11/settings').send({ savingsGoalCents: 190000 })
    const before = await month('2026-11')
    expect(before.summary).toMatchObject({
      goalInvestedCents: 0,
      goalRemainingCents: 190000,
      projectedSurplusCents: 600000 - 190000,
    })

    const partial = await agent
      .patch('/api/v1/months/2026-11/settings')
      .send({ goalInvestedCents: 100000 })
    expect(partial.status).toBe(200)
    expect(partial.body).toMatchObject({ savingsGoalCents: 190000, goalInvestedCents: 100000 })
    const after = await month('2026-11')
    expect(after.settings.goalInvestedCents).toBe(100000)
    expect(after.summary).toMatchObject({
      goalInvestedCents: 100000,
      goalRemainingCents: 90000,
      projectedSurplusCents: 600000 - 190000,
      currentBalanceCents: before.summary.currentBalanceCents - 100000,
    })

    await agent.patch('/api/v1/months/2026-11/settings').send({ goalInvestedCents: null })
    expect((await month('2026-11')).summary.goalInvestedCents).toBe(0)
    const negative = await agent
      .patch('/api/v1/months/2026-11/settings')
      .send({ goalInvestedCents: -1 })
    expect(negative.status).toBe(400)
  })

  it('RF-22: planejamento com gastos vinculados', async () => {
    const planned = await expense({
      nature: 'planned',
      description: 'Meu aniversário',
      amountCents: 20000,
      date: '2026-11-20',
    })
    expect(planned.body.status).toBe('forecast')
    // O gasto vinculado vai para a competência do planejamento, mesmo no crédito em outra fatura.
    const child = await expense({
      amountCents: 12000,
      parentPlannedId: planned.body.id,
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-20',
    })
    expect(child.body.competenceMonth).toBe('2026-11')
    expect((await month('2026-11')).summary.expenseForecastCents).toBe(20000)

    await expense({ amountCents: 10000, parentPlannedId: planned.body.id })
    expect((await month('2026-11')).summary.expenseForecastCents).toBe(22000)

    // Não pode vincular a algo que não é planejamento.
    expect((await expense({ parentPlannedId: child.body.id })).status).toBe(400)
    // Planejamento com filhos não muda de natureza.
    const change = await agent
      .patch(`/api/v1/transactions/${planned.body.id}`)
      .send({ nature: 'variable' })
    expect(change.status).toBe(409)
  })
})

describe('parcelamentos', () => {
  const plan = (body: Record<string, unknown>) =>
    agent.post('/api/v1/installment-plans').send({
      description: 'Nintendo Switch',
      paymentMethod: 'credit',
      creditCardId: cardId,
      purchaseDate: '2026-11-01',
      ...body,
    })

  it('RF-41/42: R$ 100 em 3× no crédito, competência pela fatura', async () => {
    const res = await plan({ totalCents: 10000, installmentsCount: 3 })
    expect(res.status).toBe(201)
    const detail = installmentPlanDetailSchema.parse(res.body)
    expect(
      detail.installments.map((item) => [item.amountCents, item.competenceMonth, item.date]),
    ).toEqual([
      [3334, '2026-11', '2026-11-10'],
      [3333, '2026-12', '2026-12-10'],
      [3333, '2027-01', '2027-01-10'],
    ])
    expect(detail.plan.indicators).toMatchObject({ currentNumber: 1, remainingCents: 10000 })
    expect((await month('2026-12')).transactions[0]).toMatchObject({
      nature: 'installment',
      installmentNumber: 2,
      installmentsCount: 3,
    })
  })

  it('RF-43/45: 12× já na parcela 2 aparece no totalizador', async () => {
    const res = await plan({
      installmentCents: 10000,
      installmentsCount: 12,
      currentInstallment: 2,
    })
    const detail = installmentPlanDetailSchema.parse(res.body)
    expect(detail.plan.firstCompetenceMonth).toBe('2026-10')
    expect(detail.plan.totalCents).toBe(120000)
    expect(detail.plan.indicators).toMatchObject({
      currentNumber: 2,
      paidCount: 1,
      paidCents: 10000,
      remainingCents: 110000,
    })
    await plan({ description: 'Tênis', totalCents: 30000, installmentsCount: 3 })

    const summary = installmentSummarySchema.parse(
      (await agent.get('/api/v1/installment-plans/summary')).body,
    )
    expect(summary.payoffTotalCents).toBe(140000)
    expect(summary.monthly[0]).toEqual({ month: '2026-11', amountCents: 20000 })
    expect(summary.freeFromMonth).toBe('2027-10')
    expect(summary.byCard).toEqual([{ creditCardId: cardId, remainingCents: 140000 }])
  })

  it('RF-46: quitação antecipada com desconto', async () => {
    const created = installmentPlanDetailSchema.parse(
      (await plan({ totalCents: 120000, installmentsCount: 12, currentInstallment: 5 })).body,
    )
    expect(created.plan.indicators.remainingCents).toBe(80000)
    const res = await agent
      .post(`/api/v1/installment-plans/${created.plan.id}/payoff`)
      .send({ amountCents: 72000, date: '2026-11-07' })
    const detail = installmentPlanDetailSchema.parse(res.body)
    expect(detail.plan).toMatchObject({ status: 'paid_off', payoffDiscountCents: 8000 })
    expect(detail.installments.filter((item) => item.status === 'forecast')).toEqual([])
    expect(detail.installments.at(-1)).toMatchObject({
      amountCents: 72000,
      installmentNumber: null,
    })
    expect((await agent.get('/api/v1/installment-plans/summary')).body.payoffTotalCents).toBe(0)
    // Parcelas não se excluem individualmente.
    const any = detail.installments[0]
    expect((await agent.delete(`/api/v1/transactions/${any?.id}`)).status).toBe(409)
  })

  it('RF-47: editar regera só as previstas; RF-48: cancelar remove as futuras', async () => {
    const created = installmentPlanDetailSchema.parse(
      (await plan({ totalCents: 30000, installmentsCount: 3, currentInstallment: 2 })).body,
    )
    const edited = installmentPlanDetailSchema.parse(
      (
        await agent
          .patch(`/api/v1/installment-plans/${created.plan.id}`)
          .send({ totalCents: 40000, installmentsCount: 4, description: 'Switch OLED' })
      ).body,
    )
    expect(
      edited.installments.map((item) => [item.installmentNumber, item.amountCents, item.status]),
    ).toEqual([
      [1, 10000, 'settled'],
      [2, 10000, 'forecast'],
      [3, 10000, 'forecast'],
      [4, 10000, 'forecast'],
    ])
    expect(edited.installments[1]?.description).toBe('Switch OLED')
    expect(
      (await agent.patch(`/api/v1/installment-plans/${created.plan.id}`).send({ totalCents: 5000 }))
        .status,
    ).toBe(400)

    const canceled = installmentPlanDetailSchema.parse(
      (await agent.post(`/api/v1/installment-plans/${created.plan.id}/cancel`)).body,
    )
    expect(canceled.plan.status).toBe('canceled')
    expect(canceled.installments).toHaveLength(1)
    expect((await agent.post(`/api/v1/installment-plans/${created.plan.id}/cancel`)).status).toBe(
      409,
    )
  })

  it('excluir e restaurar o parcelamento leva as parcelas junto', async () => {
    const created = installmentPlanDetailSchema.parse(
      (await plan({ totalCents: 30000, installmentsCount: 3 })).body,
    )
    expect((await agent.delete(`/api/v1/installment-plans/${created.plan.id}`)).status).toBe(204)
    expect((await month('2026-11')).transactions).toEqual([])
    expect((await agent.post(`/api/v1/installment-plans/${created.plan.id}/restore`)).status).toBe(
      200,
    )
    expect((await month('2026-11')).transactions).toHaveLength(1)
  })

  it('valida o cadastro', async () => {
    expect((await plan({ installmentsCount: 3 })).status).toBe(400)
    expect(
      (await plan({ totalCents: 100, installmentCents: 50, installmentsCount: 2 })).status,
    ).toBe(400)
    expect((await plan({ totalCents: 2, installmentsCount: 3 })).status).toBe(400)
    expect(
      (await plan({ totalCents: 300, installmentsCount: 3, currentInstallment: 4 })).status,
    ).toBe(400)
    expect(
      (await plan({ creditCardId: undefined, totalCents: 300, installmentsCount: 3 })).status,
    ).toBe(400)
  })
})

describe('fatura do cartão', () => {
  it('RF-31/32: total, datas, status, pagar e faturas futuras', async () => {
    // No crédito a compra nasce prevista; esta já foi marcada como paga à mão.
    await expense({
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-02',
      amountCents: 5000,
      status: 'settled',
    })
    const pending = await expense({
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-01',
      amountCents: 2500,
    })
    expect(pending.body.status).toBe('forecast')
    await expense({
      paymentMethod: 'credit',
      creditCardId: cardId,
      date: '2026-11-05',
      amountCents: 9900,
    })

    const res = await agent.get(`/api/v1/credit-cards/${cardId}/statements/2026-11`)
    const statement = cardStatementSchema.parse(res.body)
    expect(statement).toMatchObject({
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
      status: 'closed', // hoje é 07/11
      totalCents: 7500,
      settledCents: 5000,
    })
    expect(statement.transactions).toHaveLength(2)

    const paid = cardStatementSchema.parse(
      (await agent.post(`/api/v1/credit-cards/${cardId}/statements/2026-11/pay`)).body,
    )
    expect(paid).toMatchObject({ status: 'paid', settledCents: 7500 })

    const dec = cardStatementSchema.parse(
      (await agent.get(`/api/v1/credit-cards/${cardId}/statements/2026-12`)).body,
    )
    expect(dec.status).toBe('open')
    expect(dec.totalCents).toBe(9900)
    expect(paid.futureTotalCents).toBe(9900)
  })
})
