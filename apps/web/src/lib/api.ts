import { apiErrorSchema, healthResponseSchema, type HealthResponse } from '@orla/contracts'
import type { z } from 'zod'

export class ApiRequestError extends Error {
  override name = 'ApiRequestError'

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

/**
 * GET na API validando a resposta com o schema de `@orla/contracts`.
 * `acceptStatus` permite tratar respostas de erro que ainda têm corpo válido (ex.: health 503).
 */
export async function apiGet<T extends z.ZodType>(
  path: string,
  schema: T,
  options: { acceptStatus?: number[]; signal?: AbortSignal } = {},
): Promise<z.infer<T>> {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    signal: options.signal ?? null,
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok && !options.acceptStatus?.includes(response.status)) {
    const parsed = apiErrorSchema.safeParse(body)
    throw new ApiRequestError(
      parsed.success ? parsed.data.error.message : `Erro ${response.status} ao chamar a API`,
      response.status,
      parsed.success ? parsed.data.error.code : undefined,
    )
  }
  return schema.parse(body)
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet('/health', healthResponseSchema, { acceptStatus: [503], signal })
}
