import {
  accountSchema,
  categorySchema,
  creditCardSchema,
  payeeSchema,
  recurringTemplateSchema,
  settingsResponseSchema,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp()
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'dono')).agent
})

const newAccount = (name = 'Nubank') =>
  agent.post('/api/v1/accounts').send({ name, kind: 'checking', color: '#AF52DE' })

describe('contas', () => {
  it('CRUD completo com soft delete e restore', async () => {
    const created = await newAccount()
    expect(created.status).toBe(201)
    const account = accountSchema.parse(created.body)

    const updated = await agent
      .patch(`/api/v1/accounts/${account.id}`)
      .send({ name: 'Nubank PJ', isArchived: true })
    expect(updated.body).toMatchObject({ name: 'Nubank PJ', isArchived: true })

    expect((await agent.delete(`/api/v1/accounts/${account.id}`)).status).toBe(204)
    expect((await agent.get('/api/v1/accounts')).body.data).toEqual([])
    expect((await agent.get(`/api/v1/accounts/${account.id}`)).status).toBe(404)

    const restored = await agent.post(`/api/v1/accounts/${account.id}/restore`)
    expect(restored.status).toBe(200)
    expect((await agent.get('/api/v1/accounts')).body.data).toHaveLength(1)
  })

  it('nome repetido (sem diferenciar maiúsculas) → 409; depois de excluir pode reutilizar', async () => {
    const first = await newAccount('Itaú')
    expect((await newAccount('ITAÚ')).status).toBe(409)
    await agent.delete(`/api/v1/accounts/${first.body.id}`)
    expect((await newAccount('itaú')).status).toBe(201)
    // Restaurar a antiga agora conflitaria com a nova.
    expect((await agent.post(`/api/v1/accounts/${first.body.id}/restore`)).status).toBe(409)
  })

  it('não exclui conta com cartão ativo', async () => {
    const account = await newAccount()
    await agent
      .post('/api/v1/credit-cards')
      .send({ accountId: account.body.id, name: 'Roxinho', closingDay: 3, dueDay: 10 })
    const res = await agent.delete(`/api/v1/accounts/${account.body.id}`)
    expect(res.status).toBe(409)
  })

  it('valida tipo e cor', async () => {
    const res = await agent
      .post('/api/v1/accounts')
      .send({ name: 'X', kind: 'banco', color: 'roxo' })
    expect(res.status).toBe(400)
    const paths = res.body.error.details.fields.map((field: { path: string }) => field.path)
    expect(paths).toEqual(expect.arrayContaining(['kind', 'color']))
  })

  it('ID malformado → 404', async () => {
    expect((await agent.get('/api/v1/accounts/nao-e-uuid')).status).toBe(404)
  })
})

describe('cartões', () => {
  it('cria, edita limite e exclui', async () => {
    const account = await newAccount()
    const created = await agent.post('/api/v1/credit-cards').send({
      accountId: account.body.id,
      name: 'Roxinho',
      closingDay: 3,
      dueDay: 10,
      limitCents: 500000,
    })
    expect(created.status).toBe(201)
    const card = creditCardSchema.parse(created.body)
    expect(card.limitCents).toBe(500000)

    const cleared = await agent
      .patch(`/api/v1/credit-cards/${card.id}`)
      .send({ limitCents: null, dueDay: 15 })
    expect(cleared.body).toMatchObject({ limitCents: null, dueDay: 15 })

    expect((await agent.delete(`/api/v1/credit-cards/${card.id}`)).status).toBe(204)
    expect((await agent.post(`/api/v1/credit-cards/${card.id}/restore`)).status).toBe(200)
  })

  it.each([
    [{ closingDay: 0, dueDay: 10 }],
    [{ closingDay: 32, dueDay: 10 }],
    [{ closingDay: 3, dueDay: 10.5 }],
  ])('dias fora de 1–31 → 400 (%j)', async (days) => {
    const account = await newAccount()
    const res = await agent
      .post('/api/v1/credit-cards')
      .send({ accountId: account.body.id, name: 'X', ...days })
    expect(res.status).toBe(400)
  })

  it('não aceita conta excluída', async () => {
    const account = await newAccount()
    await agent.delete(`/api/v1/accounts/${account.body.id}`)
    const res = await agent
      .post('/api/v1/credit-cards')
      .send({ accountId: account.body.id, name: 'X', closingDay: 1, dueDay: 8 })
    expect(res.status).toBe(400)
  })
})

