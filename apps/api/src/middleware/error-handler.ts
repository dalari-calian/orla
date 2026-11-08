import { CompetenceMonthError, InstallmentError, MoneyError } from '@orla/core'
import type { ApiError } from '@orla/contracts'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { AppError } from '../lib/errors.ts'

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiError = {
    error: { code: 'NOT_FOUND', message: `Rota não encontrada: ${req.method} ${req.originalUrl}` },
  }
  res.status(404).json(body)
}

/** Erros que o próprio Express/body-parser gera (JSON malformado, corpo grande demais). */
function isHttpError(error: unknown): error is { status: number; type?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  )
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    const body: ApiError = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
    }
    res.status(error.status).json(body)
    return
  }

  // Regras do core recusaram a entrada (ex.: parcela menor que R$ 0,01): erro do cliente.
  if (
    error instanceof InstallmentError ||
    error instanceof MoneyError ||
    error instanceof CompetenceMonthError
  ) {
    const body: ApiError = { error: { code: 'VALIDATION', message: error.message } }
    res.status(400).json(body)
    return
  }

  if (isHttpError(error)) {
    const message =
      error.type === 'entity.too.large' ? 'Requisição grande demais' : 'Requisição inválida'
    const body: ApiError = { error: { code: 'VALIDATION', message } }
    res.status(error.status).json(body)
    return
  }

  // RNF-25: não logar valores/descrições — só o erro.
  console.error(error)
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Erro interno do servidor' } }
  res.status(500).json(body)
}
