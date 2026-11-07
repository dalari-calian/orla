import { healthResponseSchema, type HealthResponse } from '@orla/contracts'
import { Router } from 'express'

export interface HealthDeps {
  version: string
  timezone: string
  /** Deve lançar erro se o banco não responder. */
  checkDatabase: () => Promise<void>
}

const DB_TIMEOUT_MS = 2000

async function isDatabaseUp(check: () => Promise<void>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function healthRouter(deps: HealthDeps): Router {
  const router = Router()

  router.get('/health', async (_req, res) => {
    const databaseUp = await isDatabaseUp(deps.checkDatabase)
    const body: HealthResponse = healthResponseSchema.parse({
      status: databaseUp ? 'ok' : 'degraded',
      version: deps.version,
      time: new Date().toISOString(),
      timezone: deps.timezone,
      database: databaseUp ? 'up' : 'down',
    })
    res
      .status(databaseUp ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json(body)
  })

  return router
}