describe('categorias', () => {
  const create = (body: Record<string, unknown>) =>
    agent
      .post('/api/v1/categories')
      .send({ kind: 'expense', icon: 'gift', color: '#FF9500', ...body })

  it('filtra por tipo', async () => {
    const income = await agent.get('/api/v1/categories?kind=income')
    expect(income.body.data.every((category: { kind: string }) => category.kind === 'income')).toBe(
      true,
    )
    expect((await agent.get('/api/v1/categories?kind=xyz')).status).toBe(400)
  })

  it('subcategoria: só 1 nível e do mesmo tipo', async () => {
    const parent = categorySchema.parse((await create({ name: 'Casa' })).body)
    const child = await create({ name: 'Luz', parentId: parent.id, monthlyBudgetCents: 20000 })
    expect(child.status).toBe(201)
    expect(child.body).toMatchObject({ parentId: parent.id, monthlyBudgetCents: 20000 })

    expect((await create({ name: 'Neto', parentId: child.body.id })).status).toBe(400)
    const income = await agent
      .post('/api/v1/categories')
      .send({ kind: 'income', name: 'Errado', icon: 'gift', color: '#FF9500', parentId: parent.id })
    expect(income.status).toBe(400)
    expect(
      (await agent.patch(`/api/v1/categories/${parent.id}`).send({ parentId: parent.id })).status,
    ).toBe(400)
  })

  it('mesmo nome é permitido em pais diferentes, não no mesmo', async () => {
    const a = (await create({ name: 'Casa' })).body
    const b = (await create({ name: 'Carro' })).body
    expect((await create({ name: 'Seguro', parentId: a.id })).status).toBe(201)
    expect((await create({ name: 'Seguro', parentId: b.id })).status).toBe(201)
    expect((await create({ name: 'seguro', parentId: b.id })).status).toBe(409)
    expect((await create({ name: 'Mercado' })).status).toBe(409) // já existe nas padrão
  })

  it('não exclui categoria com subcategorias; restore exige o pai ativo', async () => {
    const parent = (await create({ name: 'Casa' })).body
    const child = (await create({ name: 'Água', parentId: parent.id })).body
    expect((await agent.delete(`/api/v1/categories/${parent.id}`)).status).toBe(409)

    await agent.delete(`/api/v1/categories/${child.id}`)
    await agent.delete(`/api/v1/categories/${parent.id}`)
    expect((await agent.post(`/api/v1/categories/${child.id}/restore`)).status).toBe(409)
    expect((await agent.post(`/api/v1/categories/${parent.id}/restore`)).status).toBe(200)
    expect((await agent.post(`/api/v1/categories/${child.id}/restore`)).status).toBe(200)
  })

  it('ícone fora do catálogo → 400', async () => {
    expect((await create({ name: 'X', icon: 'foguete' })).status).toBe(400)
  })
})

describe('estabelecimentos', () => {
  it('cria com categoria padrão, busca e não repete nome', async () => {
    const categories = await agent.get('/api/v1/categories?kind=expense')
    const mercado = categories.body.data.find(
      (category: { name: string }) => category.name === 'Mercado',
    )

    const created = await agent
      .post('/api/v1/payees')
      .send({ name: 'Zaffari', defaultCategoryId: mercado.id })
    expect(created.status).toBe(201)
    expect(payeeSchema.parse(created.body).defaultCategoryId).toBe(mercado.id)

    await agent.post('/api/v1/payees').send({ name: 'Padaria Central' })
    const search = await agent.get('/api/v1/payees?q=zaf')
    expect(search.body.data.map((payee: { name: string }) => payee.name)).toEqual(['Zaffari'])

    expect((await agent.post('/api/v1/payees').send({ name: 'ZAFFARI' })).status).toBe(409)
  })
})

describe('configurações e onboarding', () => {
  it('meta de investimento fixa, percentual e nenhuma', async () => {
    const fixed = await agent
      .patch('/api/v1/me/settings')
      .send({ savingsGoal: { mode: 'fixed', amountCents: 120000 } })
    expect(settingsResponseSchema.parse(fixed.body).savingsGoal).toEqual({
      mode: 'fixed',
      amountCents: 120000,
    })

    const percent = await agent
      .patch('/api/v1/me/settings')
      .send({ savingsGoal: { mode: 'percent', percent: '20.5' } })
    expect(percent.body.savingsGoal).toEqual({ mode: 'percent', percent: '20.5' })

    const none = await agent.patch('/api/v1/me/settings').send({ savingsGoal: { mode: 'none' } })
    expect(none.body.savingsGoal).toEqual({ mode: 'none' })

    const invalid = await agent
      .patch('/api/v1/me/settings')
      .send({ savingsGoal: { mode: 'percent', percent: '120' } })
    expect(invalid.status).toBe(400)
  })

  it('marca o onboarding como concluído e isso aparece no /auth/me', async () => {
    expect((await agent.get('/api/v1/auth/me')).body.onboardingCompleted).toBe(false)
    await agent.patch('/api/v1/me/settings').send({ onboardingCompleted: true, theme: 'dark' })
    expect((await agent.get('/api/v1/auth/me')).body.onboardingCompleted).toBe(true)
    expect((await agent.get('/api/v1/me/settings')).body.theme).toBe('dark')
  })

  it('salário base vira um modelo recorrente de receita fixa mensal', async () => {
    const categories = await agent.get('/api/v1/categories?kind=income')
    const salario = categories.body.data.find(
      (category: { name: string }) => category.name === 'Salário',
    )
    const res = await agent.post('/api/v1/recurring-templates').send({
      description: 'Salário',
      amountCents: 600000,
      dayOfMonth: 5,
      startMonth: '2026-11',
      categoryId: salario.id,
    })
    expect(res.status).toBe(201)
    expect(recurringTemplateSchema.parse(res.body)).toMatchObject({
      type: 'income',
      nature: 'fixed',
      frequency: 'monthly',
      amountCents: 600000,
      startMonth: '2026-11',
      endMonth: null,
    })

    const expenseCategory = (await agent.get('/api/v1/categories?kind=expense')).body.data[0]
    const wrongKind = await agent.post('/api/v1/recurring-templates').send({
      description: 'X',
      amountCents: 1,
      dayOfMonth: 5,
      startMonth: '2026-11',
      categoryId: expenseCategory.id,
    })
    expect(wrongKind.status).toBe(400)

    const zero = await agent
      .post('/api/v1/recurring-templates')
      .send({ description: 'X', amountCents: 0, dayOfMonth: 5, startMonth: '2026-11' })
    expect(zero.status).toBe(400)
  })
})
