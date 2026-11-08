/**
 * Aceite da Fase 1 / RNF-21: um usuário não enxerga nem altera nada de outro,
 * em nenhum endpoint de dados.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp()

type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let alice: Agent
let bob: Agent
const aliceIds: Record<string, string> = {}

beforeAll(async () => {
  await resetDatabase()
  alice = (await signUp(app, 'alice')).agent
  bob = (await signUp(app, 'bob')).agent

  const account = await alice
    .post('/api/v1/accounts')
    .send({ name: 'Nubank', kind: 'checking', color: '#AF52DE' })
  aliceIds.accounts = account.body.id
  const card = await alice
    .post('/api/v1/credit-cards')
    .send({ accountId: account.body.id, name: 'Roxinho', closingDay: 3, dueDay: 10 })
  aliceIds['credit-cards'] = card.body.id
  const category = await alice
    .post('/api/v1/categories')
    .send({ kind: 'expense', name: 'Só da Alice', icon: 'gift', color: '#FF9500' })
  aliceIds.categories = category.body.id
  const payee = await alice.post('/api/v1/payees').send({ name: 'Padaria da Alice' })
  aliceIds.payees = payee.body.id
  await alice.post('/api/v1/recurring-templates').send({
    type: 'income',
    description: 'Salário',
    amountCents: 600000,
    dayOfMonth: 5,
    startMonth: '2026-11',
  })
  await alice
    .patch('/api/v1/me/settings')
    .send({ savingsGoal: { mode: 'fixed', amountCents: 120000 } })

  const transaction = await alice.post('/api/v1/transactions').send({
    type: 'expense',
    nature: 'planned',
    description: 'Viagem da Alice',
    amountCents: 50000,
    date: '2026-11-20',
  })
  aliceIds.transactions = transaction.body.id
  const plan = await alice.post('/api/v1/installment-plans').send({
    description: 'Switch da Alice',
    creditCardId: card.body.id,
    purchaseDate: '2026-11-01',
    totalCents: 120000,
    installmentsCount: 12,
  })
  aliceIds['installment-plans'] = plan.body.plan?.id
  const templates = await alice.get('/api/v1/recurring-templates')
  aliceIds['recurring-templates'] = templates.body.data[0]?.id

  for (const [resource, id] of Object.entries(aliceIds)) {
    if (!id) throw new Error(`Falha ao criar ${resource} da Alice`)
  }
})

describe('isolamento entre usuários', () => {
  it.each([
    'accounts',
    'credit-cards',
    'payees',
    'recurring-templates',
    'transactions',
    'installment-plans',
  ])('GET /%s do Bob não traz nada da Alice', async (resource) => {
    const res = await bob.get(`/api/v1/${resource}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('categorias do Bob são só as padrão dele', async () => {
    const res = await bob.get('/api/v1/categories')
    const names = res.body.data.map((category: { name: string }) => category.name)
    expect(names).not.toContain('Só da Alice')
    expect(res.body.data.map((c: { id: string }) => c.id)).not.toContain(aliceIds.categories)
  })

  it('settings do Bob não herdam os da Alice', async () => {
    const res = await bob.get('/api/v1/me/settings')
    expect(res.body.savingsGoal).toEqual({ mode: 'none' })
  })

  it.each(['accounts', 'credit-cards', 'categories', 'payees'])(
    'Bob não lê, edita, exclui nem restaura /%s da Alice (404)',
    async (resource) => {
      const id = aliceIds[resource]
      expect((await bob.get(`/api/v1/${resource}/${id}`)).status).toBe(404)
      expect((await bob.patch(`/api/v1/${resource}/${id}`).send({ name: 'Hackeado' })).status).toBe(
        404,
      )
      expect((await bob.delete(`/api/v1/${resource}/${id}`)).status).toBe(404)
      expect((await bob.post(`/api/v1/${resource}/${id}/restore`)).status).toBe(404)

      // E o registro da Alice continua intacto.
      const own = await alice.get(`/api/v1/${resource}/${id}`)
      expect(own.status).toBe(200)
      expect(own.body.name).not.toBe('Hackeado')
    },
  )

  it.each(['transactions', 'installment-plans', 'recurring-templates'])(
    'Bob não lê, edita, exclui nem restaura /%s da Alice (404)',
    async (resource) => {
      const id = aliceIds[resource]
      expect((await bob.get(`/api/v1/${resource}/${id}`)).status).toBe(404)
      expect(
        (await bob.patch(`/api/v1/${resource}/${id}`).send({ description: 'Hackeado' })).status,
      ).toBe(404)
      expect((await bob.delete(`/api/v1/${resource}/${id}`)).status).toBe(404)
      expect((await bob.post(`/api/v1/${resource}/${id}/restore`)).status).toBe(404)
      const own = await alice.get(`/api/v1/${resource}/${id}`)
      expect(own.status).toBe(200)
      expect(JSON.stringify(own.body)).not.toContain('Hackeado')
    },
  )

  it('Bob não paga, quita, cancela nem vê a fatura da Alice', async () => {
    const tx = aliceIds.transactions
    const plan = aliceIds['installment-plans']
    const card = aliceIds['credit-cards']
    expect((await bob.post(`/api/v1/transactions/${tx}/settle`)).status).toBe(404)
    expect((await bob.post(`/api/v1/transactions/${tx}/unsettle`)).status).toBe(404)
    expect(
      (
        await bob
          .post(`/api/v1/installment-plans/${plan}/payoff`)
          .send({ amountCents: 1, date: '2026-11-07' })
      ).status,
    ).toBe(404)
    expect((await bob.post(`/api/v1/installment-plans/${plan}/cancel`)).status).toBe(404)
    expect((await bob.get(`/api/v1/credit-cards/${card}/statements/2026-11`)).status).toBe(404)
    expect((await bob.post(`/api/v1/credit-cards/${card}/statements/2026-11/pay`)).status).toBe(404)
    expect((await bob.get(`/api/v1/payees/${aliceIds.payees}/suggestion`)).status).toBe(404)
  })

  it('o mês, o resumo e o totalizador do Bob não trazem nada da Alice', async () => {
    const nov = await bob.get('/api/v1/months/2026-11')
    expect(nov.body.transactions).toEqual([])
    expect(nov.body.summary.expenseForecastCents).toBe(0)
    const summary = await bob.get('/api/v1/installment-plans/summary')
    expect(summary.body.payoffTotalCents).toBe(0)
    // A Alice vê os dela (salário materializado + planejamento + parcela).
    const alices = await alice.get('/api/v1/months/2026-11')
    expect(alices.body.transactions.length).toBeGreaterThanOrEqual(2)
  })

  it('Bob não consegue apontar para dados da Alice em referências', async () => {
    const card = await bob
      .post('/api/v1/credit-cards')
      .send({ accountId: aliceIds.accounts, name: 'Cartão', closingDay: 1, dueDay: 8 })
    expect(card.status).toBe(400)

    const sub = await bob.post('/api/v1/categories').send({
      kind: 'expense',
      name: 'Sub',
      icon: 'gift',
      color: '#FF9500',
      parentId: aliceIds.categories,
    })
    expect(sub.status).toBe(400)

    const payee = await bob
      .post('/api/v1/payees')
      .send({ name: 'Loja', defaultCategoryId: aliceIds.categories })
    expect(payee.status).toBe(400)

    const template = await bob.post('/api/v1/recurring-templates').send({
      type: 'income',
      description: 'X',
      amountCents: 100,
      dayOfMonth: 1,
      startMonth: '2026-11',
      accountId: aliceIds.accounts,
    })
    expect(template.status).toBe(400)

    const base = {
      type: 'expense',
      nature: 'variable',
      description: 'X',
      amountCents: 100,
      date: '2026-11-07',
    }
    for (const ref of [
      { categoryId: aliceIds.categories },
      { accountId: aliceIds.accounts },
      { payeeId: aliceIds.payees },
      { paymentMethod: 'credit', creditCardId: aliceIds['credit-cards'] },
      { parentPlannedId: aliceIds.transactions },
    ]) {
      expect((await bob.post('/api/v1/transactions').send({ ...base, ...ref })).status).toBe(400)
    }
    const plan = await bob.post('/api/v1/installment-plans').send({
      description: 'X',
      creditCardId: aliceIds['credit-cards'],
      purchaseDate: '2026-11-01',
      totalCents: 300,
      installmentsCount: 3,
    })
    expect(plan.status).toBe(400)
  })

  it('user_id enviado pelo cliente é ignorado', async () => {
    const res = await bob
      .post('/api/v1/payees')
      .send({ name: 'Tentativa', userId: '00000000-0000-0000-0000-000000000000' })
    expect(res.status).toBe(201)
    const aliceList = await alice.get('/api/v1/payees')
    expect(aliceList.body.data.map((p: { name: string }) => p.name)).not.toContain('Tentativa')
  })

  it('mesmo nome em usuários diferentes é permitido', async () => {
    const res = await bob
      .post('/api/v1/accounts')
      .send({ name: 'Nubank', kind: 'checking', color: '#AF52DE' })
    expect(res.status).toBe(201)
  })
})
