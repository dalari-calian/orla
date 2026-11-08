/**
 * Relatos de bug e sugestões (docs/14): envio, acompanhamento e fila do dono.
 */
import {
  adminFeedbackListResponseSchema,
  feedbackSchema,
  listResponseSchema,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ adminUsernames: ['dono'] })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let owner: Agent
let user: Agent

beforeEach(async () => {
  await resetDatabase()
  owner = (await signUp(app, 'dono')).agent
  user = (await signUp(app, 'usuaria')).agent
})

const report = {
  kind: 'bug',
  title: 'Gráfico some no celular',
  description: 'Na tela de proventos o gráfico não aparece em 375px.',
  page: '/carteira/proventos',
  context: { appVersion: '0.5.0', viewport: '375x812', theme: 'dark' },
}

describe('relatos', () => {
  it('me diz quem é dono', async () => {
    expect((await owner.get('/api/v1/auth/me')).body.isAdmin).toBe(true)
    expect((await user.get('/api/v1/auth/me')).body.isAdmin).toBe(false)
  })

  it('usuário envia, acompanha e retira enquanto pendente', async () => {
    const created = await user.post('/api/v1/feedback').send(report)
    expect(created.status).toBe(201)
    expect(feedbackSchema.parse(created.body)).toMatchObject({
      status: 'pending',
      kind: 'bug',
      page: '/carteira/proventos',
    })
    expect((await user.post('/api/v1/feedback').send({ kind: 'bug', title: 'x' })).status).toBe(400)
    const mine = listResponseSchema(feedbackSchema).parse(
      (await user.get('/api/v1/feedback/mine')).body,
    ).data
    expect(mine).toHaveLength(1)
    // Outro usuário não vê nem retira.
    expect((await owner.get('/api/v1/feedback/mine')).body.data).toEqual([])
    expect((await owner.delete(`/api/v1/feedback/${created.body.id}`)).status).toBe(404)
    expect((await user.delete(`/api/v1/feedback/${created.body.id}`)).status).toBe(204)
    expect((await user.get('/api/v1/feedback/mine')).body.data).toEqual([])
  })

  it('fila só para o dono; transições validadas e histórico', async () => {
    const id = (await user.post('/api/v1/feedback').send(report)).body.id as string
    await user.post('/api/v1/feedback').send({ ...report, kind: 'improvement', title: 'Modo X' })

    expect((await user.get('/api/v1/admin/feedback')).status).toBe(403)
    expect(
      (await user.patch(`/api/v1/admin/feedback/${id}`).send({ status: 'approved' })).status,
    ).toBe(403)

    const list = adminFeedbackListResponseSchema.parse(
      (await owner.get('/api/v1/admin/feedback')).body,
    )
    expect(list.data).toHaveLength(2)
    expect(list.counts).toMatchObject({ pending: 2, approved: 0 })
    expect(list.data.find((item) => item.id === id)).toMatchObject({
      user: { username: 'usuaria' },
      context: { viewport: '375x812' },
      events: [{ actor: 'user', toStatus: 'pending' }],
    })

    // Pendente não pode ir direto para concluído.
    const skip = await owner.patch(`/api/v1/admin/feedback/${id}`).send({ status: 'done' })
    expect(skip.status).toBe(400)
    expect(skip.body.error.message).toMatch(/pendente para concluído/)

    const approved = await owner
      .patch(`/api/v1/admin/feedback/${id}`)
      .send({ status: 'approved', priority: 'high', ownerNote: 'Corrigir no gráfico de barras' })
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ status: 'approved', priority: 'high', resolvedAt: null })
    expect(approved.body.events.at(-1)).toMatchObject({
      actor: 'owner',
      fromStatus: 'pending',
      toStatus: 'approved',
      note: 'Corrigir no gráfico de barras',
    })

    // Quem enviou vê o status e a nota do dono, mas não as notas internas.
    const mine = (await user.get('/api/v1/feedback/mine')).body.data as Record<string, unknown>[]
    expect(mine.find((item) => item.id === id)).toMatchObject({
      status: 'approved',
      ownerNote: 'Corrigir no gráfico de barras',
    })
    expect(mine[0]).not.toHaveProperty('agentNotes')
    // Já em tratamento: não dá mais para retirar.
    expect((await user.delete(`/api/v1/feedback/${id}`)).status).toBe(409)

    const filtered = (await owner.get('/api/v1/admin/feedback?status=approved')).body
    expect(filtered.data).toHaveLength(1)
    expect(filtered.counts).toMatchObject({ pending: 1, approved: 1 })

    const rejected = await owner.patch(`/api/v1/admin/feedback/${id}`).send({ status: 'rejected' })
    expect(rejected.body.resolvedAt).not.toBeNull()
  })

  it('limite diário de envios', async () => {
    const limited = makeApp({ adminUsernames: [] })
    const spammer = (await signUp(limited, 'muitos')).agent
    for (let i = 0; i < 20; i++) {
      expect((await spammer.post('/api/v1/feedback').send(report)).status).toBe(201)
    }
    expect((await spammer.post('/api/v1/feedback').send(report)).status).toBe(429)
  })
})
