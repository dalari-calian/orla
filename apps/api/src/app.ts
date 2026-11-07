import express, { type Express } from 'express'
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts'
import { securityHeaders } from './middleware/security-headers.ts'
import { healthRouter, type HealthDeps } from './routes/health.ts'

export type AppDeps = HealthDeps

/** Monta o app Express. Dependências injetadas para facilitar testes (sem banco). */
export function createApp(deps: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(securityHeaders)
  app.use(express.json({ limit: '1mb' }))

  const v1 = express.Router()
  v1.use(healthRouter(deps))
  app.use('/api/v1', v1)

  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
