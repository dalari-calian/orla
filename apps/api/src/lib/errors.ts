/** Códigos de erro do docs/11 (+ FORBIDDEN e INTERNAL). */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INTERNAL'

/** Erro esperado da API: vira `{ error: { code, message, details? } }` com o status certo. */
export class AppError extends Error {
  override name = 'AppError'

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const validationError = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION', message, details)
export const unauthorized = (message = 'Faça login para continuar') =>
  new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message: string) => new AppError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Não encontrado') => new AppError(404, 'NOT_FOUND', message)
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message)
export const rateLimited = (message = 'Muitas tentativas. Aguarde um minuto e tente de novo.') =>
  new AppError(429, 'RATE_LIMITED', message)
