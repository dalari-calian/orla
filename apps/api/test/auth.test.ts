import { meResponseSchema } from '@orla/contracts'
import { DEFAULT_CATEGORIES } from '@orla/core'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { INVITE_CODE, PASSWORD, makeApp, resetDatabase, signUp, testPrisma } from './support/app.ts'

const app = makeApp()

beforeEach(resetDatabase)

/** Extrai o valor de um cookie do header Set-Cookie. */
function cookieValue(setCookie: string[] | string | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  const line = list.find((cookie) => cookie.startsWith(`${name}=`))
  return line?.split(';')[0]?.slice(name.length + 1)
}

describe('cadastro', () => {
  it('cria usuário, settings e as categorias padrão (RF-60), já logado', async () => {
    const agent = request.agent(app)
    const res = await agent.post('/api/v1/auth/register').send({
      username: 'Calian',
      password: PASSWORD,
      inviteCode: INVITE_CODE,
      displayName: 'Calian',
    })

    expect(res.status).toBe(201)
    const me = meResponseSchema.parse(res.body)
    expect(me).toMatchObject({
      username: 'calian',
      displayName: 'Calian',
      onboardingCompleted: false,
    })

    const setCookie = res.headers['set-cookie'] as unknown as string[]
    expect(setCookie.join(';')).toMatch(/orla_at=.*HttpOnly/)
    expect(setCookie.join(';')).toMatch(/orla_rt=.*Path=\/api\/v1\/auth/)

    const categories = await agent.get('/api/v1/categories')
    expect(categories.body.data).toHaveLength(DEFAULT_CATEGORIES.length)

    const settings = await agent.get('/api/v1/me/settings')
    expect(settings.body).toMatchObject({
      savingsGoal: { mode: 'none' },
      onboardingCompleted: false,
    })
  })

  it('exige o código de convite certo', async () => {
    const base = { username: 'fulano', password: PASSWORD }
    const semCodigo = await request(app).post('/api/v1/auth/register').send(base)
    const errado = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...base, inviteCode: 'x' })
    expect(semCodigo.status).toBe(403)
    expect(errado.status).toBe(403)
    expect(errado.body.error.code).toBe('FORBIDDEN')
  })

  it('cadastro aberto não pede convite; fechado recusa', async () => {
    const open = makeApp({ signupMode: 'open' })
    const closed = makeApp({ signupMode: 'closed' })
    const body = { username: 'aberto', password: PASSWORD }

    expect((await request(open).get('/api/v1/auth/config')).body).toEqual({ signupMode: 'open' })
    expect((await request(open).post('/api/v1/auth/register').send(body)).status).toBe(201)
    expect(
      (
        await request(closed)
          .post('/api/v1/auth/register')
          .send({ ...body, username: 'fechado' })
      ).status,
    ).toBe(403)
  })

  it('username único sem diferenciar maiúsculas', async () => {
    await signUp(app, 'repetido')
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'REPETIDO', password: PASSWORD, inviteCode: INVITE_CODE })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it.each([
    [{ username: 'ab', password: PASSWORD }, 'username curto'],
    [{ username: 'com espaço', password: PASSWORD }, 'caractere inválido'],
    [{ username: 'valido', password: '1234567' }, 'senha curta'],
  ])('valida os campos (%j — %s)', async (body) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, inviteCode: INVITE_CODE })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
    expect(res.body.error.details.fields.length).toBeGreaterThan(0)
  })
})

describe('login', () => {
  it('entra com usuário e senha (sem diferenciar maiúsculas no usuário)', async () => {
    await signUp(app, 'maria')
    const agent = request.agent(app)
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'Maria', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('maria')
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200)
  })

  it('senha errada e usuário inexistente dão a mesma resposta', async () => {
    await signUp(app, 'joao')
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'joao', password: 'errada-123' })
    const missing = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'ninguem', password: 'errada-123' })
    expect(wrong.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(wrong.body.error.message).toBe(missing.body.error.message)
  })

  it('rate limit: 5 tentativas por minuto por IP + usuário (RNF-22)', async () => {
    const limited = makeApp()
    await signUp(limited, 'alvo')
    const attempt = () =>
      request(limited).post('/api/v1/auth/login').send({ username: 'alvo', password: 'errada-123' })
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401)
    const sixth = await attempt()
    expect(sixth.status).toBe(429)
    expect(sixth.body.error.code).toBe('RATE_LIMITED')
  })
})

describe('sessão', () => {
  it('sem cookie, rotas protegidas dão 401', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401)
    expect((await request(app).get('/api/v1/accounts')).status).toBe(401)
  })

  it('aceita Authorization: Bearer (app nativo/bot)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'bearer', password: PASSWORD, inviteCode: INVITE_CODE })
    const token = cookieValue(res.headers['set-cookie'], 'orla_at')
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(200)
  })

  it('token adulterado é recusado', async () => {
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', 'orla_at=abc.def.ghi')
    expect(me.status).toBe(401)
  })

  it('refresh rotaciona o token; reusar o antigo revoga todas as sessões', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'rotacao', password: PASSWORD, inviteCode: INVITE_CODE })
    const firstRefresh = cookieValue(register.headers['set-cookie'], 'orla_rt')

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `orla_rt=${firstRefresh}`)
    expect(refreshed.status).toBe(200)
    const secondRefresh = cookieValue(refreshed.headers['set-cookie'], 'orla_rt')
    expect(secondRefresh).toBeTruthy()
    expect(secondRefresh).not.toBe(firstRefresh)

    // Simula o reuso do token antigo depois da janela de tolerância.
    await testPrisma().session.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    })
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `orla_rt=${firstRefresh}`)
    expect(reuse.status).toBe(401)

    const afterTheft = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `orla_rt=${secondRefresh}`)
    expect(afterTheft.status).toBe(401)
  })

  it('refresh sem cookie ou com token desconhecido → 401', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401)
    const unknown = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'orla_rt=desconhecido')
    expect(unknown.status).toBe(401)
  })

  it('logout revoga o refresh token', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'saindo', password: PASSWORD, inviteCode: INVITE_CODE })
    const refresh = cookieValue(register.headers['set-cookie'], 'orla_rt')

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `orla_rt=${refresh}`)
    expect(logout.status).toBe(204)
    const after = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `orla_rt=${refresh}`)
    expect(after.status).toBe(401)
  })

  it('atualiza o nome de exibição', async () => {
    const { agent } = await signUp(app, 'perfil')
    const res = await agent.patch('/api/v1/auth/me').send({ displayName: 'Novo Nome' })
    expect(res.body.displayName).toBe('Novo Nome')
  })
})

describe('CSRF (RNF-20)', () => {
  it('escrita com Origin de outro site é recusada', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://site-malicioso.com')
      .send({ username: 'x', password: 'y' })
    expect(res.status).toBe(403)
  })

  it('escrita com a Origin do front passa', async () => {
    await signUp(app, 'origem')
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ username: 'origem', password: PASSWORD })
    expect(res.status).toBe(200)
  })
})
