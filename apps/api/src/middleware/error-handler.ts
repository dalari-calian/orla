import type { ApiError } from '@orla/contracts'
import type { ErrorRequestHandler, RequestHandler } from 'express'

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiError = {
    error: { code: 'NOT_FOUND', message: `Rota não encontrada: ${req.method} ${req.originalUrl}` },
  }
  res.status(404).json(body)
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  // RNF-25: não logar valores/descrições — só o erro.
  console.error(error)
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Erro interno do servidor' } }
  res.status(500).json(body)
}
