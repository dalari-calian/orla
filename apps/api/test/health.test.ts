import { healthResponseSchema } from '@orla/contracts'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { makeApp } from './support/app.ts'

describe('GET /api/v1/health', () => {
  it('200 e status ok quando o banco responde', async () => {
    const res = await request(makeApp()).get('/api/v1/health')

    expect(res.status).toBe(200)
    const body = healthResponseSchema.parse(res.body)
    expect(body).toMatchObject({ status: 'ok', database: 'up', version: 'test' })
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('503 e status degraded quando o banco falha', async () => {
    const app = makeApp({
      checkDatabase: async () => {
        throw new Error('connection refused')
      },
    })
    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'degraded', database: 'down' })
  })
})

describe('rotas desconhecidas e erros', () => {
  it('fora de /api/v1 → 404 no formato padrão', async () => {
    const res = await request(makeApp()).get('/api/v2/qualquer')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('dentro de /api/v1 sem sessão → 401 (não revela se a rota existe)', async () => {
    const res = await request(makeApp()).get('/api/v1/nao-existe')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('JSON malformado → 400 VALIDATION', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })
})
