import { healthResponseSchema } from '@orla/contracts'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'

const baseDeps = { version: '1.2.3', timezone: 'America/Sao_Paulo' }

describe('GET /api/v1/health', () => {
  it('200 e status ok quando o banco responde', async () => {
    const app = createApp({ ...baseDeps, checkDatabase: async () => {} })
    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(200)
    const body = healthResponseSchema.parse(res.body)
    expect(body).toMatchObject({ status: 'ok', database: 'up', version: '1.2.3' })
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('503 e status degraded quando o banco falha', async () => {
    const app = createApp({
      ...baseDeps,
      checkDatabase: async () => {
        throw new Error('connection refused')
      },
    })
    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'degraded', database: 'down' })
  })
})

describe('rotas desconhecidas', () => {
  it('404 com o formato padrão de erro', async () => {
    const app = createApp({ ...baseDeps, checkDatabase: async () => {} })
    const res = await request(app).get('/api/v1/nao-existe')

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
