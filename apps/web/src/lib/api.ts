import { apiErrorSchema, healthResponseSchema, type HealthResponse } from '@orla/contracts'
import type { z } from 'zod'

export class ApiRequestError extends Error {
  override name = 'ApiRequestError'

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** Erros por campo vindos da API (`details.fields`). */
    readonly fields: { path: string; message: string }[] = [],
  ) {
    super(message)
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  body?: unknown
  signal?: AbortSignal
  /** Status de erro que ainda têm corpo válido para o schema (ex.: health 503). */
  acceptStatus?: number[]
}

/** Avisado quando a sessão expira de vez (refresh falhou) — o app volta para o login. */
let onSessionExpired: () => void = () => {}
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

/** Um refresh por vez, mesmo com várias requisições recebendo 401 juntas. */
let refreshing: Promise<boolean> | null = null
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function send(method: Method, path: string, options: RequestOptions): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? null : JSON.stringify(options.body),
    signal: options.signal ?? null,
  })
}

async function toError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = apiErrorSchema.safeParse(body)
  if (!parsed.success) {
    return new ApiRequestError(`Erro ${response.status} ao falar com o servidor`, response.status)
  }
  const details = parsed.data.error.details as
    { fields?: { path: string; message: string }[] } | undefined
  return new ApiRequestError(
    parsed.data.error.message,
    response.status,
    parsed.data.error.code,
    details?.fields ?? [],
  )
}

/**
 * Chamada à API validando a resposta com o schema de `@orla/contracts`.
 * Em 401, tenta renovar a sessão uma vez (refresh token) e repete a chamada.
 */
export async function apiRequest<T extends z.ZodType>(
  method: Method,
  path: string,
  schema: T,
  options: RequestOptions = {},
): Promise<z.infer<T>> {
  let response = await send(method, path, options)

  const isAuthRoute = path.startsWith('/auth/')
  if (response.status === 401 && !isAuthRoute) {
    // Mesmo se o refresh "falhar", outra aba pode ter renovado os cookies: tenta de novo uma vez.
    await refreshSession()
    response = await send(method, path, options)
    if (response.status === 401) onSessionExpired()
  }

  if (!response.ok && !options.acceptStatus?.includes(response.status))
    throw await toError(response)
  if (response.status === 204) return schema.parse(undefined)
  return schema.parse(await response.json())
}

export const api = {
  get: <T extends z.ZodType>(path: string, schema: T, signal?: AbortSignal) =>
    apiRequest('GET', path, schema, { signal }),
  post: <T extends z.ZodType>(path: string, schema: T, body?: unknown) =>
    apiRequest('POST', path, schema, { body: body ?? {} }),
  put: <T extends z.ZodType>(path: string, schema: T, body: unknown) =>
    apiRequest('PUT', path, schema, { body }),
  patch: <T extends z.ZodType>(path: string, schema: T, body: unknown) =>
    apiRequest('PATCH', path, schema, { body }),
  delete: <T extends z.ZodType>(path: string, schema: T) => apiRequest('DELETE', path, schema),
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest('GET', '/health', healthResponseSchema, { acceptStatus: [503], signal })
}

/** Mensagem amigável para qualquer erro (para toasts e estados de erro). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof TypeError) return 'Sem conexão com o servidor. Verifique sua internet.'
  return 'Algo deu errado. Tente de novo.'
}
