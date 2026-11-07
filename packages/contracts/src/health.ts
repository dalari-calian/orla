import { z } from 'zod'

/** GET /api/v1/health */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  time: z.iso.datetime(),
  timezone: z.string(),
  database: z.enum(['up', 'down']),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
