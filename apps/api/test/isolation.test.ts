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
  await alice
    .post('/api/v1/recurring-templates')
    .send({ description: 'Salário', amountCents: 600000, dayOfMonth: 5, startMonth: '2026-11' })
  await alice
    .patch('/api/v1/me/settings')
    .send({ savingsGoal: { mode: 'fixed', amountCents: 120000 } })

  for (const [resource, id] of Object.entries(aliceIds)) {
    if (!id) throw new Error(`Falha ao criar ${resource} da Alice`)
  }
})

describe('isolamento entre usuários', () => {
  it.each(['accounts', 'credit-cards', 'payees', 'recurring-templates'])(
    'GET /%s do Bob não traz nada da Alice',
    async (resource) => {
      const res = await bob.get(`/api/v1/${resource}`)
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    },
  )

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
      description: 'X',
      amountCents: 100,
      dayOfMonth: 1,
      startMonth: '2026-11',
      accountId: aliceIds.accounts,
    })
    expect(template.status).toBe(400)
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
