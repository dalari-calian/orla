import { z } from 'zod'

/** Formato padrão de erro de todos os endpoints (docs/11-api.md). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type ApiError = z.infer<typeof apiErrorSchema>
